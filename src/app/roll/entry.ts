/**
 * Camera-roll entries: one developed exposure with its thumbnail, the settings that made it and,
 * for photos, the untouched original so it can be developed again on another body.
 * Records read back from IndexedDB are validated here before the UI sees them.
 */
import type { Params } from '../../cameras/types'
import { isRecord, sanitizeRig, type PersistedRig, type Snapshot } from '../snapshot'

export type RollKind = 'photo' | 'gif' | 'video' | 'sheet'
export const ROLL_KINDS: readonly RollKind[] = ['photo', 'gif', 'video', 'sheet']

export interface RollEntry extends Snapshot {
  id: string
  createdAt: number
  kind: RollKind
  /** The developed file: PNG, GIF, WebM/MP4 or the contact sheet. */
  blob: Blob
  /** Small JPEG for the grid; null if the browser could not make one. */
  thumb: Blob | null
  /** The untouched source of a photo, for re-developing. */
  original: Blob | null
  filename: string
  width: number
  height: number
}

/** What a caller hands the roll; id and time are assigned on the way in. */
export type NewRollEntry = Omit<RollEntry, 'id' | 'createdAt'>

export const newEntryId = (now: number): string => `${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`

const isBlob = (v: unknown): v is Blob => typeof Blob !== 'undefined' && v instanceof Blob
const isSize = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v > 0 && v <= 100_000

function plainParams(v: unknown): Params | null {
  if (!isRecord(v)) return null
  const ok = Object.values(v).every((x) => typeof x === 'number' || typeof x === 'string' || typeof x === 'boolean')
  return ok ? (v as Params) : null
}

/** The structured-clone record written to IndexedDB (only known fields, nothing else). */
export function toRollRecord(e: RollEntry): Record<string, unknown> {
  return {
    id: e.id,
    createdAt: e.createdAt,
    kind: e.kind,
    blob: e.blob,
    thumb: e.thumb,
    original: e.original,
    filename: e.filename,
    width: e.width,
    height: e.height,
    bodyId: e.bodyId,
    params: { ...e.params },
    rig: { ...e.rig },
  }
}

/** A stored record as an entry, or null if it is damaged. The body id is kept even if unknown (re-develop checks it). */
export function fromRollRecord(raw: unknown): RollEntry | null {
  if (!isRecord(raw)) return null
  const { id, createdAt, kind, blob, thumb, original, filename, width, height, bodyId } = raw
  if (typeof id !== 'string' || !id || typeof createdAt !== 'number' || !Number.isFinite(createdAt)) return null
  if (!ROLL_KINDS.includes(kind as RollKind) || !isBlob(blob)) return null
  if (typeof filename !== 'string' || !filename || typeof bodyId !== 'string' || !isSize(width) || !isSize(height)) return null
  const params = plainParams(raw.params)
  if (!params) return null
  return {
    id,
    createdAt,
    kind: kind as RollKind,
    blob,
    thumb: isBlob(thumb) ? thumb : null,
    original: kind === 'photo' && isBlob(original) ? original : null,
    filename,
    width,
    height,
    bodyId,
    params,
    rig: sanitizeRig(raw.rig) as PersistedRig,
  }
}

/** Newest first. */
export const byNewest = (a: RollEntry, b: RollEntry): number => b.createdAt - a.createdAt

/** Bytes this roll holds on the device. */
export function rollBytes(entries: readonly RollEntry[]): number {
  return entries.reduce((sum, e) => sum + e.blob.size + (e.thumb?.size ?? 0) + (e.original?.size ?? 0), 0)
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

/** True for the browser's "storage is full" failures across engines. */
export function isQuotaError(err: unknown): boolean {
  if (!isRecord(err) && !(err instanceof Error)) return false
  const { name, code } = err as { name?: unknown; code?: unknown }
  return name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED' || code === 22 || code === 1014
}

export const QUOTA_MESSAGE = 'The camera roll is full: this device has no room left for it. Delete a few shots or clear the roll.'

export const KIND_LABEL: Readonly<Record<RollKind, string>> = { photo: 'Photo', gif: 'GIF', video: 'Clip', sheet: 'Sheet' }
