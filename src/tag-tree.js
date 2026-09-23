export function buildTagTree(tags = [], expanded = new Set()) {
  const nodes = new Map();
  for (const raw of tags) {
    const parts = String(raw).split('/').map(part => part.trim()).filter(Boolean);
    for (let index = 0; index < parts.length; index++) {
      const path = parts.slice(0, index + 1).join('/');
      if (!nodes.has(path)) nodes.set(path, { path, name: parts[index], depth: index, children: new Set(), explicit: false });
      if (index) nodes.get(parts.slice(0, index).join('/')).children.add(path);
    }
    if (parts.length) nodes.get(parts.join('/')).explicit = true;
  }
  const rows = [];
  const visit = path => {
    const node = nodes.get(path); if (!node) return;
    rows.push({ ...node, children: [...node.children].sort((a,b)=>a.localeCompare(b,'zh-CN')), hasChildren: node.children.size > 0 });
    if (expanded.has(path)) for (const child of [...node.children].sort((a,b)=>a.localeCompare(b,'zh-CN'))) visit(child);
  };
  for (const node of [...nodes.values()].filter(item => item.depth === 0).sort((a,b)=>a.name.localeCompare(b.name,'zh-CN'))) visit(node.path);
  return rows;
}

export const assetMatchesTag = (assetTags, selected) => !selected || (assetTags || []).some(tag => tag === selected || tag.startsWith(`${selected}/`));
