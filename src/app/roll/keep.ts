/**
 * The one exit for every exposure: the shutter, Full-res PNG, Story 9:16, bursts and recorded
 * clips all hand their files to a `Keep` function, which stores them in the camera roll and
 * downloads them only when the "Also download each shot" setting asks for it (or when the roll
 * cannot take them, so nothing is ever lost).
 */
import type { ExportResult } from '../../engine/exporter'
import type { Snapshot } from '../snapshot'
import type { RollKind } from './entry'

export interface KeepItem {
  kind: RollKind
  blob: Blob
  filename: string
  width: number
  height: number
  snapshot: Snapshot
  /** Ready-made thumbnail; omitted → made from the image itself. Videos must pass one (or null). */
  thumb?: Blob | null
  /** Untouched source of a photo, for re-developing (and the optional original download). */
  original?: ExportResult | null
}

/** Store (and maybe download) the items; resolves to a status-line summary. */
export type Keep = (items: readonly KeepItem[]) => Promise<string>

export interface KeepOutcome {
  filename: string
  kept: boolean
  downloaded: boolean
  originalDownloaded: boolean
}

export function listNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/** One status line for a batch: what went to the roll, what was downloaded, what failed. */
export function keepSummary(outcomes: readonly KeepOutcome[], error: string | null): string {
  const kept = outcomes.filter((o) => o.kept)
  const failed = outcomes.filter((o) => !o.kept)
  const parts: string[] = []
  if (kept.length) {
    const names = listNames(kept.map((o) => o.filename))
    const original = kept.some((o) => o.originalDownloaded) ? ' with the original' : ''
    parts.push(kept.every((o) => o.downloaded) ? `Saved ${names}${original} to the roll and downloads.` : `Kept ${names} in the roll.`)
  }
  if (failed.length) parts.push(`${error ?? 'The camera roll could not keep this.'} Downloaded ${listNames(failed.map((o) => o.filename))} instead.`)
  return parts.join(' ')
}
