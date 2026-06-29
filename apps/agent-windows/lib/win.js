// Windows OS integration: foreground sensor, process control, hosts file,
// workstation lock, notifications. Pure Node + PowerShell (no native deps).
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { log } from "./logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SENSOR = join(__dirname, "..", "sensor.ps1");
const HOSTS = "C:\\Windows\\System32\\drivers\\etc\\hosts";
const MARK_START = "# >>> KIDORA START (géré automatiquement, ne pas éditer)";
const MARK_END = "# <<< KIDORA END";

const PS = ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass"];

/** Run a one-shot PowerShell command, resolve stdout. */
export function runPS(command) {
  return new Promise((resolve) => {
    const p = spawn("powershell", [...PS, "-Command", command], { windowsHide: true });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.on("close", () => resolve(out.trim()));
    p.on("error", () => resolve(""));
  });
}

/** Persistent sensor: calls onSample({ fg, procs, ts }) every interval. */
export function startSensor(intervalSec, onSample) {
  const p = spawn("powershell", [...PS, "-File", SENSOR, String(intervalSec)], { windowsHide: true });
  const rl = createInterface({ input: p.stdout });
  rl.on("line", (line) => {
    line = line.trim();
    if (!line.startsWith("{")) return;
    try {
      const obj = JSON.parse(line);
      if (typeof obj.procs === "string") obj.procs = [obj.procs];
      if (!Array.isArray(obj.procs)) obj.procs = [];
      onSample(obj);
    } catch {
      /* ignore partial lines */
    }
  });
  p.stderr.on("data", (d) => log.warn("sensor:", String(d).trim().slice(0, 120)));
  p.on("close", (code) => log.warn(`sensor stopped (code ${code})`));
  return p;
}

/** Kill all processes whose name matches (case-insensitive, no extension). */
export async function killProcess(name) {
  const clean = name.replace(/\.exe$/i, "");
  await runPS(`Stop-Process -Name '${clean.replace(/'/g, "")}' -Force -ErrorAction SilentlyContinue`);
}

export async function lockWorkstation() {
  await runPS("rundll32.exe user32.dll,LockWorkStation");
}

/** Non-blocking toast/message to the child. */
export async function notify(title, message) {
  const safeT = title.replace(/'/g, "''");
  const safeM = message.replace(/'/g, "''");
  // Fire-and-forget message box in its own process so the agent isn't blocked.
  const script =
    `Add-Type -AssemblyName System.Windows.Forms;` +
    `[System.Windows.Forms.MessageBox]::Show('${safeM}','${safeT}')`;
  spawn("powershell", [...PS, "-Command", script], { windowsHide: true, detached: true }).unref();
}

export async function getBattery() {
  const out = await runPS("(Get-CimInstance Win32_Battery).EstimatedChargePercent");
  const n = parseInt(out, 10);
  return Number.isFinite(n) ? n : null;
}

/** Capture the primary screen, resized, as a base64 JPEG (no data URL prefix). */
export function captureScreen() {
  return new Promise((resolve) => {
    const script = `
$ErrorActionPreference='SilentlyContinue'
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
$b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size)
$ratio = [math]::Min(1.0, 1280.0 / $b.Width)
$nw = [int]($b.Width * $ratio); $nh = [int]($b.Height * $ratio)
$resized = New-Object System.Drawing.Bitmap $nw, $nh
$g2 = [System.Drawing.Graphics]::FromImage($resized)
$g2.DrawImage($bmp, 0, 0, $nw, $nh)
$ms = New-Object System.IO.MemoryStream
$resized.Save($ms, [System.Drawing.Imaging.ImageFormat]::Jpeg)
[Convert]::ToBase64String($ms.ToArray())
`;
    const p = spawn("powershell", [...PS, "-Command", script], { windowsHide: true });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.on("close", () => resolve(out.replace(/\s+/g, "") || null));
    p.on("error", () => resolve(null));
  });
}

export async function isAdmin() {
  const out = await runPS(
    "[bool]([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)",
  );
  return out.toLowerCase() === "true";
}

/** Rewrite the Kidora-managed block section of the hosts file. Needs admin. */
export function updateHostsFile(domains) {
  let content;
  try {
    content = readFileSync(HOSTS, "utf8");
  } catch {
    return { ok: false, reason: "read" };
  }

  // strip any existing Kidora block
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
  }
  lines.push(MARK_END);

  const next = content.replace(/\s+$/, "") + "\n\n" + lines.join("\n") + "\n";
  try {
    writeFileSync(HOSTS, next, "utf8");
    // flush DNS cache so changes take effect immediately
    runPS("ipconfig /flushdns");
    return { ok: true, count: domains.length };
  } catch (e) {
    return { ok: false, reason: "write", error: String(e.message || e) };
  }
}

export { HOSTS };
