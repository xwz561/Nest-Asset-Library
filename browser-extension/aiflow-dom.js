(() => {
  if (window.NestAIFlowDOM) return;

  const SELECTORS = Object.freeze({
    workspace: '#assetLibrary, .gen-current-project, .task-card[data-taskid], [data-view="generate"]',
    project: '.gen-current-project[data-pid], #projSwitchBadge[data-project-id], #projSwitchBadge[data-projectid], #projSwitchBadge[data-pid], [data-project-id], [data-projectid], [data-pid], #projSwitchBadge',
    task: '.task-card[data-taskid], .task-card[data-task-id], [data-taskid].task-card',
    asset: '#assetLibrary .asset-lib-item[data-asset-id], #assetLibrary [data-asset-id].asset-lib-item',
    folderToolbar: '#assetLibrary .als-folder-bar-in, #assetLibrary .als-folder-bar, #assetLibrary [data-role="folder-toolbar"]',
    folderTab: '#assetLibrary .als-tab[data-tab], #assetLibrary [role="tab"][data-tab]',
    folderCrumb: '#assetLibrary [data-folder-id]',
  });

  const first = (selector, root = document) => root.querySelector(selector);
  const all = (selector, root = document) => [...root.querySelectorAll(selector)];
  const assetId = element => String(element?.dataset?.assetId || element?.getAttribute?.('data-asset-id') || '').trim();
  const taskId = element => String(element?.dataset?.taskid || element?.dataset?.taskId || '').trim();

  window.NestAIFlowDOM = Object.freeze({
    version: 1,
    selectors: SELECTORS,
    workspace: () => first(SELECTORS.workspace),
    project: () => first(SELECTORS.project),
    projectId: () => {
      // AI Flow's current project is represented by the project header or its
      // episode list. Prefer those anchors over arbitrary data-pid nodes elsewhere
      // in the page (which may belong to a stale card or unrelated widget).
      const selectors = [
        '.gen-current-project',
        '.gen-episode-list',
        '.gen-episode-item.active',
        '#projSwitchBadge',
        '#assetLibrary',
      ];
      const attributes = ['data-pid', 'data-project-id', 'data-projectid', 'data-current-project-id'];
      for (const selector of selectors) {
        for (const node of all(selector)) {
          for (const attribute of attributes) {
            const value = String(node.getAttribute(attribute) || '').trim();
            if (/^\d{1,18}$/.test(value)) return value;
          }
        }
      }
      // Newer builds may expose a project-specific attribute on a wrapper.
      for (const node of all('[data-project-id], [data-projectid]')) {
        for (const attribute of ['data-project-id', 'data-projectid']) {
          const value = String(node.getAttribute(attribute) || '').trim();
          if (/^\d{1,18}$/.test(value)) return value;
        }
      }
      return '';
    },
    tasks: () => all(SELECTORS.task),
    taskId,
    taskFromTarget: target => target instanceof Element ? target.closest(SELECTORS.task) : null,
    assetLibrary: () => first('#assetLibrary'),
    assets: () => all(SELECTORS.asset),
    assetId,
    assetById: id => all(SELECTORS.asset).find(element => assetId(element) === String(id)) || null,
    folderToolbar: () => first(SELECTORS.folderToolbar),
    folderTabs: () => all(SELECTORS.folderTab),
    activeFolderTab: () => all(SELECTORS.folderTab).find(tab =>
      tab.classList.contains('als-tab-active') || tab.getAttribute('aria-selected') === 'true' || tab.getAttribute('aria-current') === 'page'),
    folderCrumbs: () => all(SELECTORS.folderCrumb, first('#assetLibrary') || document),
    refreshButton: () => first('#assetLibReload, #assetLibrary [data-act="reload"], #assetLibrary [aria-label="刷新素材库"]'),
    projectName: () => String(first('#projSwitchBadge')?.textContent || first(SELECTORS.project)?.textContent || '').trim(),
  });
})();
