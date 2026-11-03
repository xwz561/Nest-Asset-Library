param(
  [string]$SourceDirectory = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$TaskName = 'Nest Team Library'
)

$ErrorActionPreference = 'Stop'

function Read-RequiredText([string]$Prompt, [string]$Default = '') {
  while ($true) {
    $promptText = $Prompt
    if (-not [string]::IsNullOrWhiteSpace($Default)) { $promptText = "$Prompt [$Default]" }
    $value = Read-Host $promptText
    if ([string]::IsNullOrWhiteSpace($value)) { $value = $Default }
    if (-not [string]::IsNullOrWhiteSpace($value)) { return $value.Trim() }
    Write-Host '此项不能为空。' -ForegroundColor Yellow
  }
}

function Read-Secret([string]$Prompt, [int]$MinimumLength = 1) {
  while ($true) {
    $secure = Read-Host $Prompt -AsSecureString
    $text = [System.Net.NetworkCredential]::new('', $secure).Password
    if ($text.Length -ge $MinimumLength) { return @{ Secure = $secure; Plain = $text } }
    Write-Host "至少需要 $MinimumLength 个字符。" -ForegroundColor Yellow
  }
}

function Select-NasRoot {
  $selected = ''
  $mappings = @(Get-SmbMapping -ErrorAction SilentlyContinue | Where-Object { $_.RemotePath })
  $mapping = $mappings | Where-Object { [string]$_.LocalPath -eq 'S:' } | Select-Object -First 1
  if (-not $mapping) { $mapping = $mappings | Select-Object -First 1 }
  $defaultShare = if ($mapping) { [string]$mapping.RemotePath } else { '\\NAS\TeamLibrary' }
  try {
    Add-Type -AssemblyName System.Windows.Forms
    $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
    $dialog.Description = '请选择 NAS 共享位置；安装器会在里面创建独立的 NestTeamLibraryData 文件夹'
    $dialog.ShowNewFolderButton = $false
    if ($mapping) { $dialog.SelectedPath = "$($mapping.LocalPath)\" }
    if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { $selected = $dialog.SelectedPath }
  } catch {}

  if ([string]::IsNullOrWhiteSpace($selected)) {
    $selected = Read-RequiredText 'NAS 共享位置（安装器会在其中创建专用子文件夹）' $defaultShare
  }

  if (-not $selected.StartsWith('\\')) {
    $driveRoot = [System.IO.Path]::GetPathRoot($selected).TrimEnd('\')
    $mapping = Get-SmbMapping -ErrorAction SilentlyContinue | Where-Object { [string]$_.LocalPath -eq $driveRoot } | Select-Object -First 1
    if ($mapping) {
      $relativePath = $selected.Substring($driveRoot.Length).TrimStart('\')
      $selected = if ($relativePath) { Join-Path $mapping.RemotePath $relativePath } else { [string]$mapping.RemotePath }
    }
  }
  return $selected
}

$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
$principalCheck = [System.Security.Principal.WindowsPrincipal]::new($identity)
if (-not $principalCheck.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw '请在“以管理员身份运行”的 PowerShell 窗口中执行此安装脚本。'
}

if (-not (Test-Path -LiteralPath (Join-Path $SourceDirectory 'src\server.mjs'))) { throw "找不到团队服务源码：$SourceDirectory" }
$node = Get-Command node.exe -ErrorAction SilentlyContinue
$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $node -or -not $npm) { throw '请先安装 Node.js 22 或更新版本，并确认 node.exe 与 npm.cmd 在 PATH 中。' }
$nodeVersion = (& $node.Source --version).Trim()
if ($nodeVersion -notmatch '^v(\d+)\.' -or [int]$Matches[1] -lt 22) { throw "当前 Node.js 版本不满足要求：$nodeVersion" }

$nasShare = Select-NasRoot
if (-not $nasShare.StartsWith('\\')) { throw 'NAS 共享位置必须填写 UNC 路径，例如 \\NAS\TeamLibrary。' }
if (-not (Test-Path -LiteralPath $nasShare)) { throw "当前 Windows 账号无法访问 NAS 路径：$nasShare。先为此账号配置 NAS 共享权限，再运行安装脚本。" }
$nasRoot = if ((Split-Path -Leaf $nasShare) -ieq 'NestTeamLibraryData') { $nasShare } else { Join-Path $nasShare 'NestTeamLibraryData' }

$hostAddress = Read-RequiredText '服务监听地址' '0.0.0.0'
$portText = Read-RequiredText '服务端口' '43180'
$port = 0
if (-not [int]::TryParse($portText, [ref]$port) -or $port -lt 1024 -or $port -gt 65535) { throw '服务端口必须为 1024 到 65535 之间的整数。' }
$certificate = Read-RequiredText 'HTTPS 证书 PEM 路径'
$privateKey = Read-RequiredText 'HTTPS 私钥 PEM 路径'
if (-not (Test-Path -LiteralPath $certificate -PathType Leaf)) { throw "找不到 HTTPS 证书：$certificate" }
if (-not (Test-Path -LiteralPath $privateKey -PathType Leaf)) { throw "找不到 HTTPS 私钥：$privateKey" }

$databaseUrl = Read-Secret 'PostgreSQL 连接串（含数据库密码）'
$bootstrapUsername = Read-RequiredText '首次管理员账号' 'admin'
$bootstrapPassword = Read-Secret '首次管理员密码（至少 10 个字符）' 10
$bootstrapLibraryName = Read-RequiredText '初始团队素材库名称' '公司素材库'
$windowsAccount = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$windowsPassword = Read-Secret "计划任务运行账号 $windowsAccount 的 Windows 密码"

New-Item -ItemType Directory -Path $nasRoot -Force | Out-Null
$writeProbe = Join-Path $nasRoot ('.setup-check-' + [guid]::NewGuid().ToString('N'))
try {
  [System.IO.File]::WriteAllText($writeProbe, 'ok')
  Remove-Item -LiteralPath $writeProbe -Force
} catch {
  Remove-Item -LiteralPath $writeProbe -Force -ErrorAction SilentlyContinue
  throw "无法在 NAS 专用目录创建文件：$nasRoot。请让 NAS 管理员给服务电脑账号开通读写权限。"
}

$installRoot = Join-Path $env:ProgramData 'NestTeamLibrary'
$serverRoot = Join-Path $installRoot 'server'
$configPath = Join-Path $installRoot 'config.json'
$runnerPath = Join-Path $installRoot 'Run-TeamLibraryServer.ps1'
New-Item -ItemType Directory -Path $installRoot -Force | Out-Null
New-Item -ItemType Directory -Path $serverRoot -Force | Out-Null
$icacls = Join-Path $env:WINDIR 'System32\icacls.exe'
$aclArguments = @(
  $installRoot, '/inheritance:r', '/grant:r',
  "${windowsAccount}:(OI)(CI)F", '*S-1-5-18:(OI)(CI)F', '*S-1-5-32-544:(OI)(CI)F', '/C'
)
& $icacls @aclArguments | Out-Null
if ($LASTEXITCODE -ne 0) { throw '无法限制团队服务配置目录的 Windows ACL。' }

Copy-Item -LiteralPath (Join-Path $SourceDirectory 'package.json') -Destination $serverRoot -Force
Copy-Item -LiteralPath (Join-Path $SourceDirectory 'package-lock.json') -Destination $serverRoot -Force
Copy-Item -LiteralPath (Join-Path $SourceDirectory 'schema.sql') -Destination $serverRoot -Force
$serverSource = Join-Path $serverRoot 'src'
New-Item -ItemType Directory -Path $serverSource -Force | Out-Null
Copy-Item -Path (Join-Path (Join-Path $SourceDirectory 'src') '*') -Destination $serverSource -Recurse -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'Run-TeamLibraryServer.ps1') -Destination $runnerPath -Force

Push-Location $serverRoot
try {
  & $npm.Source ci --omit=dev
  if ($LASTEXITCODE -ne 0) { throw '安装团队服务依赖失败。' }
} finally { Pop-Location }

$config = [ordered]@{
  nodePath = $node.Source
  serverDirectory = $serverRoot
  libraryRoot = $nasRoot
  host = $hostAddress
  port = $port
  certificate = (Resolve-Path -LiteralPath $certificate).Path
  privateKey = (Resolve-Path -LiteralPath $privateKey).Path
  databaseUrlProtected = ConvertFrom-SecureString $databaseUrl.Secure
  bootstrapUsername = $bootstrapUsername
  bootstrapPasswordProtected = ConvertFrom-SecureString $bootstrapPassword.Secure
  bootstrapLibraryName = $bootstrapLibraryName
  logDirectory = (Join-Path $installRoot 'logs')
}
$config | ConvertTo-Json | Set-Content -LiteralPath $configPath -Encoding UTF8
New-Item -ItemType Directory -Path $config.logDirectory -Force | Out-Null

$aclArguments = @(
  $installRoot, '/inheritance:r', '/grant:r',
  "${windowsAccount}:(OI)(CI)F", '*S-1-5-18:(OI)(CI)F', '*S-1-5-32-544:(OI)(CI)F', '/T', '/C'
)
& $icacls @aclArguments | Out-Null
if ($LASTEXITCODE -ne 0) { throw '无法限制团队服务配置目录的 Windows ACL。' }

$powershell = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
$action = New-ScheduledTaskAction -Execute $powershell -Argument "-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$runnerPath`"" -WorkingDirectory $serverRoot
$trigger = New-ScheduledTaskTrigger -AtStartup -RandomDelay (New-TimeSpan -Seconds 30)
$principal = New-ScheduledTaskPrincipal -UserId $windowsAccount -LogonType Password -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
$task = New-ScheduledTask -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Starts the Nest team library API and retries after failures.'
$passwordText = $windowsPassword.Plain
Register-ScheduledTask -TaskName $TaskName -InputObject $task -User $windowsAccount -Password $passwordText -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName

$databaseUrl.Plain = ''
$bootstrapPassword.Plain = ''
$windowsPassword.Plain = ''
Write-Host "已安装并启动计划任务：$TaskName" -ForegroundColor Green
Write-Host "配置：$configPath"
Write-Host "日志：$(Join-Path $installRoot 'logs\server.log')"
Write-Host '确认 Windows 账号能访问 NAS UNC 目录和 HTTPS 私钥；再从另一台电脑打开 https://服务器名称:端口/healthz 检查服务。'
