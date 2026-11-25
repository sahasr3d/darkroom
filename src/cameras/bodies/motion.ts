import { jitter, knob, unit } from '../common'
import { ALL_ACCESSORIES, bool, num, str, type CameraBody, type Control, type Params } from '../types'

export type LoopOutput = 'gif' | 'video' | 'both'
export const loopOutputOf = (p: Params): LoopOutput => (['gif', 'video', 'both'].includes(str(p, 'output')) ? (str(p, 'output') as LoopOutput) : 'gif')
/** Playback delay per loop frame, ms. */
export const loopDelayOf = (p: Params): number => Math.max(40, num(p, 'speed') || 110)
export const parallaxOf = (p: Params): number => unit(p, 'parallax')
export const wantsContactSheet = (p: Params): boolean => bool(p, 'sheet')

const OUTPUT_CONTROL: Control = {
  kind: 'select',
  key: 'output',
  label: 'Save as',
  options: [
    { value: 'gif', label: 'Looping GIF' },
    { value: 'video', label: 'Video clip' },
    { value: 'both', label: 'GIF and video' },
  ],
}

const speedControl = (fast: string, mid: string, slow: string): Control => ({
  kind: 'select',
  key: 'speed',
  label: 'Playback speed',
  options: [
    { value: fast, label: 'Quick' },
    { value: mid, label: 'Classic' },
    { value: slow, label: 'Slow' },
  ],
})

/**
 * D3D — four-lens 3D camera. Four half-frame views are captured side by side and played back
 * as a ping-pong "wiggle". On a still photo the parallax comes from a depth estimate.
 */
export const d3d: CameraBody = {
  id: 'd3d',
  badge: 'D3D',
  tagline: 'Four-lens 3D: four parallax views played back as a wiggle',
  category: 'motion',
  format: '35mm 4-lens half-frame',
  aspect: () => 3 / 4,
  frame: () => ({ kind: 'none' }),
  dateStamp: false,
  accessories: ALL_ACCESSORIES,
  sampleScene: 'street',
  shutter: 'focal-plane',
  burst: { kind: 'wiggle', frames: 4, intervalMs: 90 },
  defaults: { intensity: 85, parallax: 55, speed: '110', output: 'gif', warmth: 50, grain: 40 },
  groups: [
    { title: '3D wiggle', controls: [knob('parallax', 'Depth separation'), speedControl('70', '110', '160'), OUTPUT_CONTROL] },
    { title: 'Emulsion', controls: [knob('warmth', 'Warmth'), knob('grain', 'Grain')] },
  ],
  look: (p) => {
    const warm = unit(p, 'warmth')
    return {
      contrast: 1.08,
      saturation: 1.1,
      lift: 0.02,
      gain: [1 + warm * 0.06, 1 + warm * 0.015, 1 - warm * 0.08],
      grain: 0.15 + unit(p, 'grain') * 0.5,
      grainSize: 1.3,
      vignette: 0.35,
    }
  },
  animated: () => false,
  randomize: (p, rng) => jitter(p, rng, [ ['parallax', 30, 85], ['warmth', 20, 80], ['grain', 15, 65] ]),
}

/**
 * Golf — sixteen-lens action camera. One press fires sixteen frames in sequence for a staccato
 * loop; the optional contact sheet lays them out four by four, like the original print.
 */
export const golf: CameraBody = {
  id: 'golf',
  badge: 'Golf',
  tagline: 'Sixteen-frame action burst: staccato loop and 4×4 contact print',
  category: 'motion',
  format: '35mm 16-lens sequence',
  aspect: () => 4 / 3,
  frame: () => ({ kind: 'none' }),
  dateStamp: false,
  accessories: ALL_ACCESSORIES,
  sampleScene: 'highway',
  shutter: 'focal-plane',
  burst: { kind: 'sequence', frames: 16, intervalMs: 125 },
  defaults: { intensity: 85, speed: '125', output: 'gif', sheet: true, contrast: 55, saturation: 55, grain: 45 },
  groups: [
    { title: 'Sequence', controls: [speedControl('80', '125', '200'), OUTPUT_CONTROL, { kind: 'toggle', key: 'sheet', label: '4×4 contact sheet' }] },
    { title: 'Emulsion', controls: [knob('contrast', 'Contrast'), knob('saturation', 'Saturation'), knob('grain', 'Grain')] },
  ],
  look: (p) => ({
    contrast: 1.0 + unit(p, 'contrast') * 0.25,
    saturation: 0.95 + unit(p, 'saturation') * 0.3,
    lift: 0.02,
    gain: [1.04, 1.0, 0.95],
    grain: 0.2 + unit(p, 'grain') * 0.5,
    grainSize: 1.4,
    vignette: 0.4,
    softEdge: 0.25,
  }),
  animated: () => false,
  randomize: (p, rng) => jitter(p, rng, [ ['contrast', 25, 85], ['saturation', 25, 85], ['grain', 20, 70] ]),
}
