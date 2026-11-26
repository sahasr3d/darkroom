/**
 * IndexedDB storage for the camera roll. A database of its own (the custom-grade store keeps
 * `darkroom`), one object store keyed by entry id. Errors are re-thrown with a message the
 * studio can show as is; a full disk becomes QUOTA_MESSAGE.
 */
import { byNewest, fromRollRecord, isQuotaError, QUOTA_MESSAGE, toRollRecord, type RollEntry } from './entry'

const DB_NAME = 'darkroom-roll'
const DB_VERSION = 1
const STORE = 'shots'

export class RollStorageError extends Error {
  readonly quota: boolean
  constructor(message: string, quota = false) {
    super(message)
    this.name = 'RollStorageError'
    this.quota = quota
  }
}

function wrap(err: unknown, fallback: string): RollStorageError {
  if (err instanceof RollStorageError) return err
  if (isQuotaError(err)) return new RollStorageError(QUOTA_MESSAGE, true)
  return new RollStorageError(err instanceof Error && err.message ? `${fallback} (${err.message})` : fallback)
}

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new RollStorageError('This browser has no on-device storage here, so the roll lasts until you close the tab.'))
      return
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' })
    }
    req.onsuccess = () => {
      const db = req.result
      // Another tab upgrading the schema: let go so it can proceed, reopen on next use.
      db.onversionchange = () => {
        db.close()
        dbPromise = null
      }
      resolve(db)
    }
    req.onerror = () => reject(wrap(req.error, 'On-device storage could not open, so the roll lasts until you close the tab.'))
    req.onblocked = () => reject(new RollStorageError('Close other Darkroom tabs so the camera roll can open.'))
  }).catch((err: unknown) => {
    dbPromise = null
    throw err
  })
  return dbPromise
}

async function run<T>(mode: IDBTransactionMode, fallback: string, body: (store: IDBObjectStore) => IDBRequest | null): Promise<T> {
  const db = await openDb()
  return new Promise<T>((resolve, reject) => {
    let tx: IDBTransaction
    try {
      tx = db.transaction(STORE, mode)
    } catch (err: unknown) {
      reject(wrap(err, fallback))
      return
    }
    const req = body(tx.objectStore(STORE))
    tx.oncomplete = () => resolve((req?.result ?? undefined) as T)
    // A request error bubbles here before tx.error is set, so read it from the failing request.
    tx.onerror = (e) => reject(wrap((e.target as IDBRequest | null)?.error ?? tx.error, fallback))
    tx.onabort = () => reject(wrap(tx.error, fallback))
  })
}

/** Every readable entry, newest first. Damaged records are skipped. */
export async function listEntries(): Promise<RollEntry[]> {
  const raw = await run<unknown[]>('readonly', 'The camera roll could not be read.', (s) => s.getAll())
  return (Array.isArray(raw) ? raw : [])
    .map(fromRollRecord)
    .filter((e): e is RollEntry => e !== null)
    .sort(byNewest)
}

export async function putEntry(entry: RollEntry): Promise<void> {
  await run('readwrite', 'The shot could not be kept in the camera roll.', (s) => s.put(toRollRecord(entry)))
}

export async function deleteEntry(id: string): Promise<void> {
  await run('readwrite', 'The shot could not be deleted.', (s) => s.delete(id))
}

export async function clearEntries(): Promise<void> {
  await run('readwrite', 'The camera roll could not be cleared.', (s) => s.clear())
}
