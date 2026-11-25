import type { LookParams, Mat3 } from '../../engine/look'
import { DATE_BACK_GROUP, dateBackAction, dateBackDefaults, jitter, knob, PRINT_BORDER_TOGGLE, printFrame, scaleMatrix, unit } from '../common'
import { ALL_ACCESSORIES, num, str, type CameraBody, type Control, type Params, type SlideMount } from '../types'

/** Leak enters from one edge; the angle (0..1) walks it round the frame. */
const leakAt = (angle: number): [number, number] => [0.5 + Math.cos(angle * Math.PI * 2) * 0.66, 0.5 + Math.sin(angle * Math.PI * 2) * 0.6]

/** Hoga — 120 plastic toy camera: square, heavy soft vignette, mushy edges, random leaks. */
export const hoga: CameraBody = {
  id: 'hoga',
  badge: 'Hoga',
  tagline: 'Plastic 120 toy camera: dark corners, mushy edges, leaks',
  category: 'toy',
  format: '120 medium format 6×6',
  aspect: () => 1,
  frame: (p) => ({ kind: 'negative', seed: num(p, 'edgeSeed') }),
  dateStamp: false,
  accessories: ['flash', 'leak', 'prism', 'starburst', 'nd', 'manual'],
  sampleScene: 'golden',
  shutter: 'leaf',
  defaults: { intensity: 90, vignette: 70, edgeBlur: 60, leak: 55, grain: 45, leakAngle: 0.08, edgeSeed: 4242 },
  groups: [
    {
      title: 'Plastic optics',
      controls: [knob('vignette', 'Vignette'), knob('edgeBlur', 'Edge blur'), knob('leak', 'Light leak'), knob('grain', 'Grain'), { kind: 'action', key: 'reroll', label: 'New leak and film edge' }],
    },
  ],
  look: (p) => ({
    vignette: 0.5 + unit(p, 'vignette') * 0.5,
    softEdge: unit(p, 'edgeBlur') * 1.2,
    ca: 0.6,
    barrel: 0.08,
    leak: unit(p, 'leak') * 0.9,
    leakPos: leakAt(num(p, 'leakAngle')),
    leakColor: [1, 0.38, 0.12],
    leakSpread: 0.45,
    contrast: 1.12,
    saturation: 1.08,
    lift: 0.015,
    gain: [1.03, 1.0, 0.96],
    grain: 0.2 + unit(p, 'grain') * 0.6,
    grainSize: 1.4,
  }),
  animated: () => false,
  randomize: (p, rng) => ({ ...jitter(p, rng, [ ['vignette', 40, 95], ['edgeBlur', 30, 90], ['leak', 20, 90], ['grain', 25, 70] ]), leakAngle: rng(), edgeSeed: Math.floor(rng() * 1e6) }),
  onAction: (key, p, rng) => (key === 'reroll' ? { ...p, leakAngle: rng(), edgeSeed: Math.floor(rng() * 1e6) } : p),
}

/** Cross-processing (E-6 in C-41): cyan-yellow split, crushed saturated shadows. */
const CROSS: Mat3 = [1.12, 0.06, -0.18, -0.06, 1.12, -0.06, 0.06, -0.12, 0.88]

/** D Exp — cross-processed film. */
export const dExp: CameraBody = {
  id: 'd-exp',
  badge: 'D Exp',
  tagline: 'Cross-processed: cyan-yellow highlights, saturated shadows',
  category: 'toy',
  format: 'E-6 slide in C-41',
  aspect: () => 3 / 2,
  frame: printFrame,
  dateStamp: true,
  accessories: ALL_ACCESSORIES,
  sampleScene: 'street',
  shutter: 'leaf',
  defaults: { intensity: 85, shift: 60, contrast: 55, saturation: 60, grain: 35, border: false, ...dateBackDefaults(false) },
  groups: [
    { title: 'Cross process', controls: [knob('shift', 'Cross shift'), knob('contrast', 'Contrast'), knob('saturation', 'Saturation'), knob('grain', 'Grain'), PRINT_BORDER_TOGGLE] },
    DATE_BACK_GROUP,
  ],
  look: (p) => {
    const s = unit(p, 'shift')
    return {
      colorMatrix: scaleMatrix(CROSS, 0.3 + s * 0.9),
      colorOffset: [-0.02 * s, 0.0, 0.06 * s],
      highTint: [0.06 * s, 0.06 * s, -0.08 * s],
      shadowTint: [-0.03 * s, 0.01 * s, 0.05 * s],
      contrast: 1.15 + unit(p, 'contrast') * 0.25,
      saturation: 1.2 + unit(p, 'saturation') * 0.3,
      grain: unit(p, 'grain') * 0.5,
      vignette: 0.3,
    }
  },
  animated: () => false,
  randomize: (p, rng) => jitter(p, rng, [ ['shift', 35, 90], ['contrast', 30, 85], ['saturation', 30, 85], ['grain', 15, 55] ]),
  onAction: (key, p) => dateBackAction(key, p) ?? p,
}

const MOUNT_CONTROL: Control = {
  kind: 'select',
  key: 'mount',
  label: 'Slide mount',
  options: [
    { value: 'card', label: 'Cardboard' },
    { value: 'plastic', label: 'Plastic' },
  ],
}

function slideBody(spec: { id: string; badge: string; tagline: string; format: string; mount: SlideMount; label: string; look: (p: Params) => Partial<LookParams>; defaults: Params }): CameraBody {
  return {
    id: spec.id,
    badge: spec.badge,
    tagline: spec.tagline,
    category: 'toy',
    format: spec.format,
    aspect: () => 3 / 2,
    frame: (p) => ({ kind: 'slide', mount: str(p, 'mount') === 'plastic' ? 'plastic' : 'card', label: str(p, 'label') }),
    dateStamp: false,
    accessories: ALL_ACCESSORIES,
    sampleScene: 'golden',
    shutter: 'focal-plane',
    defaults: { intensity: 85, mount: spec.mount, label: spec.label, saturation: 60, contrast: 55, grain: 15, ...spec.defaults },
    groups: [
      { title: 'Transparency', controls: [knob('saturation', 'Saturation'), knob('contrast', 'Contrast'), knob('grain', 'Grain')] },
      { title: 'Mount', controls: [MOUNT_CONTROL, { kind: 'text', key: 'label', label: 'Mount label', maxLength: 24, placeholder: 'Roll 4 / 12' }] },
    ],
    look: spec.look,
    animated: () => false,
    randomize: (p, rng) => jitter(p, rng, [ ['saturation', 35, 90], ['contrast', 30, 85], ['grain', 5, 35] ]),
  }
}

/** 135 NE — cool, clean E-6 slide film in a plastic mount. */
export const ne135 = slideBody({
  id: '135-ne',
  badge: '135 NE',
  tagline: 'Cool, clean slide film in a plastic mount',
  format: '35mm E-6 ISO 100',
  mount: 'plastic',
  label: 'NE 100  12',
  defaults: {},
  look: (p) => ({
    saturation: 1.15 + unit(p, 'saturation') * 0.3,
    contrast: 1.1 + unit(p, 'contrast') * 0.2,
    gain: [0.97, 1.0, 1.05],
    shadowTint: [-0.01, 0.0, 0.02],
    highTint: [0.0, 0.01, 0.015],
    exposure: -0.05,
    grain: unit(p, 'grain') * 0.3,
    grainSize: 0.8,
    vignette: 0.25,
  }),
})

/** Vivid landscape slide: greens and reds pushed hard. */
const VIVID: Mat3 = [1.12, -0.06, -0.06, -0.06, 1.14, -0.08, -0.04, -0.06, 1.1]

/** D Slide — vivid, warm landscape slide film in a card mount. */
export const dSlide = slideBody({
  id: 'd-slide',
  badge: 'D Slide',
  tagline: 'Vivid warm landscape slide in a card mount',
  format: '35mm E-6 ISO 50',
  mount: 'card',
  label: 'Summer roll 07',
  defaults: { saturation: 70, contrast: 60 },
  look: (p) => ({
    colorMatrix: scaleMatrix(VIVID, 0.5 + unit(p, 'saturation') * 0.6),
    saturation: 1.2 + unit(p, 'saturation') * 0.3,
    contrast: 1.12 + unit(p, 'contrast') * 0.22,
    gain: [1.04, 1.01, 0.95],
    exposure: -0.08,
    grain: unit(p, 'grain') * 0.25,
    grainSize: 0.75,
    vignette: 0.28,
  }),
})

/** CCD — early-2000s digicam: cool-magenta flash cast, crunchy edges, clipped highlights. */
export const ccd: CameraBody = {
  id: 'ccd',
  badge: 'CCD',
  tagline: 'Early digicam: magenta flash, crisp edges, clipped whites',
  category: 'toy',
  format: '3.2MP CCD 1/2.7in',
  aspect: () => 4 / 3,
  frame: () => ({ kind: 'none' }),
  dateStamp: true,
  accessories: ALL_ACCESSORIES,
  sampleScene: 'street',
  shutter: 'digital',
  defaults: { intensity: 85, flashCast: 50, crisp: 55, clipping: 60, noise: 35, ...dateBackDefaults(true, "'03 06 14") },
  groups: [
    { title: 'Sensor', controls: [knob('flashCast', 'Flash cast'), knob('crisp', 'Edge crispness'), knob('clipping', 'Highlight clipping'), knob('noise', 'Sensor noise')] },
    DATE_BACK_GROUP,
  ],
  look: (p) => ({
    flash: unit(p, 'flashCast') * 0.8,
    flashGel: [1.02, 0.9, 1.12],
    sharpen: 0.35 + unit(p, 'crisp') * 0.6,
    clip: unit(p, 'clipping'),
    isoNoise: unit(p, 'noise') * 0.5,
    contrast: 1.08,
    saturation: 1.1,
    gain: [0.97, 1.0, 1.05],
    highTint: [0.02, -0.01, 0.03],
    vignette: 0.15,
  }),
  animated: () => false,
  randomize: (p, rng) => jitter(p, rng, [ ['flashCast', 20, 85], ['crisp', 30, 90], ['clipping', 30, 90], ['noise', 15, 65] ]),
  onAction: (key, p) => dateBackAction(key, p) ?? p,
}

