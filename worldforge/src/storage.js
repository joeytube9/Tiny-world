// Local persistence: IndexedDB (preferred, larger quota) with localStorage
// fallback. Every call is guarded; failures surface as messages, never crashes.
const DB = 'worldforge';
const STORE = 'saves';
let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    try {
      if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB unavailable'));
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
      req.onblocked = () => reject(new Error('IndexedDB blocked'));
    } catch (e) {
      reject(e);
    }
  });
  dbPromise.catch(() => { dbPromise = null; });
  return dbPromise;
}

async function idb(mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const st = tx.objectStore(STORE);
    const r = fn(st);
    tx.oncomplete = () => resolve(r && 'result' in r ? r.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('aborted'));
  });
}

const LS_PREFIX = 'worldforge.save.';

export const storage = {
  async put(name, data) {
    const json = typeof data === 'string' ? data : JSON.stringify(data);
    try {
      await idb('readwrite', (st) => st.put(json, name));
      return { ok: true, where: 'IndexedDB', bytes: json.length };
    } catch (e) {
      try {
        localStorage.setItem(LS_PREFIX + name, json);
        return { ok: true, where: 'localStorage', bytes: json.length };
      } catch (e2) {
        return { ok: false, error: `Storage unavailable or full (${e2.name || e2.message})` };
      }
    }
  },
  async get(name) {
    try {
      const r = await idb('readonly', (st) => st.get(name));
      if (r) return r;
    } catch (e) { /* fall through */ }
    try {
      return localStorage.getItem(LS_PREFIX + name);
    } catch (e) {
      return null;
    }
  },
  async list() {
    const names = new Set();
    try {
      const keys = await idb('readonly', (st) => st.getAllKeys());
      (keys || []).forEach((k) => names.add(String(k)));
    } catch (e) { /* ignore */ }
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(LS_PREFIX)) names.add(k.slice(LS_PREFIX.length));
      }
    } catch (e) { /* ignore */ }
    return [...names].sort();
  },
  async remove(name) {
    try { await idb('readwrite', (st) => st.delete(name)); } catch (e) { /* ignore */ }
    try { localStorage.removeItem(LS_PREFIX + name); } catch (e) { /* ignore */ }
  },
  // small preferences (settings, tutorial, unlocks) in localStorage
  pref(key, value) {
    try {
      if (value === undefined) {
        const v = localStorage.getItem('worldforge.pref.' + key);
        return v ? JSON.parse(v) : null;
      }
      localStorage.setItem('worldforge.pref.' + key, JSON.stringify(value));
      return true;
    } catch (e) {
      return null;
    }
  },
};
