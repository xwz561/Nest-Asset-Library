function parseHttpUrl(value, label) {
  let parsed;
  try {
    parsed = new URL(String(value || '').trim());
  } catch {
    throw new Error(`${label}无效`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error(`${label}无效`);
  }
  return parsed;
}

function parseAIFlowVideoSource(sourceUrl, baseUrl) {
  const source = parseHttpUrl(sourceUrl, 'AI Flow 视频地址');
  const base = parseHttpUrl(baseUrl, 'AI Flow 服务地址');
  if (source.origin !== base.origin) {
    throw new Error('只能复制当前 AI Flow 服务中的视频');
  }

  let pathname;
  try {
    pathname = decodeURIComponent(source.pathname);
  } catch {
    throw new Error('AI Flow 视频地址无效');
  }
  const match = /^\/videos\/([A-Za-z0-9._-]{1,180})\.mp4$/i.exec(pathname);
  if (!match) {
    throw new Error('未识别到 AI Flow 视频任务，请在 AI Flow 的视频画面上右键');
  }
  return { taskId: match[1] };
}

function resolveSelectedFolder(data, selectedFolderId) {
  const folderId = String(selectedFolderId || '').trim();
  if (!folderId) throw new Error('请先在小旺仔素材库中选定接收视频的文件夹');
  const folder = (data?.folders || []).find(item => item?.id === folderId);
  if (!folder) throw new Error('选定的素材库文件夹不存在或已被删除，请重新选择');
  return folder;
}

module.exports = { parseAIFlowVideoSource, resolveSelectedFolder };
