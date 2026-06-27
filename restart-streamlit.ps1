# Kill whatever is listening on port 8501, then relaunch Streamlit.
$ErrorActionPreference = "Stop"
$conns = Get-NetTCPConnection -LocalPort 8501 -ErrorAction SilentlyContinue
foreach ($c in $conns) {
  try { Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue } catch {}
}
Start-Sleep -Seconds 2

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$app = Join-Path $scriptDir "streamlit_app.py"
$candidates = @(
  "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe",
  "$env:LOCALAPPDATA\Programs\Python\Python313\python.exe",
  "$env:LOCALAPPDATA\Programs\Python\Python311\python.exe"
)
$pyExe = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $pyExe) { Write-Error "Python not found"; exit 1 }
& $pyExe -m streamlit run $app --server.port 8501 --server.headless true
