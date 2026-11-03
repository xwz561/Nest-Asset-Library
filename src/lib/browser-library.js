import { createIndexedDBConnection } from "./indexed-db-connection.cjs";

export const DB_NAME = "nest-assets";

export const STORE = "assets";

export const browserDatabase = createIndexedDBConnection(
  () => indexedDB.open(DB_NAME, 1),
  db => db.createObjectStore(STORE, { keyPath: "id" }),
);

export function openDB() { return browserDatabase.get(); }

export async function getAssets() {
  const db = await openDB();
  return new Promise((res, rej) => {
    const r = db.transaction(STORE).objectStore(STORE).getAll();
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

export async function saveAsset(asset) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const r = db.transaction(STORE, "readwrite").objectStore(STORE).put(asset);
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  });
}

export async function removeAsset(id) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const r = db.transaction(STORE, "readwrite").objectStore(STORE).delete(id);
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  });
}

export const PENDING_KEY = "nest-pending-edits";

export function readPending() {
  try {
    return JSON.parse(localStorage.getItem(PENDING_KEY) || "{}");
  } catch {
    return {};
  }
}

export function writePending(id, data) {
  const all = readPending();
  all[id] = { ...(all[id] || {}), ...data };
  localStorage.setItem(PENDING_KEY, JSON.stringify(all));
}

export function clearPending(id) {
  const all = readPending();
  delete all[id];
  if (Object.keys(all).length)
    localStorage.setItem(PENDING_KEY, JSON.stringify(all));
  else localStorage.removeItem(PENDING_KEY);
}
