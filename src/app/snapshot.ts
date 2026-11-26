/**
 * The portable part of a camera setup: which body, its params and the rig. Shared by remembered
 * settings, recipes (and their share links) and camera-roll entries. Everything read back from
 * storage or a URL goes through these sanitizers, so stale or hostile data can never reach the
 * renderer: unknown keys are dropped, wrong types fall back to defaults, numbers are clamped.
 */
import { bodyById, CAMERA_BODIES } from '../cameras/registry'
import type { CameraBody, Control, Params, ParamValue } from '../cameras/types'
import { ND_STOPS } from '../engine/exposure'
import { BLEND_MODES, DEFAULT_RIG, GELS, type Rig } from '../engine/look'

/** Rig fields that describe a look. Focus, double exposure, sensor state and the loaded LUT are moment-to-moment. */
export type PersistedRig = Omit<Rig, 'focus' | 'double' | 'hwExposure' | 'lutId'>

export interface Snapshot {
  bodyId: string
  params: Params
  rig: PersistedRig
}

type Check = (v: unknown) => unknown

const numberIn =
  (min: number, max: number): Check =>
  (v) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : undefined
const oneOf =
  <T>(options: readonly T[]): Check =>
  (v) =>
    options.includes(v as T) ? v : undefined
const isBool: Check = (v) => (typeof v === 'boolean' ? v : undefined)

const RIG_CHECKS: { readonly [K in keyof PersistedRig]: Check } = {
  focal: numberIn(13, 120),
  lens: oneOf(['none', 'fisheye', 'prism', 'starburst']),
  starPoints: oneOf([4, 6]),
  prismMode: oneOf(['split', 'kaleido']),
  nd: oneOf(ND_STOPS),
  flash: isBool,
  gel: oneOf(Object.keys(GELS)),
  leak: isBool,
  ev: numberIn(-3, 3),
  kelvin: numberIn(2500, 9000),
  tint: numberIn(-1, 1),
  manual: isBool,
  iso: numberIn(25, 12800),
  shutter: numberIn(1 / 8000, 30),
  stabilize: isBool,
  blend: oneOf(BLEND_MODES),
  balance: numberIn(0, 100),
  lutStrength: numberIn(0, 100),
}
const RIG_KEYS = Object.keys(RIG_CHECKS) as (keyof PersistedRig)[]

export const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** The look-describing fields of a rig. */
export function persistRig(rig: Rig): PersistedRig {
  return Object.fromEntries(RIG_KEYS.map((k) => [k, rig[k]])) as unknown as PersistedRig
}

/** Valid rig fields from `raw` laid over `base`; anything missing or malformed keeps the base value. */
export function sanitizeRig(raw: unknown, base: PersistedRig = persistRig(DEFAULT_RIG)): PersistedRig {
  if (!isRecord(raw)) return base
  const entries = RIG_KEYS.map((k) => {
    const v = RIG_CHECKS[k](raw[k])
    return [k, v === undefined ? base[k] : v] as const
  })
  return Object.fromEntries(entries) as unknown as PersistedRig
}

/** Only the rig fields that differ from the stock rig (compact links). */
export function diffRig(rig: PersistedRig): Partial<PersistedRig> {
  const stock = persistRig(DEFAULT_RIG)
  return Object.fromEntries(RIG_KEYS.filter((k) => rig[k] !== stock[k]).map((k) => [k, rig[k]])) as Partial<PersistedRig>
}

const MAX_FREE_STRING = 120
/** Numeric params with no range control of their own; the master intensity fader lives in the drawer. */
const UNDECLARED_RANGES: Readonly<Record<string, readonly [number, number]>> = { intensity: [0, 100] }
const FREE_NUMBER_LIMIT = 1_000_000
/** Params a body sets at runtime without declaring a default (Randomize writes `seed`). */
const RUNTIME_KEYS: readonly string[] = ['seed']

function controlFor(body: CameraBody, key: string): Control | undefined {
  for (const g of body.groups) for (const c of g.controls) if (c.key === key) return c
  return undefined
}

function checkParam(body: CameraBody, key: string, v: unknown, fallback: ParamValue): ParamValue {
  if (typeof v !== typeof fallback) return fallback
  const c = controlFor(body, key)
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return fallback
    const [min, max] = c?.kind === 'range' ? [c.min, c.max] : (UNDECLARED_RANGES[key] ?? [-FREE_NUMBER_LIMIT, FREE_NUMBER_LIMIT])
    return Math.min(max, Math.max(min, v))
  }
  if (typeof v === 'boolean') return v
  if (typeof v !== 'string') return fallback
  if (c?.kind === 'select' || c?.kind === 'swatch') return c.options.some((o) => o.value === v) ? v : fallback
  if (c?.kind === 'text') return v.length <= c.maxLength && (!c.validate || c.validate(v) === null) ? v : fallback
  return v.length <= MAX_FREE_STRING ? v : fallback
}

/** A body's params from untrusted data: declared keys only, each type-checked, ranged and validated. */
export function sanitizeParams(body: CameraBody, raw: unknown): Params {
  const src = isRecord(raw) ? raw : {}
  const out: Record<string, ParamValue> = {}
  for (const [key, fallback] of Object.entries(body.defaults)) out[key] = checkParam(body, key, src[key], fallback)
  for (const key of RUNTIME_KEYS) {
    const v = src[key]
    if (!(key in body.defaults) && typeof v === 'number' && Number.isFinite(v)) out[key] = Math.min(FREE_NUMBER_LIMIT, Math.max(-FREE_NUMBER_LIMIT, v))
  }
  return out
}

/** Only the params that differ from the body's defaults (compact storage and links). */
export function diffParams(body: CameraBody, params: Params): Record<string, ParamValue> {
  return Object.fromEntries(Object.entries(params).filter(([k, v]) => body.defaults[k] !== v))
}

export const hasBody = (id: unknown): id is string => typeof id === 'string' && CAMERA_BODIES.some((b) => b.id === id)

/** A full snapshot from untrusted data, or null when the body is unknown. */
export function sanitizeSnapshot(bodyId: unknown, params: unknown, rig: unknown): Snapshot | null {
  if (!hasBody(bodyId)) return null
  return { bodyId, params: sanitizeParams(bodyById(bodyId), params), rig: sanitizeRig(rig) }
}

/** The snapshot of the settings that made a shot. */
export function snapshotOf(shot: { body: CameraBody; params: Params; rig: Rig }): Snapshot {
  return { bodyId: shot.body.id, params: { ...shot.params }, rig: persistRig(shot.rig) }
}
