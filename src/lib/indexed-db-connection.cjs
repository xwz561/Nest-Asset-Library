function createIndexedDBConnection(openRequest, upgrade) {
  let pending = null;
  function get() {
    if (pending) return pending.promise;
    const entry = {};
    entry.promise = new Promise((resolve, reject) => {
      let request;
      const reset = () => { if (pending === entry) pending = null; };
      try { request = openRequest(); }
      catch (error) { queueMicrotask(reset); reject(error); return; }
      request.onupgradeneeded = () => upgrade(request.result);
      request.onerror = () => { reset(); reject(request.error); };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); reset(); };
        db.onclose = reset;
        resolve(db);
      };
    });
    pending = entry;
    return entry.promise;
  }
  return { get };
}
module.exports = { createIndexedDBConnection };
