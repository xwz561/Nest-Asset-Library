param(
  [Parameter(Mandatory = $true)][string]$ProgramPath,
  [Parameter(Mandatory = $true)][string]$InstallPath,
  [switch]$Remove
)
$ErrorActionPreference = 'Stop'
$taskLanRules = @(
  @{ DisplayName = "小旺仔素材库局域网信号 $InstallPath"; Protocol = 'UDP'; Port = 47483 },
  @{ DisplayName = "小旺仔素材库局域网私聊 $InstallPath"; Protocol = 'TCP'; Port = 43128 }
)
foreach ($taskLanRule in $taskLanRules) {
  Get-NetFirewallRule | Where-Object { $_.DisplayName -eq $taskLanRule.DisplayName } | Remove-NetFirewallRule
  if (-not $Remove) {
    New-NetFirewallRule -DisplayName $taskLanRule.DisplayName -Direction Inbound -Action Allow -Program $ProgramPath -Protocol $taskLanRule.Protocol -LocalPort $taskLanRule.Port -RemoteAddress LocalSubnet -Profile Any | Out-Null
  }
}
