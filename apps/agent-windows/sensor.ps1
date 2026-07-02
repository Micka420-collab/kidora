# Kidora sensor — emits one compact JSON line per interval with the
# foreground app, window title, and the list of running process names.
$ErrorActionPreference = "SilentlyContinue"
$OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class KidoraWin {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern int GetWindowThreadProcessId(IntPtr hWnd, out int procId);
  [DllImport("user32.dll", CharSet=CharSet.Auto)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  public delegate bool EnumWindowProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr hWnd, EnumWindowProc callback, IntPtr lParam);

  // A UWP/Store app (Netflix, WhatsApp, Films & TV, Xbox games…) is hosted by
  // ApplicationFrameHost.exe: the FOREGROUND window belongs to the host, while the
  // real app runs in a CHILD window owned by a different process. Return that
  // child's PID so usage/enforcement see the real app, not the system host.
  public static int GetUwpChildPid(IntPtr frame, int frameHostPid) {
    int found = 0;
    EnumChildWindows(frame, (h, l) => {
      int p; GetWindowThreadProcessId(h, out p);
      if (p != 0 && p != frameHostPid) { found = p; return false; }
      return true;
    }, IntPtr.Zero);
    return found;
  }
}
"@

$interval = if ($args[0]) { [int]$args[0] } else { 5 }
# Foreground "host" processes that are never the app the child actually sees —
# resolve through them to the real app underneath.
$frameHosts = @('ApplicationFrameHost')

while ($true) {
  $h = [KidoraWin]::GetForegroundWindow()
  $procId = 0
  [void][KidoraWin]::GetWindowThreadProcessId($h, [ref]$procId)
  $sb = New-Object System.Text.StringBuilder 512
  [void][KidoraWin]::GetWindowText($h, $sb, 512)
  $fp = Get-Process -Id $procId -ErrorAction SilentlyContinue

  # Resolve UWP/Store apps hidden behind ApplicationFrameHost so their screen time
  # is attributed to the real app (and per-app rules can block them).
  if ($fp -and ($frameHosts -contains $fp.ProcessName)) {
    $realPid = [KidoraWin]::GetUwpChildPid($h, $procId)
    if ($realPid -ne 0) {
      $rp = Get-Process -Id $realPid -ErrorAction SilentlyContinue
      if ($rp) { $procId = $realPid; $fp = $rp }
    }
  }

  $procs = @(Get-Process | Where-Object { $_.ProcessName } | Select-Object -ExpandProperty ProcessName -Unique)

  $obj = [PSCustomObject]@{
    fg = [PSCustomObject]@{
      procId = $procId
      name   = [string]$fp.ProcessName
      title  = $sb.ToString()
    }
    procs = $procs
    ts    = (Get-Date).ToString("o")
  }
  Write-Output ($obj | ConvertTo-Json -Compress -Depth 4)
  Start-Sleep -Seconds $interval
}
