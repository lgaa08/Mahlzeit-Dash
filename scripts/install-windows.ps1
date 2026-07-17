$ErrorActionPreference = 'Stop'

$AppDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Launcher = Join-Path $AppDir 'scripts\launch-windows.ps1'
$StartupDir = [Environment]::GetFolderPath('Startup')
$ShortcutPath = Join-Path $StartupDir 'Mahlzeit Dashboard.lnk'

function Assert-Command {
    param([Parameter(Mandatory = $true)][string]$Name)
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "'$Name' wurde nicht gefunden. Bitte zuerst Node.js und Git installieren."
    }
}

Assert-Command -Name 'node.exe'
Assert-Command -Name 'npm.cmd'

$NodeMajor = [int]((node --version).TrimStart('v').Split('.')[0])
if ($NodeMajor -lt 20) {
    throw "Node.js 20 oder neuer wird benötigt. Gefunden: $(node --version)"
}

Set-Location $AppDir
Write-Host 'Installiere Node-Abhängigkeiten ...' -ForegroundColor Cyan
& npm.cmd install
if ($LASTEXITCODE -ne 0) {
    throw "npm install ist mit Exitcode $LASTEXITCODE fehlgeschlagen."
}

Write-Host 'Prüfe JavaScript-Dateien ...' -ForegroundColor Cyan
& npm.cmd run check
if ($LASTEXITCODE -ne 0) {
    throw "npm run check ist mit Exitcode $LASTEXITCODE fehlgeschlagen."
}

$PowerShellExe = (Get-Command powershell.exe).Source
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = $PowerShellExe
$Shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$Launcher`""
$Shortcut.WorkingDirectory = $AppDir
$Shortcut.Description = 'Startet das Mahlzeit Dashboard automatisch'
$Shortcut.Save()

try {
    powercfg.exe /change monitor-timeout-ac 0 | Out-Null
    powercfg.exe /change standby-timeout-ac 0 | Out-Null
    powercfg.exe /change hibernate-timeout-ac 0 | Out-Null
    Write-Host 'Windows-Energiesparmodus im Netzbetrieb deaktiviert.' -ForegroundColor Green
}
catch {
    Write-Warning 'Energieoptionen konnten nicht geändert werden. Bitte Windows-Energieoptionen manuell prüfen.'
}

Write-Host ''
Write-Host 'Installation abgeschlossen.' -ForegroundColor Green
Write-Host "Autostart: $ShortcutPath"
Write-Host "Direkt starten: powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$Launcher`""
Write-Host 'Konfiguration: config.json'
