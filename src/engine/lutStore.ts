import type { CubeLut } from './lut'

/**
 * Keeps the loaded custom grade across reloads in IndexedDB. Fail-soft: private windows,
 * blocked storage or quota errors simply mean the grade isn't remembered.
 */

const DB_NAME = 'darkroom'
const STORE = 'grades'
const KEY = 'current'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable'))
      return
    }
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB could not open'))
  })
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await openDb()
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode)
      const req = run(tx.objectStore(STORE))
      tx.oncomplete = () => resolve(req.result as T)
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'))
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'))
    })
  } finally {
    db.close()
  }
}

const isCubeLut = (v: unknown): v is CubeLut => {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return typeof o.title === 'string' && typeof o.size === 'number' && o.data instanceof Float32Array && o.data.length === o.size ** 3 * 3 && Array.isArray(o.domainMin) && Array.isArray(o.domainMax)
}

/** The remembered grade, or null if there is none or storage is unavailable. */
export async function loadStoredLut(): Promise<CubeLut | null> {
  try {
    const value = await withStore<unknown>('readonly', (s) => s.get(KEY))
    return isCubeLut(value) ? value : null
  } catch {
    return null
  }
}

/** Remember the grade; resolves false if it couldn't be stored. */
export async function storeLut(lut: CubeLut): Promise<boolean> {
  try {
    await withStore('readwrite', (s) => s.put(lut, KEY))
    return true
  } catch {
    return false
  }
}

export async function clearStoredLut(): Promise<boolean> {
  try {
    await withStore('readwrite', (s) => s.delete(KEY))
    return true
  } catch {
    return false
  }
}
