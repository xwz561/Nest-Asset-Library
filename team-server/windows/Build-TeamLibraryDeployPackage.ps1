param(
  [string]$OutputDirectory = (Join-Path $env:USERPROFILE 'Documents\Codex\outputs')
)

$ErrorActionPreference = 'Stop'
$teamServerRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$packageName = 'Nest-TeamLibrary-Server-Deployment-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.zip'
$packagePath = Join-Path $OutputDirectory $packageName
$temporaryRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd([System.IO.Path]::DirectorySeparatorChar)
$stagingRoot = Join-Path $temporaryRoot ('nest-team-library-' + [guid]::NewGuid().ToString('N'))
$stagedServerRoot = Join-Path $stagingRoot 'team-server'

New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
New-Item -ItemType Directory -Path $stagedServerRoot -Force | Out-Null
try {
  foreach ($file in @('package.json', 'package-lock.json', 'schema.sql', 'README.md')) {
    Copy-Item -LiteralPath (Join-Path $teamServerRoot $file) -Destination $stagedServerRoot
  }
  Copy-Item -LiteralPath (Join-Path $teamServerRoot 'src') -Destination $stagedServerRoot -Recurse
  Copy-Item -LiteralPath (Join-Path $teamServerRoot 'windows') -Destination $stagedServerRoot -Recurse
  if (Test-Path -LiteralPath $packagePath) { throw "部署包已存在，为保护旧文件不会覆盖：$packagePath" }
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  [System.IO.Compression.ZipFile]::CreateFromDirectory($stagingRoot, $packagePath, [System.IO.Compression.CompressionLevel]::Optimal, $false)
  Write-Host "已生成部署包：$packagePath" -ForegroundColor Green
} finally {
  $resolvedStagingRoot = [System.IO.Path]::GetFullPath($stagingRoot)
  $expectedPrefix = $temporaryRoot + [System.IO.Path]::DirectorySeparatorChar
  if (-not $resolvedStagingRoot.StartsWith($expectedPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "拒绝删除临时目录，因为它不在系统临时目录中：$resolvedStagingRoot"
  }
  Remove-Item -LiteralPath $resolvedStagingRoot -Recurse -Force -ErrorAction SilentlyContinue
}

