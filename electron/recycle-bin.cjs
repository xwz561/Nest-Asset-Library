const { spawn } = require('node:child_process');

const WINDOWS_RECYCLE_SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  '[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)',
  '$OutputEncoding = [Console]::OutputEncoding',
  'Add-Type -AssemblyName Microsoft.VisualBasic',
  'function Send-ToExplorerRecycleBin([string] $path) {',
  '  $shell = New-Object -ComObject Shell.Application',
  '  $parent = [IO.Path]::GetDirectoryName($path)',
  '  $leaf = [IO.Path]::GetFileName($path)',
  "  if ([string]::IsNullOrWhiteSpace($parent) -or [string]::IsNullOrWhiteSpace($leaf)) { throw 'Invalid recycle target' }",
  '  $sourceFolder = $shell.Namespace($parent)',
  '  $recycleBin = $shell.Namespace(10)',
  "  if ($null -eq $sourceFolder -or $null -eq $recycleBin) { throw 'Explorer recycle bin is unavailable' }",
  '  $item = $sourceFolder.ParseName($leaf)',
  "  if ($null -eq $item) { throw 'Explorer could not find recycle target' }",
  '  $recycleBin.MoveHere($item, 0x0014)',
  '  for ($i = 0; $i -lt 50 -and (Test-Path -LiteralPath $path); $i += 1) { Start-Sleep -Milliseconds 100 }',
  "  if (Test-Path -LiteralPath $path) { throw 'Explorer recycle did not complete' }",
  '}',
  "$target = [Environment]::GetEnvironmentVariable('NEST_RECYCLE_TARGET')",
  "if ([string]::IsNullOrWhiteSpace($target)) { throw 'Missing recycle target' }",
  'try {',
  '  if ([IO.File]::Exists($target)) {',
  '    [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($target, [Microsoft.VisualBasic.FileIO.UIOption]::OnlyErrorDialogs, [Microsoft.VisualBasic.FileIO.RecycleOption]::SendToRecycleBin, [Microsoft.VisualBasic.FileIO.UICancelOption]::ThrowException)',
  '  } elseif ([IO.Directory]::Exists($target)) {',
  '    [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($target, [Microsoft.VisualBasic.FileIO.UIOption]::OnlyErrorDialogs, [Microsoft.VisualBasic.FileIO.RecycleOption]::SendToRecycleBin, [Microsoft.VisualBasic.FileIO.UICancelOption]::ThrowException)',
  "  } else { throw 'Recycle target does not exist' }",
  '} catch {',
  '  Send-ToExplorerRecycleBin $target',
  '}',
].join('\n');

function recycleWithWindowsShell(target, { spawnImpl = spawn, env = process.env } = {}) {
  return new Promise((resolve, reject) => {
    let output = '';
    const child = spawnImpl('powershell.exe', [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', WINDOWS_RECYCLE_SCRIPT,
    ], {
      windowsHide: true,
      env: { ...env, NEST_RECYCLE_TARGET: target },
    });
    const capture = chunk => { output = (output + String(chunk)).slice(-2000); };
    child.stdout?.on('data', capture);
    child.stderr?.on('data', capture);
    child.once('error', reject);
    child.once('close', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(output.trim() || `Windows 回收站操作退出码 ${code}${signal ? `（${signal}）` : ''}`));
    });
  });
}

async function moveToRecycleBin(target, { trashItem, platform = process.platform, spawnImpl, env } = {}) {
  if (typeof trashItem !== 'function') throw new Error('系统回收站接口不可用');
  try {
    await trashItem(target);
    return { method: 'electron' };
  } catch (nativeError) {
    if (platform !== 'win32') throw nativeError;
    try {
      await recycleWithWindowsShell(target, { spawnImpl, env });
      return { method: 'windows-shell' };
    } catch (fallbackError) {
      throw new Error('系统回收站无法处理该项目，素材未删除。请关闭正在使用该目录或素材的程序后重试。');
    }
  }
}

module.exports = { WINDOWS_RECYCLE_SCRIPT, recycleWithWindowsShell, moveToRecycleBin };
