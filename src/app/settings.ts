/**
 * Remembered studio settings: last body, per-body params, the rig's look, aids and drawer tab.
 * Stored as versioned JSON; every field is validated on load and anything unusable falls back to
 * its default, so a bad or old record can never stop the app from starting.
 */
import { bodyById, CAMERA_BODIES } from '../cameras/registry'
import type { Params, ParamValue } from '../cameras/types'
import { DEFAULT_RIG } from '../engine/look'
import { DEFAULT_AIDS, DRAWER_TABS, GRID_KINDS, TIMER_SECONDS, type Aids, type DrawerTab } from './aids'
import { diffParams, hasBody, isRecord, persistRig, sanitizeParams, sanitizeRig, type PersistedRig } from './snapshot'

export const SETTINGS_KEY = 'darkroom.settings'
export const SETTINGS_VERSION = 1

export interface StudioSettings {
  bodyId: string
  paramsById: Record<string, Params>
  rig: PersistedRig
  aids: Aids
  tab: DrawerTab
  /** Also download each exposure, besides keeping it in the camera roll. */
  alsoDownload: boolean
}

export const DEFAULT_BODY_ID = 'fxn-r'

export function defaultSettings(alsoDownload: boolean): StudioSettings {
  return {
    bodyId: DEFAULT_BODY_ID,
    paramsById: Object.fromEntries(CAMERA_BODIES.map((b) => [b.id, b.defaults])),
    rig: persistRig(DEFAULT_RIG),
    aids: DEFAULT_AIDS,
    tab: 'body',
    alsoDownload,
  }
}

function sanitizeAids(raw: unknown): Aids {
  if (!isRecord(raw)) return DEFAULT_AIDS
  const bool = (k: 'level' | 'dualSave' | 'sound'): boolean => (typeof raw[k] === 'boolean' ? (raw[k] as boolean) : DEFAULT_AIDS[k])
  return {
    grid: GRID_KINDS.includes(raw.grid as Aids['grid']) ? (raw.grid as Aids['grid']) : DEFAULT_AIDS.grid,
    timer: TIMER_SECONDS.includes(raw.timer as Aids['timer']) ? (raw.timer as Aids['timer']) : DEFAULT_AIDS.timer,
    level: bool('level'),
    dualSave: bool('dualSave'),
    sound: bool('sound'),
  }
}

/**
 * Upgrade path for stored records. Each future version adds one step here that maps the
 * previous shape onto the next; records from an unknown (newer or corrupt) version are rejected
 * so a downgrade never misreads them.
 */
const MIGRATIONS: Readonly<Record<number, (raw: Record<string, unknown>) => Record<string, unknown>>> = {}

export function migrateSettings(raw: unknown): Record<string, unknown> | null {
  if (!isRecord(raw) || typeof raw.v !== 'number') return null
  let current = raw
  while (current.v !== SETTINGS_VERSION) {
    const step = MIGRATIONS[current.v as number]
    if (!step) return null
    current = step(current)
  }
  return current
}

/** Settings from the stored text, validated field by field over `fallback`. */
export function parseSettings(text: string | null, fallback: StudioSettings): StudioSettings {
  if (!text) return fallback
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return fallback
  }
  const raw = migrateSettings(parsed)
  if (!raw) return fallback
  const changed = isRecord(raw.changed) ? raw.changed : {}
  const paramsById = Object.fromEntries(
    CAMERA_BODIES.map((b) => {
      const diff = changed[b.id]
      return [b.id, isRecord(diff) ? sanitizeParams(b, { ...b.defaults, ...diff }) : fallback.paramsById[b.id]]
    }),
  )
  return {
    bodyId: hasBody(raw.bodyId) ? raw.bodyId : fallback.bodyId,
    paramsById,
    rig: sanitizeRig(raw.rig, fallback.rig),
    aids: sanitizeAids(raw.aids),
    tab: DRAWER_TABS.includes(raw.tab as DrawerTab) ? (raw.tab as DrawerTab) : fallback.tab,
    alsoDownload: typeof raw.alsoDownload === 'boolean' ? raw.alsoDownload : fallback.alsoDownload,
  }
}

/** Compact JSON: only bodies whose params were changed are written. */
export function serializeSettings(s: StudioSettings): string {
  const changed: Record<string, Record<string, ParamValue>> = {}
  for (const [id, params] of Object.entries(s.paramsById)) {
    if (!hasBody(id)) continue
    const diff = diffParams(bodyById(id), params)
    if (Object.keys(diff).length > 0) changed[id] = diff
  }
  return JSON.stringify({ v: SETTINGS_VERSION, bodyId: s.bodyId, changed, rig: s.rig, aids: s.aids, tab: s.tab, alsoDownload: s.alsoDownload })
}
