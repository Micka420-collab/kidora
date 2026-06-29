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
}
"@

$interval = if ($args[0]) { [int]$args[0] } else { 5 }

while ($true) {
  $h = [KidoraWin]::GetForegroundWindow()
  $procId = 0
  [void][KidoraWin]::GetWindowThreadProcessId($h, [ref]$procId)
  $sb = New-Object System.Text.StringBuilder 512
  [void][KidoraWin]::GetWindowText($h, $sb, 512)
  $fp = Get-Process -Id $procId -ErrorAction SilentlyContinue
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
