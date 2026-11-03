export function formatImportResultMessage(report = {}) {
  const imported = Math.max(0, Number(report.imported) || 0);
  const duplicates = Math.max(0, Number(report.duplicates) || 0);
  const skippedUnsupported = Math.max(0, Number(report.skippedUnsupported) || 0);
  const errors = Array.isArray(report.errors) ? report.errors : [];

  if (errors.length && imported === 0) return errors[0];
  if (skippedUnsupported && imported === 0 && duplicates === 0 && errors.length === 0) {
    return `未导入素材，跳过不支持格式 ${skippedUnsupported} 个`;
  }
  return `已导入 ${imported} 个，跳过重复 ${duplicates} 个${skippedUnsupported ? `，跳过不支持格式 ${skippedUnsupported} 个` : ''}${errors.length ? `，失败 ${errors.length} 个` : ''}`;
}
