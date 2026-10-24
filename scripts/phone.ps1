param(
    [switch]$Web,
    [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$env:JAVA_HOME = if ($env:JAVA_HOME) { $env:JAVA_HOME } else { 'D:\dev\jdk21' }
$env:ANDROID_HOME = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { 'C:\Users\14152\Android\Sdk' }
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME

if ($Web) {
    $ip = Get-NetIPAddress -AddressFamily IPv4 |
        Where-Object {
            $_.IPAddress -notlike '127.*' -and
            $_.IPAddress -notlike '169.254*' -and
            $_.InterfaceAlias -notlike 'VMware*' -and
            $_.InterfaceAlias -notlike 'vEthernet*'
        } |
        Sort-Object -Property InterfaceAlias |
        Select-Object -First 1 -ExpandProperty IPAddress

    if (-not $ip) { $ip = 'localhost' }

    Write-Host ''
    Write-Host 'Phone and PC on the same Wi-Fi. Open this URL on the phone:'
    Write-Host "  http://$ip`:5173" -ForegroundColor Cyan
    Write-Host ''
    Write-Host 'If it does not load: allow Node.js on Windows Firewall private network.'
    Write-Host 'If the Wi-Fi isolates clients, use USB instead:'
    Write-Host '  adb reverse tcp:5173 tcp:5173'
    Write-Host '  then open http://localhost:5173 on the phone.'
    Write-Host ''
    & npm run dev -- --host 0.0.0.0
    exit $LASTEXITCODE
}

$adb = Join-Path $env:ANDROID_HOME 'platform-tools\adb.exe'
if (-not (Test-Path $adb)) {
    throw "adb not found: $adb"
}

$devices = & $adb devices | Select-String -Pattern '^\S+\s+device$'
if (-not $devices) {
    Write-Host ''
    Write-Host 'No phone detected.' -ForegroundColor Yellow
    Write-Host '1. Settings -> About phone -> tap Build number 7 times.'
    Write-Host '2. Developer options -> enable USB debugging.'
    Write-Host '3. Connect USB and allow debugging on the phone.'
    Write-Host '4. Run again: .\scripts\phone.ps1'
    Write-Host ''
    Write-Host 'Current devices:'
    & $adb devices
    exit 1
}

if (-not $SkipBuild) {
    Write-Host 'Building APK...' -ForegroundColor Cyan
    & npm run android:debug
    if ($LASTEXITCODE -ne 0) { throw 'APK build failed' }
}

$apk = Join-Path $root 'android\app\build\outputs\apk\debug\app-debug.apk'
if (-not (Test-Path $apk)) {
    throw "APK not found: $apk"
}

Write-Host 'Installing on phone...' -ForegroundColor Cyan
& $adb install -r $apk
if ($LASTEXITCODE -ne 0) { throw 'Install failed. Check USB debugging permission.' }

Write-Host 'Opening READ...' -ForegroundColor Cyan
& $adb shell am start -n app.read.reader/.MainActivity | Out-Null
Write-Host 'Done.' -ForegroundColor Green
