import { isoNoiseFor, manualExposureEv, motionBlurFor } from './exposure'
import { clamp, lerp } from './rng'

export type Vec2 = readonly [number, number]
export type Vec3 = readonly [number, number, number]
/** Row-major 3×3 colour matrix. */
export type Mat3 = readonly [number, number, number, number, number, number, number, number, number]

export const IDENTITY3: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1]

/**
 * Every knob the three GPU passes understand. A camera body's colour science is a partial
 * LookParams; the rig (lens, filters, manual exposure) is layered on top of it.
 */
export interface LookParams {
  // Pass 1 — optics
  zoom: number
  barrel: number
  fisheye: number
  ca: number
  softEdge: number
  prism: number
  prismMode: number
  prismSegments: number
  star: number
  starPoints: number
  starThreshold: number
  starLength: number
  /** Rotation of the star spokes in radians (0 = flat anamorphic streak with 2 points). */
  starAngle: number
  /** Hand-shake blur length (fraction of frame) and its direction in radians. */
  motionBlur: number
  motionAngle: number
  /** Tap-to-focus: point in image uv and how quickly the rest falls out of focus. */
  focusPoint: Vec2
  dof: number
  /** Double exposure: 0/1, blend mode (0 screen, 1 lighten, 2 overlay), balance 0 = A … 1 = B. */
  double: number
  blendMode: number
  blendBalance: number
  /** Depth-parallax view shift (D3D wiggle views); near things move against far ones. */
  parallax: number
  // Pass 2 — film & sensor
  colorMatrix: Mat3
  colorOffset: Vec3
  exposure: number
  nd: number
  wbGain: Vec3
  gain: Vec3
  contrast: number
  saturation: number
  lift: number
  rolloff: number
  clip: number
  shadowTint: Vec3
  highTint: Vec3
  halation: number
  halColor: Vec3
  halRadius: number
  halThreshold: number
  sharpen: number
  grain: number
  grainSize: number
  isoNoise: number
  flash: number
  flashGel: Vec3
  leak: number
  leakPos: Vec2
  leakColor: Vec3
  leakSpread: number
  vignette: number
  night: number
  /** Per-frame exposure flicker of a cine projector or cheap shutter. */
  flicker: number
  // Pass 3 — video & analog
  chromaBlur: number
  scanlines: number
  scanCount: number
  staticNoise: number
  gateWeave: number
}

export const NEUTRAL_LOOK: LookParams = {
  zoom: 1,
  barrel: 0,
  fisheye: 0,
  ca: 0,
  softEdge: 0,
  prism: 0,
  prismMode: 0,
  prismSegments: 3,
  star: 0,
  starPoints: 4,
  starThreshold: 0.82,
  starLength: 0.13,
  starAngle: 0.3,
  motionBlur: 0,
  motionAngle: 0,
  focusPoint: [0.5, 0.5],
  dof: 0,
  double: 0,
  blendMode: 0,
  blendBalance: 0.5,
  parallax: 0,
  colorMatrix: IDENTITY3,
  colorOffset: [0, 0, 0],
  exposure: 0,
  nd: 0,
  wbGain: [1, 1, 1],
  gain: [1, 1, 1],
  contrast: 1,
  saturation: 1,
  lift: 0,
  rolloff: 0,
  clip: 0,
  shadowTint: [0, 0, 0],
  highTint: [0, 0, 0],
  halation: 0,
  halColor: [1, 0.35, 0.12],
  halRadius: 0.02,
  halThreshold: 0.75,
  sharpen: 0,
  grain: 0,
  grainSize: 1,
  isoNoise: 0,
  flash: 0,
  flashGel: [1, 1, 1],
  leak: 0,
  leakPos: [1.1, 0.3],
  leakColor: [1, 0.45, 0.15],
  leakSpread: 0.4,
  vignette: 0,
  night: 0,
  flicker: 0,
  chromaBlur: 0,
  scanlines: 0,
  scanCount: 480,
  staticNoise: 0,
  gateWeave: 0,
}

/** Fields that say where/what an effect is rather than how strong — never scaled by intensity. */
const VERBATIM: ReadonlySet<keyof LookParams> = new Set<keyof LookParams>([
  'halColor',
  'halRadius',
  'halThreshold',
  'grainSize',
  'scanCount',
  'leakPos',
  'leakColor',
  'leakSpread',
  'prismMode',
  'prismSegments',
  'starPoints',
  'starThreshold',
  'starLength',
  'flashGel',
  'motionAngle',
  'focusPoint',
  'blendMode',
  'blendBalance',
  'parallax',
  'starAngle',
])

const lerpArr = (a: readonly number[], b: readonly number[], t: number): number[] => a.map((v, i) => lerp(v, b[i], t))

/** Blend from an untouched photo toward a body's look; `t` is the master intensity 0..1. */
export function mixLook(target: Partial<LookParams>, t: number): LookParams {
  const full: LookParams = { ...NEUTRAL_LOOK, ...target }
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(full) as (keyof LookParams)[]) {
    const n = NEUTRAL_LOOK[key]
    const v = full[key]
    if (VERBATIM.has(key)) out[key] = v
    else if (Array.isArray(v)) out[key] = lerpArr(n as readonly number[], v as readonly number[], t)
    else out[key] = lerp(n as number, v as number, t)
  }
  return out as unknown as LookParams
}

/**
 * Approximate white-balance gains for a scene lit at `kelvin`, normalised so 5500K is neutral.
 * (Tanner Helland's blackbody fit, inverted: a warm light needs a cool correction.)
 */
export function kelvinToGain(kelvin: number, tint = 0): Vec3 {
  const rgb = (k: number): [number, number, number] => {
    const t = clamp(k, 1000, 40000) / 100
    const r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592)
    const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * Math.pow(t - 60, -0.0755148492)
    const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307
    return [clamp(r, 1, 255), clamp(g, 1, 255), clamp(b, 1, 255)]
  }
  const ref = rgb(5500)
  const src = rgb(kelvin)
  const gain = [ref[0] / src[0], ref[1] / src[1], ref[2] / src[2]]
  const norm = (gain[0] + gain[1] + gain[2]) / 3
  const tintG = 1 - clamp(tint, -1, 1) * 0.12
  return [gain[0] / norm, (gain[1] / norm) * tintG, gain[2] / norm]
}

// ---------------------------------------------------------------------------
// Rig: lens, accessories and manual exposure that sit on top of any body.

export type LensId = 'none' | 'fisheye' | 'prism' | 'starburst'
export type GelId = 'clear' | 'red' | 'blue' | 'yellow' | 'green' | 'magenta'

export const FOCAL_PRESETS = [13, 24, 35, 50, 120] as const
export const BASE_FOCAL = 24

export const GELS: Record<GelId, Vec3> = {
  clear: [1, 1, 1],
  red: [1.25, 0.55, 0.5],
  blue: [0.55, 0.75, 1.3],
  yellow: [1.2, 1.1, 0.45],
  green: [0.6, 1.2, 0.6],
  magenta: [1.2, 0.55, 1.15],
}

export type BlendMode = 'screen' | 'lighten' | 'overlay'
export const BLEND_MODES: readonly BlendMode[] = ['screen', 'lighten', 'overlay']

export interface Rig {
  focal: number
  lens: LensId
  starPoints: 4 | 6
  prismMode: 'split' | 'kaleido'
  nd: number
  flash: boolean
  gel: GelId
  leak: boolean
  /** Exposure compensation in stops (always available). */
  ev: number
  kelvin: number
  tint: number
  /** Manual exposure: ISO and shutter override the body's auto exposure. */
  manual: boolean
  iso: number
  shutter: number
  stabilize: boolean
  /** True when the camera hardware already applied ISO/shutter, so the shader must not. */
  hwExposure: boolean
  /** Tap-to-focus point in image uv, or null for everything sharp. */
  focus: readonly [number, number] | null
  double: boolean
  blend: BlendMode
  /** 0..100: how much of the second exposure shows. */
  balance: number
}

export const DEFAULT_RIG: Rig = {
  focal: BASE_FOCAL,
  lens: 'none',
  starPoints: 4,
  prismMode: 'split',
  nd: 0,
  flash: false,
  gel: 'clear',
  leak: false,
  ev: 0,
  kelvin: 5500,
  tint: 0,
  manual: false,
  iso: 200,
  shutter: 1 / 125,
  stabilize: true,
  hwExposure: false,
  focus: null,
  double: false,
  blend: 'screen',
  balance: 50,
}

/** Accessory capabilities a body exposes (mirrors AccessoryId in cameras/types). */
export type RigCapability = 'focal' | 'fisheye' | 'prism' | 'starburst' | 'nd' | 'flash' | 'leak' | 'manual'

/** Drop rig settings the current body cannot use (e.g. a zoom on a fixed-lens instant camera). */
export function gateRig(rig: Rig, caps: readonly RigCapability[], multiFrame: boolean): Rig {
  const has = (c: RigCapability) => caps.includes(c)
  const lensOk = rig.lens === 'none' || has(rig.lens)
  return {
    ...rig,
    focal: has('focal') ? rig.focal : BASE_FOCAL,
    lens: lensOk ? rig.lens : 'none',
    nd: has('nd') ? rig.nd : 0,
    flash: has('flash') && rig.flash,
    leak: has('leak') && rig.leak,
    manual: has('manual') && rig.manual,
    kelvin: has('manual') ? rig.kelvin : 5500,
    tint: has('manual') ? rig.tint : 0,
    double: rig.double && !multiFrame,
  }
}

/** Focal length → crop zoom (longer than 24mm) or extra barrel (wider than 24mm). */
export function focalToOptics(focal: number): { zoom: number; barrel: number } {
  const f = clamp(focal, 13, 120)
  if (f >= BASE_FOCAL) return { zoom: f / BASE_FOCAL, barrel: 0 }
  return { zoom: 1, barrel: ((BASE_FOCAL - f) / (BASE_FOCAL - 13)) * 0.55 }
}

export function applyRig(look: LookParams, rig: Rig, seed: number): LookParams {
  const optics = focalToOptics(rig.focal)
  const next: LookParams = {
    ...look,
    zoom: look.zoom * optics.zoom,
    barrel: look.barrel + optics.barrel,
    exposure: look.exposure + rig.ev,
    nd: look.nd + rig.nd,
    wbGain: kelvinToGain(rig.kelvin, rig.tint),
  }
  if (rig.manual && !rig.hwExposure) {
    Object.assign(next, {
      exposure: next.exposure + manualExposureEv(rig.iso, rig.shutter),
      isoNoise: look.isoNoise + isoNoiseFor(rig.iso),
      motionBlur: motionBlurFor(rig.shutter, rig.stabilize),
      motionAngle: ((seed % 360) * Math.PI) / 180,
    })
  }
  if (rig.focus) Object.assign(next, { focusPoint: rig.focus, dof: 0.6 })
  if (rig.double) Object.assign(next, { double: 1, blendMode: BLEND_MODES.indexOf(rig.blend), blendBalance: clamp(rig.balance / 100, 0, 1) })
  if (rig.lens === 'fisheye') Object.assign(next, { fisheye: Math.max(look.fisheye, 0.85), vignette: Math.max(look.vignette, 0.5) })
  if (rig.lens === 'prism') Object.assign(next, { prism: 1, prismMode: rig.prismMode === 'split' ? 1 : 2, prismSegments: rig.prismMode === 'split' ? 3 : 6 })
  if (rig.lens === 'starburst') Object.assign(next, { star: 1, starPoints: rig.starPoints })
  if (rig.flash) Object.assign(next, { flash: Math.max(look.flash, 0.8), flashGel: GELS[rig.gel] })
  if (rig.leak) {
    const a = ((seed % 997) / 997) * Math.PI * 2
    Object.assign(next, { leak: Math.max(look.leak, 0.75), leakPos: [0.5 + Math.cos(a) * 0.68, 0.5 + Math.sin(a) * 0.62] as Vec2 })
  }
  return next
}
