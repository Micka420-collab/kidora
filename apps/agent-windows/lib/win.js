// Windows OS integration: foreground sensor, process control, hosts file,
// workstation lock, notifications. Pure Node + PowerShell (no native deps).
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { log } from "./logger.js";
import { overlayStatePath } from "./paths.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SENSOR = join(__dirname, "..", "sensor.ps1"); // scripts stay in the install dir
const OVERLAY = join(__dirname, "..", "overlay.ps1");
const OVERLAY_STATE = overlayStatePath(); // runtime state → writable data dir
let overlayProc = null;
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

/**
 * Persistent sensor: calls onSample({ fg, procs, ts }) every interval.
 * Self-healing: if the PowerShell sensor subprocess dies (e.g. the child kills
 * it), it is automatically respawned so the agent never goes blind. Returns a
 * handle with stop() to end it deliberately.
 */
export function startSensor(intervalSec, onSample) {
  let proc = null;
  let stopped = false;

  function spawnOnce() {
    const p = spawn("powershell", [...PS, "-File", SENSOR, String(intervalSec)], { windowsHide: true });
    proc = p;
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
    p.on("close", (code) => {
      if (stopped) return;
      log.warn(`sensor stopped (code ${code}) — redémarrage dans 2s`);
      setTimeout(() => { if (!stopped) spawnOnce(); }, 2000);
    });
  }

  spawnOnce();
  return {
    stop() {
      stopped = true;
      try { proc?.kill(); } catch { /* ignore */ }
    },
  };
}

/** Kill all processes whose name matches (case-insensitive, no extension). */
export async function killProcess(name) {
  const clean = name.replace(/\.exe$/i, "");
  await runPS(`Stop-Process -Name '${clean.replace(/'/g, "")}' -Force -ErrorAction SilentlyContinue`);
}

export async function lockWorkstation() {
  await runPS("rundll32.exe user32.dll,LockWorkStation");
}

/**
 * Show the fullscreen block overlay (soft block — keeps the session, unlike
 * LockWorkStation). Idempotent: updates the message if already shown. The
 * overlay self-closes when the state file becomes inactive (see hideOverlay).
 */
export function showOverlay(title, message) {
  try {
    writeFileSync(OVERLAY_STATE, JSON.stringify({ active: true, title, message }), "utf8");
  } catch {
    /* best-effort */
  }
  // Already running? the overlay polls the state file and picks up the new text.
  if (overlayProc && overlayProc.exitCode === null && !overlayProc.killed) return;
  const p = spawn("powershell", [...PS, "-File", OVERLAY, "-StateFile", OVERLAY_STATE], { windowsHide: false });
  overlayProc = p;
  p.on("close", () => { if (overlayProc === p) overlayProc = null; });
  p.on("error", () => { if (overlayProc === p) overlayProc = null; });
}

/**
 * Remove the block overlay. Node's child.kill() is unreliable on a GUI
 * PowerShell process, so we kill by command-line match via PowerShell — which
 * also clears an overlay orphaned by a previously-crashed agent instance.
 * `$PID` is excluded so the sweep never kills itself.
 */
export function hideOverlay() {
  try {
    writeFileSync(OVERLAY_STATE, JSON.stringify({ active: false }), "utf8");
  } catch {
    /* best-effort */
  }
  overlayProc = null;
  runPS(
    "Get-WmiObject Win32_Process | Where-Object { $_.CommandLine -match 'overlay\\.ps1' -and $_.ProcessId -ne $PID } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }",
  );
  try { unlinkSync(OVERLAY_STATE); } catch { /* ignore */ }
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

/**
 * Best-effort read of the foreground browser's address bar via UIAutomation.
 * Used to recover a video's URL (and thus its YouTube id / thumbnail) since the
 * window title only carries the page title. Returns "" if it can't be read.
 */
export async function getForegroundBrowserUrl() {
  const script = [
    "$ErrorActionPreference='SilentlyContinue'",
    "Add-Type -AssemblyName UIAutomationClient,UIAutomationTypes",
    "Add-Type 'using System;using System.Runtime.InteropServices;public class FgW{[DllImport(\"user32.dll\")]public static extern IntPtr GetForegroundWindow();}'",
    "$h=[FgW]::GetForegroundWindow()",
    "$el=[System.Windows.Automation.AutomationElement]::FromHandle($h)",
    "$cond=New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty,[System.Windows.Automation.ControlType]::Edit)",
    "$edit=$el.FindFirst([System.Windows.Automation.TreeScope]::Descendants,$cond)",
    "if($edit){$v=$edit.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).Current.Value; if($v){Write-Output $v}}",
  ].join("; ");
  const out = (await runPS(script)).trim();
  return out;
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
    // apex + the common bypass subdomains (a flat hosts list can't do the DNS
    // proxy's suffix matching, so cover the frequent www./m. mobile bypasses).
    lines.push(`127.0.0.1 ${dom}`);
    lines.push(`127.0.0.1 www.${dom}`);
    lines.push(`127.0.0.1 m.${dom}`);
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

/** Point every active physical adapter at the local DNS proxy. Needs admin. */
export async function setSystemDns(server = "127.0.0.1") {
  await runPS(
    `Get-NetAdapter -Physical | Where-Object { $_.Status -eq 'Up' } | Set-DnsClientServerAddress -ServerAddresses '${server}'`,
  );
  await runPS("ipconfig /flushdns");
}

/** Revert adapters to their automatic (DHCP) DNS. Needs admin. */
export async function restoreSystemDns() {
  await runPS(
    "Get-NetAdapter -Physical | Where-Object { $_.Status -eq 'Up' } | Set-DnsClientServerAddress -ResetServerAddresses",
  );
  await runPS("ipconfig /flushdns");
}

export { HOSTS };
