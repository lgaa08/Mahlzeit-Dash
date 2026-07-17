$ErrorActionPreference = 'Continue'

$AppDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $AppDir

Start-Sleep -Seconds 8

while ($true) {
    try {
        & npm.cmd start
    }
    catch {
        Write-EventLog -LogName Application -Source 'Mahlzeit-Dashboard' -EntryType Error -EventId 1001 -Message $_.Exception.Message -ErrorAction SilentlyContinue
    }

    Start-Sleep -Seconds 5
}
