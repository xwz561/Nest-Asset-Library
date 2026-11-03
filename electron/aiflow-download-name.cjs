function unquote(value) {
  const text = String(value || '').trim();
  if (text.length >= 2 && text.startsWith('"') && text.endsWith('"')) {
    return text.slice(1, -1).replace(/\\(.)/g, '$1');
  }
  return text;
}

function filenameFromContentDisposition(header) {
  const value = String(header || '');
  const extended = /(?:^|;)\s*filename\*\s*=\s*([^;]+)/i.exec(value)?.[1];
  if (extended) {
    const encoded = unquote(extended).split("''", 2).at(-1);
    try {
      const decoded = decodeURIComponent(encoded);
      if (decoded.trim()) return decoded.trim();
    } catch {}
  }
  const standard = /(?:^|;)\s*filename\s*=\s*("(?:[^"\\]|\\.)*"|[^;]*)/i.exec(value)?.[1];
  return unquote(standard).trim();
}

module.exports = { filenameFromContentDisposition };
