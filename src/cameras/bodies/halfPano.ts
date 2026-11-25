import { DATE_BACK_GROUP, dateBackAction, dateBackDefaults, jitter, knob, unit } from '../common'
import { ALL_ACCESSORIES, bool, str, type CameraBody, type Params } from '../types'

/**
 * D Half — half-frame compact. Two portrait 18×24mm exposures share one 35mm frame, split by
 * the dark film base between them. Frame B comes from the next shot (live) or a second import;
 * without one, the camera pans across the same photo for a consecutive-frame diptych.
 */
export const dHalf: CameraBody = {
  id: 'd-half',
  badge: 'D Half',
  tagline: 'Half-frame diptych: two portrait frames on one negative',
  category: 'halfPano',
  format: '35mm half-frame 18×24mm',
  aspect: () => 3 / 4,
  slots: (p) => [
    { aspect: 3 / 4, align: unit(p, 'panA'), source: 0 },
    { aspect: 3 / 4, align: unit(p, 'panB'), source: 1 },
  ],
  slotGap: 0.07,
  frame: (p) => ({ kind: 'halfFrame', edgeText: str(p, 'frameNo') }),
  dateStamp: true,
  accessories: ALL_ACCESSORIES,
  sampleScene: 'street',
  shutter: 'leaf',
  defaults: { intensity: 85, panA: 22, panB: 78, warmth: 45, contrast: 45, grain: 40, frameNo: '23', ...dateBackDefaults(false) },
  groups: [
    {
      title: 'Diptych',
      controls: [
        knob('panA', 'Frame A position'),
        knob('panB', 'Frame B position'),
        { kind: 'text', key: 'frameNo', label: 'Edge frame number', maxLength: 3, placeholder: '23' },
        { kind: 'action', key: 'app:pairImport', label: 'Load a photo as frame B' },
        { kind: 'action', key: 'app:pairClear', label: 'Use the same photo for both' },
      ],
    },
    { title: 'Emulsion', controls: [knob('warmth', 'Warmth'), knob('contrast', 'Contrast'), knob('grain', 'Grain')] },
    DATE_BACK_GROUP,
  ],
  look: (p) => {
    const warm = unit(p, 'warmth')
    return {
      exposure: 0.05,
      contrast: 0.98 + unit(p, 'contrast') * 0.2,
      saturation: 1.02,
      lift: 0.02,
      rolloff: 0.35,
      gain: [1 + warm * 0.06, 1 + warm * 0.02, 1 - warm * 0.07],
      grain: 0.15 + unit(p, 'grain') * 0.55,
      grainSize: 1.25,
      vignette: 0.35,
    }
  },
  animated: () => false,
  randomize: (p, rng) => jitter(p, rng, [ ['panA', 5, 45], ['panB', 55, 95], ['warmth', 20, 75], ['contrast', 20, 75], ['grain', 20, 60] ]),
  onAction: (key, p) => dateBackAction(key, p) ?? p,
}

/**
 * 135 SR — sprocket-rocket panoramic. The wide exposure runs edge to edge across the 35mm
 * film, so the perforations and edge print are burned into the picture.
 */
export const sr135: CameraBody = {
  id: '135-sr',
  badge: '135 SR',
  tagline: 'Ultra-wide panoramic exposed across the sprocket holes',
  category: 'halfPano',
  format: '35mm full-width 72×35mm',
  aspect: () => 72 / 35,
  frame: (p) => ({ kind: 'sprocket', holes: bool(p, 'holes'), edgeText: bool(p, 'edgePrint') ? str(p, 'edgeText') : '' }),
  dateStamp: false,
  accessories: ALL_ACCESSORIES,
  sampleScene: 'golden',
  shutter: 'leaf',
  defaults: { intensity: 85, holes: true, edgePrint: true, edgeText: 'SAFETY FILM 400', vignette: 60, saturation: 55, grain: 45 },
  groups: [
    {
      title: 'Film gate',
      controls: [
        { kind: 'toggle', key: 'holes', label: 'Exposed sprocket holes' },
        { kind: 'toggle', key: 'edgePrint', label: 'Edge print' },
        { kind: 'text', key: 'edgeText', label: 'Edge print text', maxLength: 22, placeholder: 'SAFETY FILM 400' },
      ],
    },
    { title: 'Lens & emulsion', controls: [knob('vignette', 'Wide-lens vignette'), knob('saturation', 'Saturation'), knob('grain', 'Grain')] },
  ],
  look: (p) => ({
    barrel: 0.22,
    softEdge: 0.35,
    ca: 0.35,
    vignette: 0.3 + unit(p, 'vignette') * 0.55,
    contrast: 1.06,
    saturation: 0.95 + unit(p, 'saturation') * 0.3,
    lift: 0.02,
    gain: [1.04, 1.0, 0.95],
    grain: 0.15 + unit(p, 'grain') * 0.55,
    grainSize: 1.3,
  }),
  animated: () => false,
  randomize: (p: Params, rng) => jitter(p, rng, [ ['vignette', 30, 85], ['saturation', 25, 85], ['grain', 20, 70] ]),
}
