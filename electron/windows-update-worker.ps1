param(
  [Parameter(Mandatory = $true)][int]$ParentPid,
  [Parameter(Mandatory = $true)][string]$InstallerPath,
  [Parameter(Mandatory = $true)][string]$CurrentExe,
  [Parameter(Mandatory = $true)][string]$ExpectedSha256,
  [Parameter(Mandatory = $true)][string]$LogFile,
  [switch]$Silent,
  [switch]$Portable,
  [switch]$Restart
)
$ErrorActionPreference = 'Stop'
function Write-UpdateLog([string]$Value) { Add-Content -LiteralPath $LogFile -Value "$(Get-Date -Format o) $Value" -Encoding UTF8 }
try {
  $taskInstallDirectory = [IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($CurrentExe))
  Write-UpdateLog 'Waiting for the application to exit.'
  $taskDeadline = (Get-Date).AddMinutes(2)
  while (Get-Process -Id $ParentPid -ErrorAction SilentlyContinue) {
    if ((Get-Date) -gt $taskDeadline) { throw 'Application did not exit; update postponed.' }
    Start-Sleep -Milliseconds 300
  }
  $taskHashStream = [IO.File]::OpenRead($InstallerPath)
  $taskHashAlgorithm = [Security.Cryptography.SHA256]::Create()
  try { $taskActualHash = [BitConverter]::ToString($taskHashAlgorithm.ComputeHash($taskHashStream)).Replace('-', '').ToLowerInvariant() }
  finally { $taskHashStream.Dispose(); $taskHashAlgorithm.Dispose() }
  if ($taskActualHash -ne $ExpectedSha256.ToLowerInvariant()) { throw 'Installer SHA256 mismatch.' }
  if ($Portable) {
    $taskBackup = "$CurrentExe.old"
    if (Test-Path -LiteralPath $taskBackup) { Remove-Item -LiteralPath $taskBackup -Force }
    Move-Item -LiteralPath $CurrentExe -Destination $taskBackup
    try { Copy-Item -LiteralPath $InstallerPath -Destination $CurrentExe }
    catch { Move-Item -LiteralPath $taskBackup -Destination $CurrentExe -Force; throw }
  } else {
    $taskInstallerArguments = '--updated'
    $taskWindowStyle = 'Normal'
    if ($Silent) { $taskInstallerArguments = '/S /currentuser --updated'; $taskWindowStyle = 'Hidden' }
    # NSIS treats /D as the last argument, including spaces in this directory.
    $taskInstallerArguments += " /D=$taskInstallDirectory"
    $taskInstallerProcess = Start-Process -FilePath $InstallerPath -ArgumentList $taskInstallerArguments -Wait -PassThru -WindowStyle $taskWindowStyle
    if ($taskInstallerProcess.ExitCode -ne 0) { throw "Installer returned $($taskInstallerProcess.ExitCode)." }
  }
  Write-UpdateLog 'Update completed.'
  if ($Restart) { Start-Process -FilePath $CurrentExe -ArgumentList '--updated' -WindowStyle Hidden }
} catch { Write-UpdateLog "Update failed: $($_.Exception.Message)"; exit 1 }
