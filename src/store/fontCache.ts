'use client';

/**
 * IndexedDB persistence for the single custom-font slot.
 *
 * On font upload (or design-load that includes an embedded font), we cache
 * the bytes + family name under a fixed key. On page mount, useAutoSave
 * restores from the cache so the custom font survives reloads, tab closures,
 * and browser restarts (within per-origin quota and absent eviction).
 *
 * Storage scope: per-browser, per-origin. Cross-device sync still requires
 * the full Save Design JSON flow.
 *
 * All entry points are no-throw. On any IndexedDB error (not supported,
 * quota exceeded, version mismatch, blocked transaction, etc.) we log a
 * warning and degrade silently to the prior in-memory-only behavior.
 */

const DB_NAME = 'boxmaker';
const DB_VERSION = 1;
const STORE = 'customFont';
const KEY = 'current';

export type CachedFont = { name: string; buffer: ArrayBuffer };

function isSupported(): boolean {
  return typeof window !== 'undefined' && 'indexedDB' in window;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
  });
}

export async function idbSaveCustomFont(name: string, buffer: ArrayBuffer): Promise<void> {
  if (!isSupported()) return;
  try {
    const db = await openDB();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        const req = tx.objectStore(STORE).put({ name, buffer } satisfies CachedFont, KEY);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve();
      });
    } finally {
      db.close();
    }
  } catch (err) {
    console.warn('[BoxMaker] IndexedDB font save failed (ignoring):', err);
  }
}

export async function idbLoadCustomFont(): Promise<CachedFont | null> {
  if (!isSupported()) return null;
  try {
    const db = await openDB();
    try {
      return await new Promise<CachedFont | null>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).get(KEY);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve((req.result as CachedFont | undefined) ?? null);
      });
    } finally {
      db.close();
    }
  } catch (err) {
    console.warn('[BoxMaker] IndexedDB font load failed (ignoring):', err);
    return null;
  }
}

export async function idbClearCustomFont(): Promise<void> {
  if (!isSupported()) return;
  try {
    const db = await openDB();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        const req = tx.objectStore(STORE).delete(KEY);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve();
      });
    } finally {
      db.close();
    }
  } catch (err) {
    console.warn('[BoxMaker] IndexedDB font clear failed (ignoring):', err);
  }
}
