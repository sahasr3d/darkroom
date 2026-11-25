import { INSTANT_FORMATS } from '../../engine/compositor'
import type { LookParams } from '../../engine/look'
import { jitter, knob, unit } from '../common'
import { CAPTION_GROUP, captionDefaults, drawCaption, PAPER_CONTROL, paperOf, shuffleInstant } from '../instant'
import { str, type CameraBody, type Control, type InstantFormat, type Params } from '../types'

interface InstantSpec {
  id: string
  badge: string
  tagline: string
  format: InstantFormat
  film: string
  sampleScene: CameraBody['sampleScene']
  emulsion: readonly Control[]
  defaults: Params
  look: (p: Params) => Partial<LookParams>
  ranges: readonly (readonly [string, number, number])[]
}

/** Integral-film exposure dial: lighten / normal / darken, ±⅔ stop like the real wheel. */
export const EXPOSURE_DIAL: Control = {
  kind: 'select',
  key: 'dial',
  label: 'Exposure dial',
  options: [
    { value: 'lighter', label: 'Lighter' },
    { value: 'normal', label: 'Normal' },
    { value: 'darker', label: 'Darker' },
  ],
}
const dialEv = (p: Params): number => (str(p, 'dial') === 'lighter' ? 0.66 : str(p, 'dial') === 'darker' ? -0.66 : 0)

function instantBody(spec: InstantSpec): CameraBody {
  return {
    id: spec.id,
    badge: spec.badge,
    tagline: spec.tagline,
    category: 'instant',
    format: spec.film,
    aspect: () => INSTANT_FORMATS[spec.format].aspect,
    frame: (p) => {
      const paper = paperOf(p)
      return { kind: 'instant', format: spec.format, paper: paper.color, dark: paper.dark, pattern: paper.pattern }
    },
    dateStamp: false,
    accessories: ['flash', 'leak', 'prism', 'starburst', 'nd', 'manual'],
    sampleScene: spec.sampleScene,
    shutter: 'instant',
    defaults: { intensity: 80, dial: 'normal', ...spec.defaults },
    groups: [{ title: 'Emulsion', controls: [PAPER_CONTROL, EXPOSURE_DIAL, ...spec.emulsion] }, CAPTION_GROUP],
    look: (p) => {
      const base = spec.look(p)
      return { ...base, exposure: (base.exposure ?? 0) + dialEv(p) }
    },
    overlay: (ctx, p, info) => {
      const { layout, unit: u } = info
      const chinTop = layout.image.y + layout.image.h
      drawCaption(ctx, p, layout.canvasW, chinTop, layout.canvasH - chinTop, layout.image.w * 0.92, u, paperOf(p).dark)
    },
    animated: () => false,
    randomize: (p, rng) => shuffleInstant(jitter(p, rng, spec.ranges), rng),
    onAction: (key, p, rng) => (key === 'shufflePaper' ? shuffleInstant(p, rng) : p),
  }
}

/** SX-70 / 600 integral film: milky lifted blacks, creamy highlights, cyan-green shadows. */
export const polaroidSx70 = instantBody({
  id: 'polaroid-sx70',
  badge: 'SX-70',
  tagline: 'Folding instant camera: milky blacks, creamy highlights',
  format: 'sx70',
  film: 'Integral film 3.1in',
  sampleScene: 'golden',
  emulsion: [knob('fade', 'Milky blacks'), knob('warmth', 'Cream highlights'), knob('shadowShift', 'Cyan-green shadows'), knob('grain', 'Grain')],
  defaults: { fade: 50, warmth: 50, shadowShift: 45, grain: 30, ...captionDefaults('summer, finally') },
  ranges: [ ['fade', 30, 75], ['warmth', 25, 85], ['shadowShift', 20, 80], ['grain', 15, 55] ],
  look: (p) => {
    const fade = unit(p, 'fade')
    const warm = unit(p, 'warmth')
    const shift = unit(p, 'shadowShift')
    return {
      exposure: 0.12,
      contrast: 0.94 - fade * 0.1,
      saturation: 0.88,
      lift: 0.025 + fade * 0.1,
      rolloff: 0.35 + warm * 0.4,
      gain: [1 + warm * 0.06, 1 + warm * 0.015, 1 - warm * 0.09],
      highTint: [warm * 0.05, warm * 0.03, -warm * 0.02],
      shadowTint: [-shift * 0.04, shift * 0.035, shift * 0.025],
      grain: unit(p, 'grain') * 0.6,
      grainSize: 1.1,
      vignette: 0.26,
      halation: 0.08,
      halColor: [1, 0.85, 0.65],
    }
  },
})

/** Mini-format instant: bright, clean and a touch cool, with crisp punchy midtones. */
export const instaC = instantBody({
  id: 'insta-c',
  badge: 'InstaC',
  tagline: 'Credit-card mini prints: bright, clean, a touch cool',
  format: 'mini',
  film: 'Mini instant 54×86mm',
  sampleScene: 'street',
  emulsion: [knob('chill', 'Cool shadows'), knob('pop', 'Colour pop'), knob('flashFall', 'Built-in flash'), knob('grain', 'Grain')],
  defaults: { chill: 45, pop: 50, flashFall: 30, grain: 20, ...captionDefaults('found it!', 'stripes') },
  ranges: [ ['chill', 20, 80], ['pop', 25, 80], ['flashFall', 0, 70], ['grain', 10, 40] ],
  look: (p) => {
    const chill = unit(p, 'chill')
    const pop = unit(p, 'pop')
    return {
      exposure: 0.18,
      contrast: 1.0 + pop * 0.12,
      saturation: 0.98 + pop * 0.16,
      lift: 0.03,
      rolloff: 0.45,
      gain: [0.99, 1.0, 1.02 + chill * 0.03],
      shadowTint: [-chill * 0.03, chill * 0.01, chill * 0.035],
      highTint: [0.01, 0.01, 0.0],
      flash: unit(p, 'flashFall') * 0.7,
      grain: unit(p, 'grain') * 0.45,
      grainSize: 0.95,
      vignette: 0.22,
    }
  },
})

/** Square-format instant: creamy, gently warm, soft contrast. */
export const instSqc = instantBody({
  id: 'inst-sqc',
  badge: 'Inst SQC',
  tagline: 'Square instant: creamy, gently warm, soft contrast',
  format: 'square',
  film: 'Square instant 72×86mm',
  sampleScene: 'golden',
  emulsion: [knob('cream', 'Cream warmth'), knob('soft', 'Soft contrast'), knob('bloom', 'Highlight glow'), knob('grain', 'Grain')],
  defaults: { cream: 55, soft: 45, bloom: 35, grain: 22, ...captionDefaults('sunday') },
  ranges: [ ['cream', 25, 85], ['soft', 20, 75], ['bloom', 10, 70], ['grain', 10, 45] ],
  look: (p) => {
    const cream = unit(p, 'cream')
    const soft = unit(p, 'soft')
    return {
      exposure: 0.12,
      contrast: 1.04 - soft * 0.14,
      saturation: 0.95,
      lift: 0.02 + soft * 0.05,
      rolloff: 0.4 + cream * 0.25,
      gain: [1 + cream * 0.05, 1 + cream * 0.02, 1 - cream * 0.06],
      highTint: [cream * 0.03, cream * 0.02, 0],
      halation: unit(p, 'bloom') * 0.45,
      halColor: [1, 0.82, 0.62],
      grain: unit(p, 'grain') * 0.5,
      vignette: 0.24,
    }
  },
})

/** Wide-format instant: deep, saturated party snaps with a strong flash falloff. */
export const instSs = instantBody({
  id: 'inst-ss',
  badge: 'Inst SS',
  tagline: 'Wide instant: deep colour and party-flash falloff',
  format: 'wide',
  film: 'Wide instant 108×86mm',
  sampleScene: 'highway',
  emulsion: [knob('depth', 'Colour depth'), knob('flashFall', 'Flash falloff'), knob('magenta', 'Magenta highlights'), knob('grain', 'Grain')],
  defaults: { depth: 55, flashFall: 45, magenta: 30, grain: 25, ...captionDefaults('roll 2 / shot 6', 'black'), ink: '#E9E6DD' },
  ranges: [ ['depth', 25, 85], ['flashFall', 10, 80], ['magenta', 0, 70], ['grain', 10, 45] ],
  look: (p) => {
    const depth = unit(p, 'depth')
    const mag = unit(p, 'magenta')
    return {
      exposure: 0.08,
      contrast: 1.04 + depth * 0.14,
      saturation: 1.02 + depth * 0.18,
      lift: 0.02,
      rolloff: 0.3,
      highTint: [mag * 0.04, -mag * 0.015, mag * 0.035],
      shadowTint: [0, 0.005, 0.015],
      flash: unit(p, 'flashFall') * 0.85,
      grain: unit(p, 'grain') * 0.5,
      vignette: 0.3,
    }
  },
})
