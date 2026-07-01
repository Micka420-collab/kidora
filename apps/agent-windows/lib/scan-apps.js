// Enumerates installed desktop apps (display name + main exe) from the Windows
// registry Uninstall keys, so the agent can report the full app inventory to the
// server on startup. The parent then sees every installed app in the dashboard
// (ready to allow/block/limit) without waiting for the child to open it.
import { execFileSync } from "node:child_process";
import { SYSTEM_PROCS } from "./categorize.js";

// One PowerShell pass over the machine + user Uninstall hives. Skips system
// components / OS updates; emits { name, exe } where exe is DisplayIcon's path.
const PS = [
  "$ErrorActionPreference='SilentlyContinue';",
  "$p=@('HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',",
  "'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',",
  "'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*');",
  "Get-ItemProperty $p |",
  "Where-Object { $_.DisplayName -and -not $_.SystemComponent -and -not $_.ReleaseType } |",
  "ForEach-Object { $i=''; if($_.DisplayIcon){ $i=($_.DisplayIcon -split ',')[0] };",
  "[PSCustomObject]@{ name=$_.DisplayName; exe=$i } } | ConvertTo-Json -Compress",
].join(" ");

/**
 * Return [{ appId, appName }] for installed desktop apps (deduped by exe, capped).
 * appId is the lowercase exe basename (e.g. "chrome.exe") so it matches the
 * process names the tracker/enforcer use — a scanned app can be blocked directly.
 */
export function scanInstalledApps(max = 400) {
  let raw;
  try {
    raw = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", PS], {
      encoding: "utf8",
      timeout: 40000,
      maxBuffer: 16 * 1024 * 1024,
      windowsHide: true,
    });
  } catch {
    return [];
  }
  let arr;
  try {
    arr = JSON.parse(raw || "[]");
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) arr = arr ? [arr] : [];

  const seen = new Set();
  const out = [];
  for (const a of arr) {
    if (!a || !a.name) continue;
    const icon = String(a.exe || "").replace(/^"|"$/g, "").trim();
    const m = icon.match(/([^\\/]+\.exe)$/i);
    if (!m) continue; // no runnable exe → can't match/block it, skip
    const appId = m[1].toLowerCase();
    const bare = appId.replace(/\.exe$/i, "");
    if (seen.has(appId)) continue;
    if (SYSTEM_PROCS.has(bare)) continue; // system process, not a user app
    // skip installers / uninstallers / updaters / runtimes / helpers (prefix or
    // suffix match) — they aren't real user-facing apps a parent would manage.
    if (/^(unins|setup|update|install|vc_?redist|vcredist|dotnet|python|crashpad|maintenanceservice)/i.test(bare)) continue;
    if (/_?helper$|_?updater$|node$/i.test(bare)) continue;
    seen.add(appId);
    out.push({ appId, appName: String(a.name).slice(0, 120) });
    if (out.length >= max) break;
  }
  return out;
}
