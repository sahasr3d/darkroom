/**
 * Recipes: a named body + params + rig. Kept in localStorage and shareable as a compact URL hash
 * (`#r=` + base64url JSON holding only what differs from stock). Everything read back is
 * validated and size-capped.
 */
import { bodyById } from '../cameras/registry'
import { diffParams, diffRig, isRecord, sanitizeSnapshot, type Snapshot } from './snapshot'

export const RECIPES_KEY = 'darkroom.recipes'
const RECIPES_VERSION = 1
export const MAX_RECIPES = 60
export const MAX_NAME = 40
/** Longest `#r=` payload accepted from a link: generous for any real recipe, cheap to reject. */
export const MAX_HASH_CHARS = 2048
export const HASH_PREFIX = '#r='

export interface Recipe extends Snapshot {
  id: string
  name: string
  createdAt: number
}

/** Trimmed, single-line, at most MAX_NAME characters; empty means invalid. */
export function cleanName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME)
}

export const newRecipeId = (): string => `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`

function parseRecipe(raw: unknown): Recipe | null {
  if (!isRecord(raw) || typeof raw.id !== 'string' || typeof raw.name !== 'string') return null
  const name = cleanName(raw.name)
  const snap = sanitizeSnapshot(raw.bodyId, raw.params, raw.rig)
  if (!name || !snap) return null
  const createdAt = typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt) ? raw.createdAt : 0
  return { id: raw.id.slice(0, 40), name, createdAt, ...snap }
}

/** The stored recipe list; malformed entries are skipped, never fatal. */
export function parseRecipes(text: string | null): Recipe[] {
  if (!text) return []
  try {
    const raw: unknown = JSON.parse(text)
    if (!isRecord(raw) || raw.v !== RECIPES_VERSION || !Array.isArray(raw.items)) return []
    return raw.items
      .slice(0, MAX_RECIPES)
      .map(parseRecipe)
      .filter((r): r is Recipe => r !== null)
  } catch {
    return []
  }
}

export function serializeRecipes(recipes: readonly Recipe[]): string {
  return JSON.stringify({ v: RECIPES_VERSION, items: recipes.slice(0, MAX_RECIPES) })
}

// ---------------------------------------------------------------------------
// Share links

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let bin = ''
  bytes.forEach((b) => {
    bin += String.fromCharCode(b)
  })
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(data: string): string {
  const b64 = data.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
}

/** `#r=…` for a snapshot: only the params and rig fields that differ from stock. */
export function encodeRecipeHash(snap: Snapshot, name?: string): string {
  const p = diffParams(bodyById(snap.bodyId), snap.params)
  const g = diffRig(snap.rig)
  const payload: Record<string, unknown> = { v: RECIPES_VERSION, b: snap.bodyId }
  const n = name ? cleanName(name) : ''
  if (n) payload.n = n
  if (Object.keys(p).length) payload.p = p
  if (Object.keys(g).length) payload.g = g
  return `${HASH_PREFIX}${toBase64Url(JSON.stringify(payload))}`
}

export interface LinkedRecipe extends Snapshot {
  name: string | null
}

/** The recipe in a `#r=` hash, or null if there is none or it is malformed, oversized or for an unknown body. */
export function decodeRecipeHash(hash: string): LinkedRecipe | null {
  if (!hash.startsWith(HASH_PREFIX)) return null
  const data = hash.slice(HASH_PREFIX.length)
  if (!data || data.length > MAX_HASH_CHARS || !/^[A-Za-z0-9_-]+$/.test(data)) return null
  let raw: unknown
  try {
    raw = JSON.parse(fromBase64Url(data))
  } catch {
    return null
  }
  if (!isRecord(raw) || raw.v !== RECIPES_VERSION || typeof raw.b !== 'string') return null
  // Missing params and rig fields fall back to the body's stock values inside the sanitizers.
  const snap = sanitizeSnapshot(raw.b, raw.p, raw.g)
  if (!snap) return null
  const name = typeof raw.n === 'string' ? cleanName(raw.n) : ''
  return { ...snap, name: name || null }
}
