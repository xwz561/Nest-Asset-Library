// 列出本机“固定磁盘”（不含网络盘/NAS 映射盘/光驱/U 盘），用于一键查找本机素材库。
// 只读系统信息；拿不到时退回到用户目录。
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

function listWindowsFixedDrives(timeoutMs = 8000) {
  return new Promise(resolve => {
    const script = "Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' | ForEach-Object { $_.DeviceID }";
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { timeout: timeoutMs, windowsHide: true }, (error, stdout) => {
      if (error) return resolve([]);
      resolve(String(stdout).split(/\r?\n/).map(line => line.trim()).filter(line => /^[A-Za-z]:$/.test(line)).map(line => `${line.toUpperCase()}\\`));
    });
  });
}

async function listLocalRoots() {
  const roots = [];
  if (process.platform === 'win32') roots.push(...await listWindowsFixedDrives());
  const home = os.homedir();
  // 用户目录放最后；如果它已经在某个盘里（如 C:\），查找时会因去重而跳过
  if (home && !roots.some(root => path.resolve(home).toLowerCase().startsWith(root.toLowerCase()))) roots.push(home);
  return roots;
}

module.exports = { listLocalRoots, listWindowsFixedDrives };
