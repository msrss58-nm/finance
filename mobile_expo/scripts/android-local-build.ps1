<#
.SYNOPSIS
  Local Android development build for Windows machines whose user-profile
  path contains non-ASCII characters.

.DESCRIPTION
  EAS Build is the primary build path. This script is the local fallback.

  Stage 0 finding: React Native's Gradle settings plugin and CMake/prefab
  mangle non-ASCII paths (the project path, JAVA_HOME and the Gradle home).
  This script therefore:
    1. mirrors the project SOURCES (no node_modules, no native folders) into
       an ASCII-only working directory — the authoritative repository is
       never moved or modified;
    2. installs dependencies there from the committed package-lock.json;
    3. runs `expo prebuild` (Continuous Native Generation) for Android;
    4. builds with an ASCII copy of the JDK and an ASCII GRADLE_USER_HOME.

  Nothing here is machine-specific except the -AsciiRoot default. Delete the
  AsciiRoot folder to reclaim the space (several GB).

.PARAMETER AsciiRoot
  ASCII-only working root. Default: C:\ffbuild

.PARAMETER Task
  prebuild  = generate android/ only
  manifest  = merge the debug AndroidManifest only (fast config check)
  debug     = assemble the debug (development-client) APK

.PARAMETER Abi
  ABI to build. Default arm64-v8a (physical devices).

.PARAMETER Install
  Install the APK on the connected device with `adb install -r`.
#>
param(
  [string]$AsciiRoot = 'C:\ffbuild',
  [ValidateSet('prebuild', 'manifest', 'debug')][string]$Task = 'debug',
  [string]$Abi = 'arm64-v8a',
  [switch]$Install
)

$ErrorActionPreference = 'Stop'

function Test-NonAscii([string]$Value) { return $Value -match '[^\x00-\x7F]' }

if (Test-NonAscii $AsciiRoot) { throw 'AsciiRoot must be an ASCII-only path.' }
if (-not $env:JAVA_HOME) { throw 'JAVA_HOME is not set (JDK 17 required).' }
if (-not $env:ANDROID_HOME) { throw 'ANDROID_HOME is not set.' }
if (Test-NonAscii $env:ANDROID_HOME) { throw 'ANDROID_HOME must be an ASCII path.' }

$project = Split-Path -Parent $PSScriptRoot
$mirror = Join-Path $AsciiRoot 'mobile_expo'
$jdk = Join-Path $AsciiRoot 'jdk17'

New-Item -ItemType Directory -Force $AsciiRoot | Out-Null

if (Test-NonAscii $env:JAVA_HOME) {
  if (-not (Test-Path (Join-Path $jdk 'bin\java.exe'))) {
    robocopy $env:JAVA_HOME $jdk /E /NFL /NDL /NJH /NJS /NP | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "JDK copy failed (robocopy $LASTEXITCODE)" }
  }
  $env:JAVA_HOME = $jdk
}
$env:GRADLE_USER_HOME = Join-Path $AsciiRoot 'gradle-home'
$env:CI = '1'
$env:EXPO_NO_TELEMETRY = '1'

# Full paths in /XD: a bare name would also exclude every nested
# node_modules/**/android folder (Stage 0 pitfall).
$exclude = @('node_modules', 'android', 'ios', '.expo') | ForEach-Object { Join-Path $project $_ }
robocopy $project $mirror /MIR /XD @exclude /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "Source mirror failed (robocopy $LASTEXITCODE)" }

Push-Location $mirror
try {
  $lockHash = (Get-FileHash package-lock.json -Algorithm SHA256).Hash
  $stamp = 'node_modules\.ff-lock-sha256'
  if (-not (Test-Path $stamp) -or (Get-Content $stamp) -ne $lockHash) {
    npm ci --no-audit --no-fund
    if ($LASTEXITCODE) { throw 'npm ci failed' }
    Set-Content -Path $stamp -Value $lockHash -Encoding ascii
  }

  npx expo prebuild --platform android --clean --no-install
  if ($LASTEXITCODE) { throw 'expo prebuild failed' }
  if ($Task -eq 'prebuild') { return }

  Push-Location android
  try {
    if ($Task -eq 'manifest') {
      .\gradlew.bat :app:processDebugMainManifest --console=plain
    } else {
      .\gradlew.bat :app:assembleDebug "-PreactNativeArchitectures=$Abi" --console=plain
    }
    if ($LASTEXITCODE) { throw 'Gradle build failed' }
  } finally {
    Pop-Location
  }

  if ($Install) {
    adb install -r android\app\build\outputs\apk\debug\app-debug.apk
    if ($LASTEXITCODE) { throw 'adb install failed' }
  }
} finally {
  Pop-Location
}
