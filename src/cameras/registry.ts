import { dashCam } from './bodies/dashCam'
import { classicU, cpm35, dClassic, dFunS, nt16, sClassic } from './bodies/film35'
import { fxnR } from './bodies/fxnR'
import { dHalf, sr135 } from './bodies/halfPano'
import { instaC, instSqc, instSs, polaroidSx70 } from './bodies/instant'
import { d3d, golf } from './bodies/motion'
import { reverseCam } from './bodies/reverseCam'
import { ccd, dExp, dSlide, hoga, ne135 } from './bodies/toy'
import { VIDEO_BODIES } from './bodies/video'
import type { CameraBody, CameraCategory, Params } from './types'

/** Shelf order. Every entry is a complete body: look, frame, controls, sample scene. */
export const CAMERA_BODIES: readonly CameraBody[] = [
  fxnR,
  cpm35,
  dClassic,
  dFunS,
  nt16,
  classicU,
  sClassic,
  dHalf,
  sr135,
  polaroidSx70,
  instaC,
  instSqc,
  instSs,
  hoga,
  dExp,
  ne135,
  dSlide,
  ccd,
  d3d,
  golf,
  dashCam,
  reverseCam,
  ...VIDEO_BODIES,
]

export const CATEGORY_LABELS: Record<CameraCategory, string> = {
  film35: '35mm film',
  halfPano: 'Half-frame & panoramic',
  instant: 'Instant',
  toy: 'Toy, slide & early digital',
  motion: '3D & motion',
  auto: 'Automotive',
  video: 'Retro video',
}

const BY_ID = new Map(CAMERA_BODIES.map((b) => [b.id, b]))

export function bodyById(id: string): CameraBody {
  const body = BY_ID.get(id)
  if (!body) throw new Error(`Unknown camera body: ${id}`)
  return body
}

export function initialParams(): Record<string, Params> {
  return Object.fromEntries(CAMERA_BODIES.map((b) => [b.id, b.defaults]))
}

/** Bodies grouped by shelf category, preserving registry order. */
export function shelfGroups(): { category: CameraCategory; label: string; bodies: CameraBody[] }[] {
  const groups = new Map<CameraCategory, CameraBody[]>()
  for (const b of CAMERA_BODIES) groups.set(b.category, [...(groups.get(b.category) ?? []), b])
  return [...groups.entries()].map(([category, bodies]) => ({ category, label: CATEGORY_LABELS[category], bodies }))
}
