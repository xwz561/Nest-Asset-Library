function chooseUpdateAsset({ platform, arch, portable, assets }) {
  const list = Array.isArray(assets) ? assets : [];
  if (platform === 'darwin') {
    const targetArch = arch === 'arm64' ? 'arm64' : 'x64';
    return {
      asset: list.find(item => String(item?.name || '').includes(`macOS-${targetArch}`) && String(item?.name || '').endsWith('.dmg')) || null,
      installKind: `macOS ${targetArch}`,
    };
  }
  if (platform === 'win32') {
    const pattern = portable ? /Portable\.exe$/i : /Setup\.exe$/i;
    return {
      asset: list.find(item => pattern.test(String(item?.name || ''))) || null,
      installKind: portable ? 'Windows 单文件版' : 'Windows 安装版',
    };
  }
  return { asset: null, installKind: 'download' };
}

function isCompatibleUpdateFile({ platform, portable, name }) {
  const filename = String(name || '');
  if (platform === 'win32') return portable ? /Portable\.exe$/i.test(filename) : /Setup\.exe$/i.test(filename);
  if (platform === 'darwin') return /\.dmg$/i.test(filename);
  return false;
}

module.exports = { chooseUpdateAsset, isCompatibleUpdateFile };
