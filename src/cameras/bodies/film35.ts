import type { LookParams, Mat3 } from '../../engine/look'
import { DATE_BACK_GROUP, dateBackAction, dateBackDefaults, jitter, knob, PRINT_BORDER_TOGGLE, printFrame, scaleMatrix, unit } from '../common'
import { ALL_ACCESSORIES, type CameraBody, type Control, type Params, type ShutterSound } from '../types'

interface Film35Spec {
  id: string
  badge: string
  tagline: string
  format: string
  sampleScene: CameraBody['sampleScene']
  shutter: ShutterSound
  emulsion: readonly Control[]
  defaults: Params
  look: (p: Params) => Partial<LookParams>
  ranges: readonly (readonly [string, number, number])[]
  dateOn?: boolean
}

/** Shared chassis for 35mm compacts: 3:2 frame, optional print border, quartz date back. */
export function film35Body(spec: Film35Spec): CameraBody {
  return {
    id: spec.id,
    badge: spec.badge,
    tagline: spec.tagline,
    category: 'film35',
    format: spec.format,
    aspect: () => 3 / 2,
    frame: printFrame,
    dateStamp: true,
    accessories: ALL_ACCESSORIES,
    sampleScene: spec.sampleScene,
    shutter: spec.shutter,
    defaults: { intensity: 85, border: false, ...spec.defaults, ...dateBackDefaults(spec.dateOn ?? false) },
    groups: [{ title: 'Emulsion', controls: [...spec.emulsion, PRINT_BORDER_TOGGLE] }, DATE_BACK_GROUP],
    look: spec.look,
    animated: () => false,
    randomize: (p, rng) => jitter(p, rng, spec.ranges),
    onAction: (key, p) => dateBackAction(key, p) ?? p,
  }
}

/** CPM35 — soft pastel point-and-shoot: gentle contrast, peach highlights, dreamy skin glow. */
export const cpm35 = film35Body({
  id: 'cpm-35',
  badge: 'CPM35',
  tagline: 'Soft pastel point-and-shoot with dreamy skin glow',
  format: '35mm ISO 400',
  sampleScene: 'golden',
  shutter: 'leaf',
  emulsion: [knob('pastel', 'Pastel wash'), knob('glow', 'Skin glow'), knob('softness', 'Lens softness'), knob('grain', 'Grain')],
  defaults: { pastel: 55, glow: 50, softness: 30, grain: 30 },
  ranges: [ ['pastel', 30, 85], ['glow', 25, 80], ['softness', 10, 60], ['grain', 15, 50] ],
  look: (p) => {
    const pastel = unit(p, 'pastel')
    return {
      exposure: 0.15,
      contrast: 0.95 - pastel * 0.1,
      saturation: 0.98 - pastel * 0.22,
      lift: 0.03 + pastel * 0.07,
      rolloff: 0.5,
      gain: [1.03, 1.0, 0.99],
      highTint: [pastel * 0.045, pastel * 0.02, pastel * 0.03],
      shadowTint: [0.012, 0.0, 0.022],
      halation: unit(p, 'glow') * 0.6,
      halColor: [1, 0.72, 0.62],
      halRadius: 0.03,
      halThreshold: 0.6,
      softEdge: unit(p, 'softness') * 0.35,
      grain: unit(p, 'grain') * 0.5,
      vignette: 0.2,
    }
  },
})

/** D Classic — 80s/90s compact with direct flash: punchy, deep crisp shadows. */
export const dClassic = film35Body({
  id: 'd-classic',
  badge: 'D Classic',
  tagline: '80s/90s compact: punchy flash falloff, crisp shadows',
  format: '35mm ISO 200',
  sampleScene: 'street',
  shutter: 'leaf',
  dateOn: true,
  emulsion: [knob('flashFall', 'Flash falloff'), knob('punch', 'Punch'), knob('warmth', 'Warmth'), knob('grain', 'Grain')],
  defaults: { flashFall: 55, punch: 55, warmth: 40, grain: 35 },
  ranges: [ ['flashFall', 25, 85], ['punch', 30, 85], ['warmth', 15, 70], ['grain', 20, 55] ],
  look: (p) => {
    const punch = unit(p, 'punch')
    const warm = unit(p, 'warmth')
    return {
      flash: unit(p, 'flashFall') * 0.9,
      contrast: 1.05 + punch * 0.25,
      saturation: 1.04 + punch * 0.16,
      lift: 0,
      gain: [1 + warm * 0.06, 1 + warm * 0.015, 1 - warm * 0.08],
      shadowTint: [-0.01, -0.005, 0.0],
      sharpen: 0.15,
      vignette: 0.45,
      grain: unit(p, 'grain') * 0.6,
    }
  },
})

/** D Fun S — single-use disposable: green shadows, heavy grain, plastic-lens softness. */
export const dFunS = film35Body({
  id: 'd-fun-s',
  badge: 'D Fun S',
  tagline: 'Disposable: green shadows, heavy grain, plastic lens',
  format: '35mm ISO 800 single-use',
  sampleScene: 'highway',
  shutter: 'leaf',
  dateOn: true,
  emulsion: [knob('grain', 'Grain'), knob('plastic', 'Plastic softness'), knob('green', 'Green shadows'), knob('flashFall', 'Flash')],
  defaults: { grain: 65, plastic: 55, green: 55, flashFall: 40 },
  ranges: [ ['grain', 45, 90], ['plastic', 30, 85], ['green', 30, 80], ['flashFall', 0, 75] ],
  look: (p) => {
    const plastic = unit(p, 'plastic')
    const g = unit(p, 'green')
    return {
      exposure: 0.08,
      contrast: 1.08,
      saturation: 1.05,
      lift: 0.02,
      gain: [1.03, 1.0, 0.94],
      shadowTint: [-g * 0.03, g * 0.05, g * 0.012],
      highTint: [0.02, 0.015, -0.01],
      softEdge: plastic * 0.8,
      ca: plastic * 0.8,
      flash: unit(p, 'flashFall') * 0.7,
      halation: 0.2,
      grain: 0.5 + unit(p, 'grain') * 0.6,
      grainSize: 1.6,
      vignette: 0.55,
    }
  },
})

/** NT16 — natural-light ISO 1600: honest colour that stays clean in low light. */
export const nt16 = film35Body({
  id: 'nt-16',
  badge: 'NT16',
  tagline: 'Natural low-light 1600: honest colour, fine grain',
  format: '35mm ISO 1600',
  sampleScene: 'highway',
  shutter: 'leaf',
  emulsion: [knob('lowLight', 'Low-light lift'), knob('warmth', 'Warmth'), knob('bloom', 'Lamp bloom'), knob('grain', 'Grain')],
  defaults: { lowLight: 55, warmth: 40, bloom: 35, grain: 35 },
  ranges: [ ['lowLight', 25, 85], ['warmth', 15, 70], ['bloom', 10, 65], ['grain', 20, 55] ],
  look: (p) => {
    const boost = unit(p, 'lowLight')
    const warm = unit(p, 'warmth')
    return {
      exposure: boost * 0.6,
      contrast: 0.97,
      saturation: 0.96,
      lift: 0.025,
      rolloff: 0.45 + boost * 0.15,
      gain: [1 + warm * 0.03, 1.0, 1 - warm * 0.04],
      shadowTint: [0.0, 0.01, 0.005],
      halation: unit(p, 'bloom') * 0.4,
      halColor: [1, 0.7, 0.4],
      isoNoise: boost * 0.1,
      grain: 0.2 + unit(p, 'grain') * 0.35,
      grainSize: 0.9,
      vignette: 0.2,
    }
  },
})

/** Warm, faded editorial matrix: amber mids, slightly muted blues. */
const WARM_EDITORIAL: Mat3 = [1.05, 0.02, -0.07, 0.0, 1.02, -0.02, -0.04, 0.02, 0.92]

/** Classic U — clean editorial 35mm, warm vintage. */
export const classicU = film35Body({
  id: 'classic-u',
  badge: 'Classic U',
  tagline: 'Clean editorial 35mm, warm vintage',
  format: '35mm ISO 100',
  sampleScene: 'golden',
  shutter: 'focal-plane',
  emulsion: [knob('warmth', 'Vintage warmth'), knob('fade', 'Fade'), knob('contrast', 'Contrast'), knob('grain', 'Grain')],
  defaults: { warmth: 55, fade: 35, contrast: 45, grain: 25 },
  ranges: [ ['warmth', 25, 85], ['fade', 10, 65], ['contrast', 20, 75], ['grain', 10, 45] ],
  look: (p) => {
    const warm = unit(p, 'warmth')
    return {
      colorMatrix: scaleMatrix(WARM_EDITORIAL, 0.4 + warm * 0.8),
      gain: [1 + warm * 0.06, 1 + warm * 0.02, 1 - warm * 0.08],
      contrast: 0.95 + unit(p, 'contrast') * 0.2,
      saturation: 0.92,
      lift: unit(p, 'fade') * 0.08,
      rolloff: 0.4,
      highTint: [warm * 0.035, warm * 0.02, -warm * 0.015],
      grain: unit(p, 'grain') * 0.45,
      vignette: 0.22,
    }
  },
})

/** S Classic — clean editorial 35mm, cool and high-contrast. */
export const sClassic = film35Body({
  id: 's-classic',
  badge: 'S Classic',
  tagline: 'Clean editorial 35mm, cool and high-contrast',
  format: '35mm ISO 100',
  sampleScene: 'street',
  shutter: 'focal-plane',
  emulsion: [knob('cool', 'Coolness'), knob('contrast', 'Contrast'), knob('sharp', 'Acutance'), knob('grain', 'Grain')],
  defaults: { cool: 55, contrast: 55, sharp: 40, grain: 20 },
  ranges: [ ['cool', 25, 85], ['contrast', 30, 85], ['sharp', 15, 70], ['grain', 10, 40] ],
  look: (p) => {
    const cool = unit(p, 'cool')
    return {
      gain: [1 - cool * 0.05, 1.0, 1 + cool * 0.07],
      contrast: 1.1 + unit(p, 'contrast') * 0.25,
      saturation: 0.9,
      shadowTint: [-0.01, 0.0, 0.025 * cool],
      highTint: [0, 0.005, 0.015 * cool],
      clip: 0.2,
      sharpen: unit(p, 'sharp') * 0.5,
      grain: unit(p, 'grain') * 0.4,
      vignette: 0.25,
    }
  },
})
