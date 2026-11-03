$ErrorActionPreference = 'SilentlyContinue'

Write-Host ''
Write-Host '小旺仔团队素材库：服务器环境检查' -ForegroundColor Cyan
Write-Host '此脚本只读取系统信息，不会安装软件、修改配置、访问素材文件或打开防火墙。' -ForegroundColor Gray
Write-Host ''

$os = Get-CimInstance Win32_OperatingSystem
Write-Host ("Windows：{0}（版本 {1}）" -f $os.Caption, $os.Version)

$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [System.Security.Principal.WindowsPrincipal]::new($identity)
$isAdmin = $principal.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)
if ($isAdmin) { Write-Host '当前窗口：管理员权限' -ForegroundColor Green }
else { Write-Host '当前窗口：普通权限（检查可以继续；正式安装时需要管理员窗口）' -ForegroundColor Yellow }

$node = Get-Command node.exe -ErrorAction SilentlyContinue
if ($node) {
  $nodeVersion = (& $node.Source --version).Trim()
  if ($nodeVersion -match '^v(\d+)\.' -and [int]$Matches[1] -ge 22) {
    Write-Host "Node.js：$nodeVersion（满足要求）" -ForegroundColor Green
  } else { Write-Host "Node.js：$nodeVersion（需要升级到 22 或更新版本）" -ForegroundColor Yellow }
} else { Write-Host 'Node.js：未检测到（安装向导需要安装 22 或更新版本）' -ForegroundColor Yellow }

$postgresServices = @(Get-Service | Where-Object { $_.Name -match '^postgresql' })
if ($postgresServices.Count) {
  foreach ($service in $postgresServices) {
    $color = if ($service.Status -eq 'Running') { 'Green' } else { 'Yellow' }
    Write-Host ("PostgreSQL：服务 {0}，状态 {1}" -f $service.Name, $service.Status) -ForegroundColor $color
  }
} else { Write-Host 'PostgreSQL：未检测到服务（后续需要安装或由公司 IT 配置）' -ForegroundColor Yellow }

$psql = Get-Command psql.exe -ErrorAction SilentlyContinue
if ($psql) { Write-Host "PostgreSQL 命令行：$($psql.Source)" -ForegroundColor Green }
else { Write-Host 'PostgreSQL 命令行：当前 PATH 中未找到' -ForegroundColor Gray }

$smbCommand = Get-Command Get-SmbMapping -ErrorAction SilentlyContinue
$mappings = @()
if ($smbCommand) { $mappings = @(Get-SmbMapping | Where-Object { $_.RemotePath }) }
if ($mappings.Count) {
  Write-Host '已连接的 NAS/网络共享：' -ForegroundColor Green
  foreach ($mapping in $mappings) {
    Write-Host ("  {0}  →  {1}  [{2}]" -f $mapping.LocalPath, $mapping.RemotePath, $mapping.Status)
  }
} else {
  Write-Host 'NAS/网络共享：没有检测到已映射的共享盘。安装时可在文件夹选择窗口中选择 NAS 共享目录。' -ForegroundColor Yellow
}

$serverCertificates = @()
if (Test-Path 'Cert:\LocalMachine\My') {
  $serverCertificates = @(Get-ChildItem 'Cert:\LocalMachine\My' | Where-Object {
    $_.HasPrivateKey -and $_.NotAfter -gt (Get-Date) -and
    (($_.EnhancedKeyUsageList | ForEach-Object { $_.ObjectId.Value }) -contains '1.3.6.1.5.5.7.3.1')
  })
}
if ($serverCertificates.Count) {
  Write-Host ("HTTPS 服务器证书：检测到 {0} 张可用证书；还需确认公司电脑信任其签发机构。" -f $serverCertificates.Count) -ForegroundColor Green
} else {
  Write-Host 'HTTPS 服务器证书：未检测到可用证书；后续需要公司 IT 提供或配置内部证书。' -ForegroundColor Yellow
}

if (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue) {
  $listeners = @(Get-NetTCPConnection -State Listen -LocalPort 43180 -ErrorAction SilentlyContinue)
  if ($listeners.Count) { Write-Host '端口 43180：已被占用，请安装时选择其他端口。' -ForegroundColor Yellow }
  else { Write-Host '端口 43180：当前空闲。' -ForegroundColor Green }
} else { Write-Host '端口 43180：无法自动检查；安装时如端口冲突会提示。' -ForegroundColor Gray }

Write-Host ''
Write-Host '检查完成。若要把结果发给开发人员，请勿附上密码、证书私钥或数据库连接串。' -ForegroundColor Cyan
