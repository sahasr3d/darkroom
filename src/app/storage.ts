/**
 * localStorage that never throws: private windows, blocked site data and full quotas all read as
 * "nothing stored" and report a failed write instead of crashing the studio.
 */

export function readStored(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null
  } catch {
    return null
  }
}

/** Resolves false when the value could not be stored. */
export function writeStored(key: string, value: string): boolean {
  try {
    globalThis.localStorage?.setItem(key, value)
    return true
  } catch {
    return false
  }
}

export function removeStored(key: string): void {
  try {
    globalThis.localStorage?.removeItem(key)
  } catch {
    // Nothing to clean up if storage is unavailable.
  }
}

/** Phones and tablets keep shots in the roll only; desktops also download each one by default. */
export function prefersDownloads(): boolean {
  try {
    return !globalThis.matchMedia?.('(pointer: coarse)').matches
  } catch {
    return true
  }
}
