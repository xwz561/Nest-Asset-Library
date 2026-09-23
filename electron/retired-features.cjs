function removeRetiredVirtualGroups(data) {
  if (!data || typeof data !== 'object' || !Object.prototype.hasOwnProperty.call(data, 'collections')) return false;
  delete data.collections;
  return true;
}

module.exports = { removeRetiredVirtualGroups };
