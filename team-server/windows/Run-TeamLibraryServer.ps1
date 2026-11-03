$ErrorActionPreference = 'Stop'
$installRoot = Join-Path $env:ProgramData 'NestTeamLibrary'
$configPath = Join-Path $installRoot 'config.json'
if (-not (Test-Path -LiteralPath $configPath -PathType Leaf)) { throw "缺少服务配置：$configPath" }
$config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json

function Unprotect-CurrentUserString([string]$Value) {
  $secure = ConvertTo-SecureString -String $Value
  return [System.Net.NetworkCredential]::new('', $secure).Password
}

$env:TEAM_HOST = [string]$config.host
$env:TEAM_PORT = [string]$config.port
$env:TEAM_LIBRARY_ROOT = [string]$config.libraryRoot
$env:TEAM_TLS_CERT = [string]$config.certificate
$env:TEAM_TLS_KEY = [string]$config.privateKey
$env:TEAM_DATABASE_URL = Unprotect-CurrentUserString ([string]$config.databaseUrlProtected)
$env:TEAM_BOOTSTRAP_USERNAME = [string]$config.bootstrapUsername
$env:TEAM_BOOTSTRAP_PASSWORD = Unprotect-CurrentUserString ([string]$config.bootstrapPasswordProtected)
$env:TEAM_BOOTSTRAP_LIBRARY_NAME = [string]$config.bootstrapLibraryName

$logPath = Join-Path $config.logDirectory 'server.log'
New-Item -ItemType Directory -Path $config.logDirectory -Force | Out-Null
if ((Test-Path -LiteralPath $logPath) -and (Get-Item -LiteralPath $logPath).Length -gt 20MB) {
  Move-Item -LiteralPath $logPath -Destination "$logPath.1" -Force
}

# Give the NAS and PostgreSQL services time to become reachable after Windows startup.
if (-not (Test-Path -LiteralPath $config.libraryRoot)) {
  Start-Sleep -Seconds 20
  if (-not (Test-Path -LiteralPath $config.libraryRoot)) { throw "NAS 共享目录不可访问：$($config.libraryRoot)" }
}

Set-Location -LiteralPath $config.serverDirectory
try {
  & $config.nodePath (Join-Path $config.serverDirectory 'src\server.mjs') *>> $logPath
  exit $LASTEXITCODE
} finally {
  $env:TEAM_DATABASE_URL = ''
  $env:TEAM_BOOTSTRAP_PASSWORD = ''
}
