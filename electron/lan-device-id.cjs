const crypto = require('node:crypto');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const ID_DOMAIN = 'com.xwz.nest-asset-library.lan-account.v1';

function commandOutput(command, args) {
  return execFileSync(command, args, {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 3000,
    stdio: ['ignore', 'pipe', 'ignore']
  }).trim();
}

function windowsIdentityParts() {
  const registry = commandOutput('reg.exe', [
    'query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'
  ]);
  const machineGuid = registry.match(/MachineGuid\s+REG_SZ\s+([\da-f-]{32,36})/i)?.[1];
  const account = commandOutput('whoami.exe', ['/user', '/fo', 'csv', '/nh']);
  const accountSid = account.match(/\bS-1-(?:\d+-){1,14}\d+\b/i)?.[0];
  if (!machineGuid || !accountSid) throw new Error('无法读取 Windows 机器码或当前账户 SID');
  return [`windows:${machineGuid.toLowerCase()}`, accountSid.toUpperCase()];
}

function macIdentityParts() {
  const hardware = commandOutput('/usr/sbin/ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice']);
  const machineGuid = hardware.match(/"IOPlatformUUID"\s*=\s*"([\da-f-]{36})"/i)?.[1];
  if (!machineGuid || typeof process.getuid !== 'function') throw new Error('无法读取 macOS 设备或当前账户标识');
  return [`macos:${machineGuid.toLowerCase()}`, `uid:${process.getuid()}`];
}

function linuxIdentityParts() {
  const machineGuid = fs.readFileSync('/etc/machine-id', 'utf8').trim();
  if (!/^[\da-f]{32}$/i.test(machineGuid) || typeof process.getuid !== 'function') throw new Error('无法读取 Linux 设备或当前账户标识');
  return [`linux:${machineGuid.toLowerCase()}`, `uid:${process.getuid()}`];
}

function machineAccountDeviceId(platform = process.platform) {
  const parts = platform === 'win32' ? windowsIdentityParts()
    : platform === 'darwin' ? macIdentityParts()
      : platform === 'linux' ? linuxIdentityParts()
        : null;
  if (!parts) throw new Error(`不支持的平台：${platform}`);
  const bytes = crypto.createHash('sha256').update(ID_DOMAIN).update('\0').update(parts[0]).update('\0').update(parts[1]).digest();
  // App-scoped SHA-256 identity encoded as an RFC-compatible UUIDv8.
  bytes[6] = (bytes[6] & 0x0f) | 0x80;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

module.exports = { machineAccountDeviceId };
