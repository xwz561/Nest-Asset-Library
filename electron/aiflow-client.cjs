function normalizeBaseUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) throw new Error('请填写 AI Flow 服务地址');
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('AI Flow 服务地址格式不正确');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash || url.search) {
    throw new Error('AI Flow 服务地址必须是 HTTP 或 HTTPS 根地址');
  }
  return url.toString().replace(/\/+$/, '');
}

function normalizeToken(value) {
  return String(value || '').trim().replace(/^Bearer\s+/i, '');
}

function publicAccount(payload = {}) {
  const source = payload?.user && typeof payload.user === 'object' ? payload.user : null;
  if (!source) return null;
  const id = source.id ?? source.userId ?? source.user_id;
  const username = String(source.username || '').trim();
  const displayName = String(source.displayName || source.display_name || '').trim();
  if (id == null && !username && !displayName) return null;
  return {
    id: id == null ? '' : String(id),
    username,
    displayName,
  };
}

function publicVideo(item = {}) {
  const taskId = String(item.taskId || item.id || '').trim();
  const numberOrNull = value => Number.isFinite(Number(value)) ? Number(value) : null;
  const timestamp = value => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const text = String(value || '').trim();
    if (!text) return 0;
    const parsed = Date.parse(text.replace(' ', 'T'));
    return Number.isFinite(parsed) ? parsed : 0;
  };
  return {
    taskId,
    name: String(item.deliveryName || item.downloadName || taskId || '未命名视频'),
    model: String(item.model || ''),
    prompt: String(item.prompt || ''),
    duration: Number(item.duration) || 0,
    completedAt: timestamp(item.completedAt || item.time),
    submittedAt: String(item.time || item.submittedAt || '').trim(),
    projectId: String(item.projectId || ''),
    projectName: String(item.projectName || item.project_name || '').trim(),
    episodeId: String(item.episodeId || ''),
    episodeName: String(item.episodeName || item.episode_name || '').trim(),
    episodeSort: numberOrNull(item.episodeSort || item.episode_sort),
    episodeNumber: numberOrNull(item.episodeNumber || item.episode_number),
    storyOrder: numberOrNull(item.storyOrder || item.story_order),
    shotNumber: numberOrNull(item.shotNumber || item.shot_number),
    versionNumber: item.versionNumber ?? null,
  };
}

function publicEpisode(item = {}) {
  const id = item.id ?? item.episodeId ?? item.episode_id;
  if (id == null || String(id).trim() === '') return null;
  return {
    id: String(id),
    name: String(item.name || item.episodeName || item.episode_name || '').trim(),
    sortOrder: Number.isFinite(Number(item.sortOrder ?? item.sort_order)) ? Number(item.sortOrder ?? item.sort_order) : null,
    episodeNumber: Number.isFinite(Number(item.episodeNumber ?? item.episode_number)) ? Number(item.episodeNumber ?? item.episode_number) : null,
  };
}

function publicProject(item = {}) {
  const id = item.id ?? item.projectId ?? item.project_id;
  if (id == null || String(id).trim() === '') return null;
  return {
    id: String(id),
    name: String(item.name || item.projectName || item.project_name || '').trim(),
    episodes: (Array.isArray(item.episodes) ? item.episodes : []).map(publicEpisode).filter(Boolean),
  };
}

function accessibleProjects(payload) {
  const items = Array.isArray(payload?.items)
    ? payload.items
    : Array.isArray(payload?.data?.items)
      ? payload.data.items
      : [];
  return items
    .filter(item => item?.canAccess !== false)
    .map(publicProject)
    .filter(Boolean);
}

function attachProjectAndEpisodeLabels(videos, projects) {
  const projectById = new Map((Array.isArray(projects) ? projects : []).map(project => [String(project.id), project]));
  return (Array.isArray(videos) ? videos : []).map(video => {
    const project = projectById.get(String(video.projectId || ''));
    const episode = project?.episodes?.find(item => item.id === String(video.episodeId || ''));
    return {
      ...video,
      projectName: video.projectName || project?.name || '',
      episodeName: video.episodeName || episode?.name || '',
      episodeSort: video.episodeSort ?? episode?.sortOrder ?? null,
      episodeNumber: video.episodeNumber ?? episode?.episodeNumber ?? null,
    };
  });
}

function completedVideos(payload) {
  const items = Array.isArray(payload?.items)
    ? payload.items
    : Array.isArray(payload?.data?.items)
      ? payload.data.items
      : [];
  return items
    .filter(item => item?.status === 'COMPLETED' && item?.videoUrl && !item?.relaying)
    .map(publicVideo)
    .filter(item => item.taskId);
}

async function parseError(response, action) {
  let detail = '';
  try {
    const payload = await response.clone().json();
    detail = String(payload?.error || payload?.message || '');
  } catch {
    // Keep the HTTP status as a safe, actionable error without echoing request headers.
  }
  throw new Error(`${action}失败（${response.status}${detail ? `：${detail.slice(0, 180)}` : ''}）`);
}

function createAIFlowClient({ baseUrl, token, fetchImpl, authMode }) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const normalizedToken = normalizeToken(token);
  const normalizedAuthMode = authMode === 'token'
    ? 'token'
    : authMode === 'session'
      ? 'session'
      : normalizedToken
        ? 'token'
        : 'session';
  if (normalizedAuthMode === 'token' && !normalizedToken) throw new Error('请先填写 AI Flow 访问令牌，或切换为账号登录');
  if (typeof fetchImpl !== 'function') throw new Error('当前运行环境无法访问 AI Flow');

  const request = async (relativePath, options = {}) => {
    const url = new URL(relativePath.replace(/^\//, ''), `${normalizedBaseUrl}/`).toString();
    const headers = { ...(options.headers || {}) };
    if (normalizedAuthMode === 'token') headers.Authorization = `Bearer ${normalizedToken}`;
    return fetchImpl(url, {
      ...options,
      credentials: options.credentials || 'include',
      headers,
    });
  };

  return {
    baseUrl: normalizedBaseUrl,
    authMode: normalizedAuthMode,
    async testConnection() {
      const response = await request('/auth/me');
      if (!response.ok) await parseError(response, '连接 AI Flow');
      let payload = {};
      try {
        payload = await response.json();
      } catch {
        // A successful response is still enough to prove the connection.
      }
      return { ok: true, account: publicAccount(payload) };
    },
    async listCompletedVideos(options = 300) {
      const input = options && typeof options === 'object' ? options : { limit: options };
      const safeLimit = Math.max(1, Math.min(2000, Number(input.limit) || 300));
      const params = new URLSearchParams({ limit: String(safeLimit) });
      if (input.episodeId != null && String(input.episodeId).trim()) {
        const episodeId = String(input.episodeId).trim();
        if (!/^\d{1,18}$/.test(episodeId)) throw new Error('AI Flow 集数 ID 无效');
        params.set('episode_id', episodeId);
      }
      const response = await request(`/auth/history?${params.toString()}`);
      if (!response.ok) await parseError(response, '读取 AI Flow 历史任务');
      let payload;
      try {
        payload = await response.json();
      } catch {
        throw new Error('AI Flow 返回的数据无法识别');
      }
      return completedVideos(payload);
    },
    async listProjects() {
      const response = await request('/auth/gen-projects');
      if (!response.ok) await parseError(response, '读取 AI Flow 项目与集数');
      let payload;
      try {
        payload = await response.json();
      } catch {
        throw new Error('AI Flow 返回的项目数据无法识别');
      }
      return accessibleProjects(payload);
    },
    async downloadVideo(taskId) {
      const safeTaskId = String(taskId || '').trim();
      if (!safeTaskId || !/^[A-Za-z0-9._-]{1,180}$/.test(safeTaskId)) throw new Error('AI Flow 任务 ID 无效');
      const response = await request(`/videos/${encodeURIComponent(safeTaskId)}.mp4?download=1`);
      if (!response.ok) await parseError(response, '下载 AI Flow 视频');
      if (!response.body) throw new Error('AI Flow 未返回视频内容');
      return response;
    },
  };
}

module.exports = {
  normalizeBaseUrl,
  normalizeToken,
  publicAccount,
  publicVideo,
  publicEpisode,
  publicProject,
  accessibleProjects,
  attachProjectAndEpisodeLabels,
  completedVideos,
  createAIFlowClient,
};
