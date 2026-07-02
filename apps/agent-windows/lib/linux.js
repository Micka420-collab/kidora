// Linux OS integration — the counterpart to win.js. Same exported interface, so
// the platform-agnostic core (tracker, enforcer, policy, updater…) runs
// unchanged via lib/os.js. Uses standard Linux tools with graceful fallbacks;
// anything unavailable degrades to a no-op rather than crashing the agent.
import { spawn, spawnSync, execFile } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, unlinkSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { log } from "./logger.js";

const IS_LINUX = process.platform !== "win32";
const HOSTS = "/etc/hosts";
const MARK_START = "# >>> KIDORA START (géré automatiquement, ne pas éditer)";
const MARK_END = "# <<< KIDORA END";

/** True if a command exists on PATH (checked once at load, Linux only). */
function hasCmd(cmd) {
  if (!IS_LINUX) return false;
  try {
    return spawnSync("sh", ["-c", `command -v ${cmd}`], { stdio: "ignore" }).status === 0;
  } catch {
    return false;
  }
}

const HAS_XDOTOOL = hasCmd("xdotool");
const HAS_NOTIFY = hasCmd("notify-send");
const OVERLAY_TOOL = hasCmd("zenity") ? "zenity" : hasCmd("yad") ? "yad" : null;
const SHOT_TOOL = hasCmd("scrot") ? "scrot" : hasCmd("gnome-screenshot") ? "gnome-screenshot" : hasCmd("import") ? "import" : null;

/** Promise wrapper around execFile → trimmed stdout ("" on error). */
function runCmd(cmd, args = []) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 5000 }, (err, stdout) => resolve(err ? "" : String(stdout).trim()));
  });
}

/** Lowercased basenames of running processes (deduped). */
async function listProcs() {
  const out = await runCmd("ps", ["-eo", "comm="]);
  const set = new Set();
  for (const line of out.split("\n")) {
    const name = line.trim().toLowerCase();
    if (name) set.add(name);
  }
  return [...set];
}

/** Foreground app via xdotool (X11). Null on Wayland / no xdotool. */
async function foregroundApp() {
  if (!HAS_XDOTOOL) return null;
  try {
    const pid = (await runCmd("xdotool", ["getactivewindow", "getwindowpid"])).trim();
    if (!pid) return null;
    const comm = (await runCmd("ps", ["-p", pid, "-o", "comm="])).trim();
    const title = (await runCmd("xdotool", ["getactivewindow", "getwindowname"])).trim();
    return comm ? { name: comm.toLowerCase(), procId: Number(pid) || 0, title } : null;
  } catch {
    return null;
  }
}

export function startSensor(intervalSec, onSample) {
  let stopped = false;
  async function sample() {
    if (stopped) return;
    try {
      const [procs, fg] = await Promise.all([listProcs(), foregroundApp()]);
      onSample({ fg, procs });
    } catch {
      /* skip a bad sample */
    }
  }
  sample();
  const timer = setInterval(sample, intervalSec * 1000);
  return {
    stop() {
      stopped = true;
      clearInterval(timer);
    },
  };
}

/** Kill processes whose name matches (exact, extension stripped). */
export async function killProcess(name) {
  const clean = name.replace(/\.exe$/i, "");
  await runCmd("pkill", ["-x", clean]); // non-zero when nothing matched → ignored
}

export async function lockWorkstation() {
  if (await runCmd("loginctl", ["lock-session"])) return;
  if (hasCmd("xdg-screensaver")) await runCmd("xdg-screensaver", ["lock"]);
}

let overlayProc = null;

/** Fullscreen block message (best-effort, soft block). Falls back to a toast. */
export function showOverlay(title, message) {
  if (overlayProc && overlayProc.exitCode === null && !overlayProc.killed) return;
  if (!OVERLAY_TOOL) {
    notify(title, message);
    return;
  }
  const args =
    OVERLAY_TOOL === "zenity"
      ? ["--info", "--title", title, "--text", message, "--width=600"]
      : ["--title", title, "--text", message, "--button=OK", "--fullscreen", "--no-escape"];
  try {
    const p = spawn(OVERLAY_TOOL, args, { stdio: "ignore" });
    overlayProc = p;
    p.on("close", () => { if (overlayProc === p) overlayProc = null; });
    p.on("error", () => { if (overlayProc === p) overlayProc = null; });
  } catch {
    notify(title, message);
  }
}

export function hideOverlay() {
  try { overlayProc?.kill(); } catch { /* ignore */ }
  overlayProc = null;
}

export async function notify(title, message) {
  if (!HAS_NOTIFY) return;
  await runCmd("notify-send", [String(title), String(message)]);
}

export async function getBattery() {
  try {
    const base = "/sys/class/power_supply";
    const bat = readdirSync(base).find((d) => /^BAT/i.test(d));
    if (!bat) return null;
    const n = parseInt(readFileSync(join(base, bat, "capacity"), "utf8"), 10);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/** URL recovery from the browser isn't portable on Linux — best-effort empty. */
export async function getForegroundBrowserUrl() {
  return "";
}

/** Capture the screen as base64 JPEG (no data-URL prefix), or null. */
export function captureScreen() {
  return new Promise((resolve) => {
    if (!SHOT_TOOL) return resolve(null);
    const tmp = `/tmp/kidora-shot-${process.pid}.jpg`;
    const args =
      SHOT_TOOL === "scrot" ? ["-o", tmp] : SHOT_TOOL === "gnome-screenshot" ? ["-f", tmp] : ["-window", "root", tmp];
    execFile(SHOT_TOOL, args, { timeout: 8000 }, (err) => {
      if (err) return resolve(null);
      try {
        const b64 = readFileSync(tmp).toString("base64");
        try { unlinkSync(tmp); } catch { /* ignore */ }
        resolve(b64 || null);
      } catch {
        resolve(null);
      }
    });
  });
}

export async function isAdmin() {
  return typeof process.getuid === "function" ? process.getuid() === 0 : false;
}

/** Rewrite the Kidora-managed block section of /etc/hosts. Needs root. */
export function updateHostsFile(domains) {
  let content;
  try {
    content = readFileSync(HOSTS, "utf8");
  } catch {
    return { ok: false, reason: "read" };
  }
  const startIdx = content.indexOf(MARK_START);
  const endIdx = content.indexOf(MARK_END);
  if (startIdx !== -1 && endIdx !== -1) {
    content = content.slice(0, startIdx).replace(/\s+$/, "") + content.slice(endIdx + MARK_END.length);
  }
  const lines = [MARK_START];
  for (const d of domains) {
    const dom = d.replace(/^https?:\/\//, "").replace(/^www\./, "").trim();
    if (!dom) continue;
    lines.push(`127.0.0.1 ${dom}`);
    lines.push(`127.0.0.1 www.${dom}`);
    lines.push(`127.0.0.1 m.${dom}`);
  }
  lines.push(MARK_END);
  const next = content.replace(/\s+$/, "") + "\n\n" + lines.join("\n") + "\n";
  try {
    writeFileSync(HOSTS, next, "utf8");
    if (hasCmd("resolvectl")) execFile("resolvectl", ["flush-caches"], () => {});
    return { ok: true, count: domains.length };
  } catch (e) {
    return { ok: false, reason: "write", error: String(e.message || e) };
  }
}

// v1: Linux filters via /etc/hosts, not the local DNS proxy (redirecting system
// DNS is distro-specific and fragile with systemd-resolved). canRedirectDns()
// tells agent.js to take the hosts path.
export function canRedirectDns() {
  return false;
}
export async function setSystemDns() {
  /* no-op on Linux (see canRedirectDns) */
}
export async function restoreSystemDns() {
  /* no-op on Linux */
}

export { HOSTS };
