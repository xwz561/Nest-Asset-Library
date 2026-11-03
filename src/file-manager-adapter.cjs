const Paths = require('@tagspaces/tagspaces-common/paths.js');
// Read-only TagSpaces metadata parsing; never rename or write a source file.
function describeFile(asset = {}) {
  const path = String(asset.path || asset.originalPath || asset.name || '');
  const name = String(asset.name || Paths.extractFileName(path) || '');
  return {path, name, format: Paths.extractFileExtension(name).toUpperCase(),
    filenameTags: [...new Set(Paths.extractTags(name, ' ').map(t => t.trim()).filter(Boolean))]};
}
function folderPositions(folders) {
  const groups = new Map(), result = new Map();
  for(const folder of folders) {const key=folder.parentId || null;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(folder);}
  for(const siblings of groups.values()) siblings.forEach((folder,index)=>result.set(folder.id,{position:index+1,size:siblings.length}));
  return result;
}
module.exports = {describeFile, folderPositions};
