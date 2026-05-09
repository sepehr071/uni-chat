# Launch uni-chat stack: MongoDB + backend + frontend (+ bot + scheduler).
# Each service runs in its own PowerShell window so logs stay separate
# and Ctrl+C only kills the one you want.
#
# Usage:
#   pwsh -File run-all.ps1                  # interactive prompt
#   pwsh -File run-all.ps1 -Mode full       # backend + frontend + bot + scheduler
#   pwsh -File run-all.ps1 -Mode minimal    # backend + frontend only

param(
    [ValidateSet('full', 'minimal', '')]
    [string]$Mode = ''
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

function Start-Service-IfStopped {
    param([string]$Name)
    $svc = Get-Service -Name $Name -ErrorAction SilentlyContinue
    if (-not $svc) { Write-Host "[!] Service '$Name' not installed" -ForegroundColor Yellow; return }
    if ($svc.Status -ne 'Running') {
        Write-Host "[*] Starting service $Name..." -ForegroundColor Cyan
        Start-Service -Name $Name
        Start-Sleep -Seconds 2
    }
    Write-Host "[+] $Name : $((Get-Service $Name).Status)" -ForegroundColor Green
}

function Launch-Window {
    param([string]$Title, [string]$WorkDir, [string]$Cmd)
    $full = "`$Host.UI.RawUI.WindowTitle = '$Title'; Set-Location '$WorkDir'; $Cmd"
    Start-Process -FilePath 'pwsh.exe' `
        -ArgumentList '-NoExit', '-Command', $full `
        -WindowStyle Normal | Out-Null
    Write-Host "[+] Launched: $Title" -ForegroundColor Green
}

Write-Host '== uni-chat launcher ==' -ForegroundColor Magenta

if (-not $Mode) {
    Write-Host ''
    Write-Host 'Choose what to run:' -ForegroundColor Cyan
    Write-Host '  [1] Full stack    - backend + frontend + bot + scheduler' -ForegroundColor White
    Write-Host '  [2] Minimal       - backend + frontend only (no bot, no scheduler)' -ForegroundColor White
    Write-Host ''
    do {
        $choice = Read-Host 'Enter 1 or 2'
    } while ($choice -ne '1' -and $choice -ne '2')
    $Mode = if ($choice -eq '1') { 'full' } else { 'minimal' }
}

Write-Host ''
Write-Host "[*] Mode: $Mode" -ForegroundColor Magenta
Write-Host ''

Start-Service-IfStopped -Name 'MongoDB'

# Bail early if any required .env is missing (each service crashes silently otherwise).
$envs = @("$root\backend\.env")
if ($Mode -eq 'full') {
    $envs += "$root\bot\.env"
    $envs += "$root\scheduler\.env"
}
foreach ($e in $envs) {
    if (-not (Test-Path $e)) {
        Write-Host "[!] Missing $e - service will fail. Create it before continuing." -ForegroundColor Red
    }
}

Launch-Window -Title 'uni-chat backend (:5000)' `
    -WorkDir "$root\backend" `
    -Cmd '.\.venv-uv\Scripts\python.exe run.py'

Launch-Window -Title 'uni-chat frontend (:3000)' `
    -WorkDir "$root\frontend" `
    -Cmd 'npm run dev'

if ($Mode -eq 'full') {
    Launch-Window -Title 'uni-chat bot (polling)' `
        -WorkDir "$root\bot" `
        -Cmd '$env:POLLING=1; .\.venv-uv\Scripts\python.exe -m bot.main'

    Launch-Window -Title 'uni-chat scheduler (:8082)' `
        -WorkDir "$root\scheduler" `
        -Cmd '.\.venv-uv\Scripts\python.exe -m scheduler.main'
}

Write-Host ''
Write-Host 'All selected services launching in separate windows.' -ForegroundColor Magenta
Write-Host 'Open http://localhost:3000 once Vite reports ready.' -ForegroundColor Magenta
Write-Host 'Close each window or Ctrl+C to stop a service.' -ForegroundColor DarkGray
