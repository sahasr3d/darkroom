import type { LookParams } from '../../engine/look'
import { camcorderStamp, drawDateOsd, drawDcrOsd, drawVhsOsd } from '../../engine/overlays/video'
import { jitter, knob, unit } from '../common'
import { ALL_ACCESSORIES, bool, num, str, type CameraBody, type Control, type ControlGroup, type Params, type ShutterSound } from '../types'

export const FPS_OPTIONS = [18, 24, 30] as const
export const fpsOf = (p: Params): number => ((FPS_OPTIONS as readonly number[]).includes(num(p, 'fps')) ? num(p, 'fps') : 24)

const FPS_CONTROL: Control = {
  kind: 'select',
  key: 'fps',
  label: 'Frame rate',
  options: [
    { value: '18', label: '18 fps home movie' },
    { value: '24', label: '24 fps cinema' },
    { value: '30', label: '30 fps video' },
  ],
}

const GATE_GROUP: ControlGroup = {
  title: 'Gate & frame rate',
  controls: [
    FPS_CONTROL,
    { kind: 'toggle', key: 'gateRounded', label: 'Rounded gate mask' },
    { kind: 'toggle', key: 'perfs', label: 'Side perforations' },
    { kind: 'toggle', key: 'scan', label: 'CRT / VHS scanlines' },
    { kind: 'toggle', key: 'jitter', label: 'Gate jitter' },
    { kind: 'toggle', key: 'border', label: 'Film border' },
  ],
}

const OSD_GROUP: ControlGroup = {
  title: 'On-screen display',
  controls: [
    { kind: 'text', key: 'osdDate', label: 'Date', maxLength: 16, placeholder: 'NOV.25 1996' },
    { kind: 'text', key: 'osdTime', label: 'Time', maxLength: 10, placeholder: '7:42 PM' },
    { kind: 'action', key: 'osdNow', label: "Use today's date and time" },
  ],
}

type OsdKind = 'vhs' | 'dcr' | 'date'

interface VideoSpec {
  id: string
  badge: string
  tagline: string
  format: string
  aspect: number | null
  fps: number
  gate: { rounded: boolean; perfs: boolean; scan: boolean; jitter: boolean; border: boolean }
  /** Scanline strength when the scanline toggle is on. */
  scanAmount: number
  /** Gate weave strength when the jitter toggle is on. */
  weave: number
  letterbox?: number
  wall?: string
  osd?: OsdKind
  emulsion: readonly Control[]
  defaults: Params
  look: (p: Params) => Partial<LookParams>
  ranges: readonly (readonly [string, number, number])[]
  sampleScene: CameraBody['sampleScene']
  shutter: ShutterSound
}

function videoBody(spec: VideoSpec): CameraBody {
  const stamp = camcorderStamp(new Date(1996, 10, 25, 19, 42))
  const osdDefaults: Params = spec.osd ? { osdDate: stamp.date, osdTime: stamp.time } : {}
  const groups: ControlGroup[] = [...(spec.emulsion.length ? [{ title: 'Look', controls: spec.emulsion }] : []), GATE_GROUP, ...(spec.osd ? [OSD_GROUP] : [])]
  return {
    id: spec.id,
    badge: spec.badge,
    tagline: spec.tagline,
    category: 'video',
    medium: 'video',
    format: spec.format,
    aspect: () => spec.aspect,
    frame: (p) => ({ kind: 'gate', rounded: bool(p, 'gateRounded'), perforations: bool(p, 'perfs'), border: bool(p, 'border'), letterbox: spec.letterbox ?? 0, wall: spec.wall }),
    dateStamp: false,
    accessories: ALL_ACCESSORIES,
    sampleScene: spec.sampleScene,
    shutter: spec.shutter,
    defaults: {
      intensity: 85,
      fps: String(spec.fps),
      gateRounded: spec.gate.rounded,
      perfs: spec.gate.perfs,
      scan: spec.gate.scan,
      jitter: spec.gate.jitter,
      border: spec.gate.border,
      ...osdDefaults,
      ...spec.defaults,
    },
    groups,
    look: (p) => {
      const base = spec.look(p)
      return {
        ...base,
        scanlines: bool(p, 'scan') ? Math.max(base.scanlines ?? 0, spec.scanAmount) : 0,
        gateWeave: bool(p, 'jitter') ? spec.weave : 0,
      }
    },
    overlay: spec.osd
      ? (ctx, p, info) => {
          const text = { date: str(p, 'osdDate'), time: str(p, 'osdTime') }
          if (spec.osd === 'vhs') drawVhsOsd(ctx, info, text)
          else if (spec.osd === 'dcr') drawDcrOsd(ctx, info, text, fpsOf(p))
          else drawDateOsd(ctx, info, text)
        }
      : undefined,
    animated: () => true,
    randomize: (p, rng) => jitter(p, rng, spec.ranges),
    onAction: (key, p) => {
      if (key !== 'osdNow') return p
      const now = camcorderStamp(new Date())
      return { ...p, osdDate: now.date, osdTime: now.time }
    },
  }
}

export const super8 = videoBody({
  id: 'v-8mm',
  badge: '8mm',
  tagline: 'Super 8 home movie: warm fade, heavy grain, projector flicker',
  format: 'Super 8 cartridge',
  aspect: 4 / 3,
  fps: 18,
  gate: { rounded: true, perfs: true, scan: false, jitter: true, border: false },
  scanAmount: 0.3,
  weave: 0.9,
  emulsion: [knob('fade', 'Fade'), knob('warmth', 'Warmth'), knob('grain', 'Grain'), knob('flicker', 'Projector flicker')],
  defaults: { fade: 45, warmth: 60, grain: 65, flicker: 55 },
  ranges: [ ['fade', 20, 75], ['warmth', 30, 85], ['grain', 40, 90], ['flicker', 25, 85] ],
  look: (p) => {
    const warm = unit(p, 'warmth')
    return {
      gain: [1 + warm * 0.09, 1 + warm * 0.01, 1 - warm * 0.15],
      saturation: 1.12,
      contrast: 1.1,
      lift: 0.02 + unit(p, 'fade') * 0.08,
      rolloff: 0.4,
      halation: 0.3,
      halColor: [1, 0.5, 0.2],
      grain: 0.4 + unit(p, 'grain') * 0.6,
      grainSize: 1.6,
      vignette: 0.55,
      flicker: unit(p, 'flicker') * 0.9,
    }
  },
  sampleScene: 'golden',
  shutter: 'leaf',
})

export const sixteen = videoBody({
  id: 'v-16mm',
  badge: '16mm',
  tagline: '16mm documentary film: fine grain, gentle weave, honest colour',
  format: '16mm reversal 24 fps',
  aspect: 1.37,
  fps: 24,
  gate: { rounded: true, perfs: false, scan: false, jitter: true, border: true },
  scanAmount: 0.3,
  weave: 0.45,
  emulsion: [knob('grain', 'Grain'), knob('warmth', 'Warmth'), knob('contrast', 'Contrast'), knob('flicker', 'Flicker')],
  defaults: { grain: 45, warmth: 40, contrast: 50, flicker: 25 },
  ranges: [ ['grain', 25, 70], ['warmth', 15, 70], ['contrast', 25, 75], ['flicker', 0, 50] ],
  look: (p) => {
    const warm = unit(p, 'warmth')
    return {
      gain: [1 + warm * 0.04, 1.0, 1 - warm * 0.05],
      contrast: 0.98 + unit(p, 'contrast') * 0.2,
      saturation: 0.98,
      lift: 0.03,
      rolloff: 0.4,
      grain: 0.2 + unit(p, 'grain') * 0.45,
      grainSize: 1.2,
      vignette: 0.3,
      flicker: unit(p, 'flicker') * 0.6,
    }
  },
  sampleScene: 'street',
  shutter: 'focal-plane',
})

export const vhs = videoBody({
  id: 'v-vhs',
  badge: 'VHS',
  tagline: 'VHS camcorder tape: chroma bleed, tracking noise, PLAY overlay',
  format: 'VHS-C SP',
  aspect: 4 / 3,
  fps: 30,
  gate: { rounded: false, perfs: false, scan: true, jitter: false, border: false },
  scanAmount: 0.5,
  weave: 0.3,
  osd: 'vhs',
  emulsion: [knob('tracking', 'Tracking noise'), knob('bleed', 'Chroma bleed'), knob('soft', 'Tape softness'), knob('saturation', 'Saturation')],
  defaults: { tracking: 40, bleed: 60, soft: 45, saturation: 55 },
  ranges: [ ['tracking', 10, 80], ['bleed', 30, 90], ['soft', 20, 75], ['saturation', 25, 80] ],
  look: (p) => ({
    staticNoise: unit(p, 'tracking') * 0.7,
    chromaBlur: 0.3 + unit(p, 'bleed') * 0.7,
    softEdge: unit(p, 'soft') * 0.5,
    ca: 0.5,
    saturation: 0.95 + unit(p, 'saturation') * 0.35,
    contrast: 0.95,
    lift: 0.04,
    gain: [1.0, 1.0, 1.03],
    isoNoise: 0.15,
    scanlines: 0.5,
  }),
  sampleScene: 'street',
  shutter: 'digital',
})

export const dcr = videoBody({
  id: 'v-dcr',
  badge: 'DCR',
  tagline: 'Early MiniDV camcorder: crisp digital edges, timecode OSD',
  format: 'MiniDV 480i',
  aspect: 16 / 9,
  fps: 30,
  gate: { rounded: false, perfs: false, scan: true, jitter: false, border: false },
  scanAmount: 0.2,
  weave: 0.2,
  osd: 'dcr',
  emulsion: [knob('sharp', 'Edge enhancement'), knob('noise', 'Sensor noise'), knob('cool', 'Cool cast'), knob('clip', 'Highlight clipping')],
  defaults: { sharp: 60, noise: 35, cool: 45, clip: 50 },
  ranges: [ ['sharp', 30, 90], ['noise', 10, 65], ['cool', 15, 75], ['clip', 20, 80] ],
  look: (p) => {
    const cool = unit(p, 'cool')
    return {
      sharpen: 0.2 + unit(p, 'sharp') * 0.7,
      isoNoise: unit(p, 'noise') * 0.45,
      gain: [1 - cool * 0.04, 1.0, 1 + cool * 0.06],
      clip: unit(p, 'clip') * 0.8,
      contrast: 1.05,
      saturation: 1.05,
      chromaBlur: 0.15,
    }
  },
  sampleScene: 'highway',
  shutter: 'digital',
})

export const kino = videoBody({
  id: 'v-kino',
  badge: 'Kino',
  tagline: 'Anamorphic cinema: 2.39 letterbox, teal-orange, streak flares',
  format: 'Anamorphic 2.39:1',
  aspect: 2.39,
  fps: 24,
  gate: { rounded: false, perfs: false, scan: false, jitter: false, border: false },
  scanAmount: 0.25,
  weave: 0.25,
  letterbox: 0.172,
  emulsion: [knob('teal', 'Teal-orange'), knob('flare', 'Anamorphic flare'), knob('grain', 'Grain'), knob('contrast', 'Contrast')],
  defaults: { teal: 60, flare: 55, grain: 30, contrast: 55 },
  ranges: [ ['teal', 30, 85], ['flare', 20, 85], ['grain', 10, 50], ['contrast', 30, 80] ],
  look: (p) => {
    const t = unit(p, 'teal')
    return {
      shadowTint: [-0.035 * t, 0.012 * t, 0.045 * t],
      highTint: [0.05 * t, 0.022 * t, -0.03 * t],
      contrast: 1.04 + unit(p, 'contrast') * 0.18,
      saturation: 1.04,
      rolloff: 0.45,
      star: unit(p, 'flare') * 0.9,
      starPoints: 2,
      starAngle: 0,
      starLength: 0.32,
      starThreshold: 0.72,
      halation: 0.15,
      halColor: [0.55, 0.7, 1],
      grain: unit(p, 'grain') * 0.4,
      vignette: 0.3,
    }
  },
  sampleScene: 'highway',
  shutter: 'focal-plane',
})

export const vClassic = videoBody({
  id: 'v-classic',
  badge: 'V Classic',
  tagline: '90s family camcorder: warm, soft, date burned in',
  format: 'Hi8 camcorder',
  aspect: 4 / 3,
  fps: 30,
  gate: { rounded: false, perfs: false, scan: true, jitter: false, border: false },
  scanAmount: 0.22,
  weave: 0.2,
  osd: 'date',
  emulsion: [knob('warmth', 'Warmth'), knob('soft', 'Softness'), knob('bleed', 'Chroma bleed'), knob('grain', 'Noise')],
  defaults: { warmth: 55, soft: 40, bleed: 40, grain: 30 },
  ranges: [ ['warmth', 25, 85], ['soft', 15, 70], ['bleed', 15, 70], ['grain', 10, 55] ],
  look: (p) => {
    const warm = unit(p, 'warmth')
    return {
      gain: [1 + warm * 0.07, 1 + warm * 0.02, 1 - warm * 0.08],
      softEdge: unit(p, 'soft') * 0.45,
      chromaBlur: unit(p, 'bleed') * 0.6,
      saturation: 1.06,
      lift: 0.03,
      isoNoise: unit(p, 'grain') * 0.35,
      vignette: 0.2,
    }
  },
  sampleScene: 'golden',
  shutter: 'digital',
})

export const vFunS = videoBody({
  id: 'v-funs',
  badge: 'V FunS',
  tagline: 'Toy video camera: plastic fisheye, loud colour, green shadows',
  format: 'Toy CMOS 240p',
  aspect: 4 / 3,
  fps: 18,
  gate: { rounded: true, perfs: false, scan: false, jitter: true, border: false },
  scanAmount: 0.3,
  weave: 0.35,
  emulsion: [knob('plastic', 'Plastic lens'), knob('saturation', 'Colour'), knob('green', 'Green shadows'), knob('grain', 'Noise')],
  defaults: { plastic: 60, saturation: 65, green: 50, grain: 50 },
  ranges: [ ['plastic', 30, 90], ['saturation', 35, 90], ['green', 20, 80], ['grain', 25, 75] ],
  look: (p) => {
    const g = unit(p, 'green')
    return {
      fisheye: 0.3 + unit(p, 'plastic') * 0.3,
      softEdge: unit(p, 'plastic') * 0.7,
      ca: 0.7,
      vignette: 0.6,
      saturation: 1.05 + unit(p, 'saturation') * 0.35,
      contrast: 1.1,
      shadowTint: [-g * 0.03, g * 0.05, g * 0.01],
      isoNoise: unit(p, 'grain') * 0.5,
    }
  },
  sampleScene: 'street',
  shutter: 'digital',
})

export const glow = videoBody({
  id: 'v-glow',
  badge: 'Glow',
  tagline: 'Dream filter: heavy halation, milky highlights, soft focus',
  format: 'Diffusion filter 24 fps',
  aspect: 16 / 9,
  fps: 24,
  gate: { rounded: false, perfs: false, scan: false, jitter: false, border: false },
  scanAmount: 0.25,
  weave: 0.25,
  emulsion: [knob('glow', 'Glow'), knob('haze', 'Haze'), knob('soft', 'Soft focus'), knob('warmth', 'Warmth')],
  defaults: { glow: 75, haze: 45, soft: 40, warmth: 50 },
  ranges: [ ['glow', 45, 95], ['haze', 20, 75], ['soft', 15, 70], ['warmth', 20, 80] ],
  look: (p) => {
    const warm = unit(p, 'warmth')
    return {
      halation: 0.25 + unit(p, 'glow') * 0.55,
      halColor: [1, 0.78, 0.7],
      halRadius: 0.05,
      halThreshold: 0.62,
      rolloff: 0.7,
      lift: 0.02 + unit(p, 'haze') * 0.09,
      contrast: 0.9,
      saturation: 0.95,
      softEdge: unit(p, 'soft') * 0.5,
      gain: [1 + warm * 0.05, 1 + warm * 0.01, 1 - warm * 0.04],
      grain: 0.15,
    }
  },
  sampleScene: 'golden',
  shutter: 'focal-plane',
})

export const slideP = videoBody({
  id: 'v-slide-p',
  badge: 'Slide P',
  tagline: 'Carousel slide projector: hot lamp, rounded gate, flicker on the wall',
  format: 'Projected 35mm slides',
  aspect: 3 / 2,
  fps: 18,
  gate: { rounded: true, perfs: false, scan: false, jitter: true, border: true },
  scanAmount: 0.25,
  weave: 0.4,
  wall: '#17130F',
  emulsion: [knob('lamp', 'Lamp hot-spot'), knob('saturation', 'Slide colour'), knob('flicker', 'Lamp flicker'), knob('dust', 'Dust and grain')],
  defaults: { lamp: 60, saturation: 60, flicker: 45, dust: 40 },
  ranges: [ ['lamp', 30, 85], ['saturation', 30, 85], ['flicker', 15, 75], ['dust', 15, 70] ],
  look: (p) => ({
    flash: unit(p, 'lamp') * 0.75,
    flashGel: [1.08, 1.0, 0.85],
    vignette: 0.7,
    saturation: 1.1 + unit(p, 'saturation') * 0.3,
    contrast: 1.15,
    gain: [1.06, 1.0, 0.9],
    flicker: unit(p, 'flicker') * 0.9,
    grain: 0.1 + unit(p, 'dust') * 0.45,
    grainSize: 1.3,
  }),
  sampleScene: 'golden',
  shutter: 'leaf',
})

export const originalV = videoBody({
  id: 'v-original',
  badge: 'Original V',
  tagline: 'Straight video: no colour science, just the gate and frame rate',
  format: 'Source colour',
  aspect: null,
  fps: 30,
  gate: { rounded: false, perfs: false, scan: false, jitter: false, border: false },
  scanAmount: 0.3,
  weave: 0.3,
  emulsion: [],
  defaults: {},
  ranges: [],
  look: () => ({}),
  sampleScene: 'street',
  shutter: 'digital',
})

export const VIDEO_BODIES: readonly CameraBody[] = [super8, sixteen, vhs, dcr, kino, vClassic, vFunS, glow, slideP, originalV]
