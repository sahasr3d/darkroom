import type { Mat3 } from '../../engine/look'
import { randInt } from '../../engine/rng'
import { DATE_BACK_GROUP, dateBackAction, dateBackDefaults, scaleMatrix } from '../common'
import { ALL_ACCESSORIES, bool, num, type CameraBody, type Params } from '../types'

/**
 * FXN R — warm everyday 35mm colour negative. Rich greens and ambers come from a matrix that
 * pulls blue out of yellows and pushes green separation; highlights bloom softly.
 */
const RICH_GREEN_AMBER: Mat3 = [1.07, -0.02, -0.05, -0.03, 1.08, -0.05, -0.07, -0.04, 0.96]

const defaults: Params = {
  intensity: 85,
  warmth: 55,
  greens: 60,
  bloom: 45,
  grain: 40,
  border: false,
  ...dateBackDefaults(true),
}

export const fxnR: CameraBody = {
  id: 'fxn-r',
  badge: 'FXN R',
  tagline: 'Warm daily 35mm with rich greens and ambers',
  category: 'film35',
  format: '35mm ISO 200',
  aspect: () => 3 / 2,
  frame: (p) => (bool(p, 'border') ? { kind: 'print', paper: '#F3EFE4', border: 0.045 } : { kind: 'none' }),
  dateStamp: true,
  accessories: ALL_ACCESSORIES,
  sampleScene: 'golden',
  shutter: 'leaf',
  defaults,
  groups: [
    {
      title: 'Emulsion',
      controls: [
        { kind: 'range', key: 'warmth', label: 'Amber warmth', min: 0, max: 100, step: 1 },
        { kind: 'range', key: 'greens', label: 'Green richness', min: 0, max: 100, step: 1 },
        { kind: 'range', key: 'bloom', label: 'Highlight bloom', min: 0, max: 100, step: 1 },
        { kind: 'range', key: 'grain', label: 'Grain', min: 0, max: 100, step: 1 },
        { kind: 'toggle', key: 'border', label: 'White print border' },
      ],
    },
    DATE_BACK_GROUP,
  ],

  look: (p) => {
    const warm = num(p, 'warmth') / 100
    const greens = num(p, 'greens') / 100
    return {
      colorMatrix: scaleMatrix(RICH_GREEN_AMBER, 0.4 + greens * 0.9),
      gain: [1 + warm * 0.07, 1 + warm * 0.02, 1 - warm * 0.1],
      exposure: 0.06,
      contrast: 1.06,
      saturation: 1.08 + greens * 0.08,
      lift: 0.03,
      rolloff: 0.35,
      shadowTint: [0.0, 0.012, 0.018],
      highTint: [warm * 0.04, warm * 0.025, -warm * 0.02],
      halation: (num(p, 'bloom') / 100) * 0.7,
      halColor: [1, 0.55, 0.25],
      halRadius: 0.024,
      halThreshold: 0.7,
      grain: (num(p, 'grain') / 100) * 0.7,
      grainSize: 1.15,
      vignette: 0.3,
    }
  },

  animated: () => false,
  randomize: (p, rng) => ({
    ...p,
    warmth: randInt(rng, 30, 85),
    greens: randInt(rng, 35, 85),
    bloom: randInt(rng, 20, 75),
    grain: randInt(rng, 20, 65),
  }),
  onAction: (key, p) => dateBackAction(key, p) ?? p,
}
