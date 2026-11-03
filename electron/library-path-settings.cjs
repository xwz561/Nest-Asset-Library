function resolveLibraryPath(currentPath, settings, indexExists) {
  if (typeof indexExists !== 'function') return null;
  for (const candidate of [currentPath, settings?.libraryPath]) {
    if (typeof candidate !== 'string' || !candidate.trim()) continue;
    try {
      if (indexExists(candidate)) return candidate;
    } catch {}
  }
  return null;
}

module.exports = { resolveLibraryPath };
