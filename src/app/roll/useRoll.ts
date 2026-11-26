import { useCallback, useEffect, useRef, useState } from 'react'
import { newEntryId, rollBytes, type NewRollEntry, type RollEntry } from './entry'
import { clearEntries, deleteEntry, listEntries, putEntry, RollStorageError } from './store'

export interface Roll {
  /** Newest first. */
  entries: readonly RollEntry[]
  ready: boolean
  /** False when on-device storage is unavailable: the roll then lasts for this session only. */
  persistent: boolean
  /** Why storage is unavailable, shown in the roll sheet. */
  notice: string | null
  bytes: number
  /** Keep an exposure. Rejects with a user-facing message (e.g. the disk is full). */
  add: (entry: NewRollEntry) => Promise<RollEntry>
  remove: (id: string) => Promise<void>
  clear: () => Promise<void>
}

const messageOf = (err: unknown, fallback: string): string => (err instanceof Error && err.message ? err.message : fallback)

/**
 * The camera roll: every exposure kept on this device in IndexedDB. If storage cannot open
 * (private mode, blocked site data) the roll still works for the session, in memory.
 */
export function useRoll(): Roll {
  const [entries, setEntries] = useState<readonly RollEntry[]>([])
  const [ready, setReady] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const persistent = useRef(true)

  useEffect(() => {
    let alive = true
    listEntries()
      .then((list) => {
        if (alive) setEntries((current) => [...current, ...list.filter((e) => !current.some((c) => c.id === e.id))])
      })
      .catch((err: unknown) => {
        persistent.current = false
        if (alive) setNotice(messageOf(err, 'On-device storage is unavailable, so the roll lasts until you close the tab.'))
      })
      .finally(() => {
        if (alive) setReady(true)
      })
    return () => {
      alive = false
    }
  }, [])

  const add = useCallback(async (input: NewRollEntry): Promise<RollEntry> => {
    const now = Date.now()
    const entry: RollEntry = { ...input, id: newEntryId(now), createdAt: now }
    if (persistent.current) {
      try {
        await putEntry(entry)
      } catch (err: unknown) {
        if (err instanceof RollStorageError && err.quota) throw err
        // Storage broke mid-session: keep going in memory and say so once.
        persistent.current = false
        setNotice(`${messageOf(err, 'On-device storage stopped working.')} New shots stay until you close the tab.`)
      }
    }
    setEntries((list) => [entry, ...list])
    return entry
  }, [])

  const remove = useCallback(async (id: string) => {
    if (persistent.current) await deleteEntry(id)
    setEntries((list) => list.filter((e) => e.id !== id))
  }, [])

  const clear = useCallback(async () => {
    if (persistent.current) await clearEntries()
    setEntries([])
  }, [])

  return { entries, ready, persistent: notice === null, notice, bytes: rollBytes(entries), add, remove, clear }
}
