param(
    [Parameter(Mandatory=$true)][string]$CargoTauri,
    [Parameter(Mandatory=$true)][string]$Output,
    [string]$DesktopRoot = (Split-Path -Parent $PSScriptRoot),
    [string]$TargetDirectory = '',
    [Parameter(Mandatory=$true)][string]$BuildReceipt,
    # Optional Authenticode signing through the reviewed signing gate (engine docs/windows-signing.md).
    # Off by default. Pass both, or set OMD_WINDOWS_SIGN_GATE and OMD_WINDOWS_SIGN_POLICY.
    [string]$SignGate = $env:OMD_WINDOWS_SIGN_GATE,
    [string]$SignPolicy = $env:OMD_WINDOWS_SIGN_POLICY
)
$ErrorActionPreference = 'Stop'
$desktop = [IO.Path]::GetFullPath($DesktopRoot)
$tauri = Join-Path $desktop 'src-tauri'
$resources = Join-Path $tauri 'resources\v2'
$inventoryPath = Join-Path $resources 'build-inventory.json'
$receipt = Get-Content -LiteralPath $BuildReceipt -Raw -Encoding UTF8 | ConvertFrom-Json
if ($receipt.status -ne 'built_requires_installer_acceptance' -or $receipt.target -ne 'x86_64-pc-windows-msvc' -or $receipt.identity.identifier -ne 'labs.northwolf.omd') { throw 'Use a successful public Windows build receipt.' }
if (!$TargetDirectory) { $TargetDirectory = Join-Path $tauri 'target' }
$signing = [bool]$SignGate -or [bool]$SignPolicy
if ($signing) {
    if (!$SignGate -or !$SignPolicy) { throw 'Signing needs both -SignGate and -SignPolicy.' }
    foreach ($path in @($SignGate, $SignPolicy, $env:TAURI_WINDOWS_SIGNTOOL_PATH)) {
        if (!$path -or !(Test-Path -LiteralPath $path -PathType Leaf)) { throw 'Signing needs the gate, its policy and TAURI_WINDOWS_SIGNTOOL_PATH (the reviewed signtool.exe).' }
    }
}
$binary = [IO.Path]::GetFullPath($receipt.executable)
if (Test-Path -LiteralPath $Output) { throw 'Retain existing packages; select an unused output path.' }
if (Test-Path -LiteralPath ($Output + '.json')) { throw 'An output evidence record already exists.' }
if ((& $CargoTauri --version) -ne 'tauri-cli 2.11.4') { throw 'Use the pinned Tauri CLI 2.11.4.' }
$inventory = Get-Content -LiteralPath $inventoryPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ($inventory.platform -ne 'win32' -or $inventory.arch -ne 'x64') { throw 'Stage verified win32-x64 resources first.' }
function Assert-Pe([string]$Path, [int]$Subsystem) {
    $bytes = [IO.File]::ReadAllBytes($Path)
    if ($bytes.Length -lt 256 -or $bytes[0] -ne 77 -or $bytes[1] -ne 90) { throw 'Expected a PE executable.' }
    $pe = [BitConverter]::ToInt32($bytes, 60)
    if ($pe -lt 64 -or $pe + 94 -gt $bytes.Length -or [BitConverter]::ToUInt32($bytes,$pe) -ne 17744 -or [BitConverter]::ToUInt16($bytes,$pe+4) -ne 34404 -or [BitConverter]::ToUInt16($bytes,$pe+24) -ne 523) { throw 'Expected a Windows x86-64 PE32+ executable.' }
    if ([BitConverter]::ToUInt16($bytes,$pe+92) -ne $Subsystem) { throw "Wrong executable subsystem: $Path" }
}
Assert-Pe $binary 2
if ((Get-FileHash -LiteralPath $binary -Algorithm SHA256).Hash.ToLowerInvariant() -ne $receipt.executable_sha256) { throw 'The desktop executable differs from the public build receipt.' }
if ((Get-FileHash -LiteralPath $inventoryPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $receipt.resources.inventory_sha256) { throw 'The staged runtime differs from the public build receipt.' }
# Tauri 2.11.4 restores the input after placing its NSIS marker in the bundled
# copy. Derive that copy's identity instead of recording the restored input.
$desktopBytes = [IO.File]::ReadAllBytes($binary)
$marker = '__TAURI_BUNDLE_TYPE_VAR_UNK'
$binaryText = [Text.Encoding]::GetEncoding(28591).GetString($desktopBytes)
$offset = $binaryText.IndexOf($marker, [StringComparison]::Ordinal)
if ($offset -lt 0 -or $binaryText.IndexOf($marker,$offset+1,[StringComparison]::Ordinal) -ge 0) { throw 'Expected one Tauri bundle marker in the unsigned desktop input.' }
$patchedMarker = [Text.Encoding]::ASCII.GetBytes('__TAURI_BUNDLE_TYPE_VAR_NSS')
[Array]::Copy($patchedMarker,0,$desktopBytes,$offset,$patchedMarker.Length)
$hasher = [Security.Cryptography.SHA256]::Create()
try { $bundledDesktopHash = ([BitConverter]::ToString($hasher.ComputeHash($desktopBytes))).Replace('-','').ToLowerInvariant() } finally { $hasher.Dispose() }
$expected = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
foreach ($entry in $inventory.files) {
    $relative = [string]$entry.path
    if ($relative -notmatch '^[^\\:]+$' -or $relative.StartsWith('/') -or ($relative.Split('/') -contains '..') -or ($relative.Split('/') -contains '.') -or !$expected.Add($relative)) { throw 'Invalid or repeated inventory path.' }
    $file = Join-Path $resources $relative
    $info = Get-Item -LiteralPath $file
    if ($info.PSIsContainer -or ($info.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $info.Length -ne $entry.size -or (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() -ne $entry.sha256) { throw "Resource integrity mismatch: $relative" }
    if ($relative.StartsWith('bin/')) { Assert-Pe $file $(if ($relative -eq 'bin/omd.exe') {3} else {2}) }
}
$actual = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
foreach ($file in Get-ChildItem -LiteralPath $resources -Recurse -Force) {
    if ($file.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Reparse points are not package inputs.' }
    if (!$file.PSIsContainer) { [void]$actual.Add($file.FullName.Substring($resources.Length+1).Replace('\','/')) }
}
[void]$expected.Add('build-inventory.json')
if (!$expected.SetEquals($actual)) { throw 'Resources differ from the complete inventory.' }
# Explicit UTF-8: Windows PowerShell 5.1 would otherwise read the copyright sign as ANSI.
$config = Get-Content -LiteralPath (Join-Path $tauri 'tauri.public.conf.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if ($config.identifier -ne 'labs.northwolf.omd' -or $config.productName -ne 'OMD' -or $config.version -ne $receipt.identity.version) { throw 'Public identity/version differs from the compiled executable.' }
# The installer's uninstall entry shows bundle.publisher; the build compiled it into the executable's
# CompanyName and the copyright into LegalCopyright. Without it Tauri shows "northwolf".
$copyright = [string][char]0xA9 + ' 2026 North Wolf Labs LLC'
if ($config.bundle.publisher -cne 'North Wolf Labs LLC' -or $config.bundle.copyright -cne $copyright) { throw 'Public publisher/copyright differ from the reviewed configuration.' }
$versionInfo = (Get-Item -LiteralPath $binary).VersionInfo
if ($versionInfo.CompanyName -cne $config.bundle.publisher -or $versionInfo.LegalCopyright -cne $copyright) { throw 'The desktop executable lacks the public publisher/copyright; rebuild it with scripts/build-public.mjs.' }
$config.build.beforeBuildCommand = ''
$config.bundle.active = $true
$config.bundle.targets = @('nsis')
$config.bundle | Add-Member -NotePropertyName windows -NotePropertyValue @{
    allowDowngrades = $false
    nsis = @{ installMode = 'currentUser'; installerHooks = 'windows-hooks.nsh' }
    webviewInstallMode = @{ type = 'downloadBootstrapper'; silent = $true }
} -Force
if ($signing) {
    # Tauri signs the desktop executable after writing its bundle marker, the uninstaller through makensis
    # !uninstfinalize and the Setup last, and offers every unsigned resource PE. The gate signs only files its
    # policy names, re-proves and skips pinned third-party resources, and refuses everything else; any
    # refusal or signing failure makes Tauri, and therefore this script, fail before the output is written.
    $config.bundle.windows.signCommand = @{ cmd = (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe')
        args = @('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',[IO.Path]::GetFullPath($SignGate),'-Policy',[IO.Path]::GetFullPath($SignPolicy),'-Path','%1') }
}
$configPath = Join-Path $tauri ('tauri.windows-bundle-' + [Guid]::NewGuid().ToString('N') + '.json')
$config | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $configPath -Encoding UTF8
# Tauri writes its bundle marker into the build output and does not restore it when a signing request
# fails; keep the exact input so a failed signed packaging leaves the build output as received.
if ($signing) { $desktopInput = [IO.File]::ReadAllBytes($binary) }
$started = [DateTime]::UtcNow
Push-Location $desktop
try {
    $previousTarget = $env:CARGO_TARGET_DIR
    $env:CARGO_TARGET_DIR = [IO.Path]::GetFullPath($TargetDirectory)
    & $CargoTauri bundle --bundles nsis --config $configPath --target x86_64-pc-windows-msvc --features v2,tauri/custom-protocol --ci
    if ($LASTEXITCODE -ne 0) { throw 'Tauri NSIS bundling failed.' }
    $installers = @(Get-ChildItem -LiteralPath (Join-Path $TargetDirectory 'x86_64-pc-windows-msvc\release\bundle\nsis') -Filter '*-setup.exe' | Where-Object {$_.LastWriteTimeUtc -ge $started})
    if ($installers.Count -ne 1) { throw 'Expected exactly one newly generated installer.' }
    [IO.File]::Copy($installers[0].FullName, [IO.Path]::GetFullPath($Output), $false)
    @{
        status = 'packaged_requires_target_acceptance'
        architecture = 'x86_64'; installation = 'currentUser'; package = [IO.Path]::GetFullPath($Output)
        sha256 = (Get-FileHash -LiteralPath $Output -Algorithm SHA256).Hash.ToLowerInvariant()
        desktop_input_sha256 = (Get-FileHash -LiteralPath $binary -Algorithm SHA256).Hash.ToLowerInvariant()
        desktop_sha256 = $bundledDesktopHash
        inventory_sha256 = (Get-FileHash -LiteralPath $inventoryPath -Algorithm SHA256).Hash.ToLowerInvariant()
        resources = $inventory.files.Count; tauri_cli = '2.11.4'; configuration = $config
    } | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath ($Output + '.json') -Encoding UTF8
} finally {
    $env:CARGO_TARGET_DIR = $previousTarget
    Pop-Location
    Remove-Item -LiteralPath $configPath
    if ($signing -and (Get-FileHash -LiteralPath $binary -Algorithm SHA256).Hash.ToLowerInvariant() -ne $receipt.executable_sha256) { [IO.File]::WriteAllBytes($binary, $desktopInput) }
}
