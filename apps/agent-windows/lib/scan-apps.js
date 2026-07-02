// Enumerates installed desktop AND Microsoft Store (UWP) apps, so the agent can
// report the full app inventory to the server on startup. The parent then sees
// every installed app in the dashboard (ready to allow/block/limit) without
// waiting for the child to open it.
//
//   • Desktop apps come from the registry Uninstall hives (DisplayIcon → exe).
//   • Store/UWP apps (Netflix, WhatsApp, Spotify, Xbox games, Films & TV…) are
//     invisible to the registry scan; they come from Get-StartApps ∩ Get-AppxPackage
//     (Start-menu-visible packages only → friendly name + real executable). This
//     matters because the child's most-used apps are increasingly Store apps, and
//     without a rule for them the parent can't block them at all.
import { execFileSync } from "node:child_process";
import { SYSTEM_PROCS } from "./categorize.js";

// One PowerShell pass emitting { name, exe } rows from BOTH sources as a single
// JSON array. `exe` is a path (desktop) or a bare filename (UWP) — the JS below
// reduces either to the lowercase exe basename used to match running processes.
const PS = [
  "$ErrorActionPreference='SilentlyContinue';",
  "$rows=New-Object System.Collections.ArrayList;",
  // ── Desktop apps: registry Uninstall hives ──
  "$p=@('HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',",
  "'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',",
  "'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*');",
  "Get-ItemProperty $p |",
  "Where-Object { $_.DisplayName -and -not $_.SystemComponent -and -not $_.ReleaseType } |",
  "ForEach-Object { $i=''; if($_.DisplayIcon){ $i=($_.DisplayIcon -split ',')[0] };",
  "[void]$rows.Add([PSCustomObject]@{ name=$_.DisplayName; exe=$i }) };",
  // ── Store/UWP apps: Start-menu-visible packages, resolve the executable ──
  "$start=@{};",
  "foreach($s in (Get-StartApps)){ if($s.AppID -match '!'){ $f=$s.AppID.Split('!')[0]; if(-not $start.ContainsKey($f)){ $start[$f]=$s.Name } } };",
  "foreach($pkg in (Get-AppxPackage | Where-Object { -not $_.IsFramework -and $_.SignatureKind -ne 'System' })){",
  "  if(-not $start.ContainsKey($pkg.PackageFamilyName)){ continue };",
  "  $mf=Join-Path $pkg.InstallLocation 'AppxManifest.xml'; if(-not (Test-Path $mf)){ continue };",
  "  try { [xml]$x=Get-Content $mf -Raw; $a=$x.Package.Applications.Application; if($a -is [array]){ $a=$a[0] };",
  "    $exe=$a.Executable; if($exe){ [void]$rows.Add([PSCustomObject]@{ name=$start[$pkg.PackageFamilyName]; exe=($exe -split '\\\\')[-1] }) } } catch {} };",
  "$rows | ConvertTo-Json -Compress",
].join(" ");

// Extra UWP system utilities that are Start-visible but aren't apps a parent
// would manage (kept small — over-listing is low-harm, these are just noise).
const UWP_NOISE = new Set([
  "sechealthui", "gethelp", "gamebar", "mixedrealityportal",
  "windowsadvancedsettings", "nvcplui", "systemsettings", "windowscamera",
]);

/**
 * Return [{ appId, appName }] for installed desktop + Store apps (deduped by exe,
 * capped). appId is the lowercase exe basename (e.g. "chrome.exe", "video.ui.exe")
 * so it matches the process names the tracker/enforcer use — a scanned app can be
 * blocked directly.
 */
export function scanInstalledApps(max = 500) {
  let raw;
  try {
    raw = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", PS], {
      encoding: "utf8",
      timeout: 60000,
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
    if (UWP_NOISE.has(bare)) continue; // Store system utility, not a manageable app
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
