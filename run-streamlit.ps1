# Launch the char.ai Streamlit app.
# Works even before PATH refreshes, by locating Python and streamlit directly.

$ErrorActionPreference = "Stop"

$candidates = @(
  "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe",
  "$env:LOCALAPPDATA\Programs\Python\Python313\python.exe",
  "$env:LOCALAPPDATA\Programs\Python\Python311\python.exe",
  "C:\Program Files\Python312\python.exe",
  "C:\Program Files\Python313\python.exe"
)

$pyExe = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $pyExe) {
  Write-Error "Python not found. Install it first: winget install Python.Python.3.12 --scope user"
  exit 1
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$app = Join-Path $scriptDir "streamlit_app.py"

Write-Host "Using Python: $pyExe"
Write-Host "Launching: $app"
& $pyExe -m streamlit run $app --server.port 8501 --server.headless true
