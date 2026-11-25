import { describe, expect, test } from 'vitest'
import { EV_STOPS, formatEv, formatShutter, HANDHELD_LIMIT, isoNoiseFor, manualExposureEv, motionBlurFor, nearestStopIndex, SHUTTER_STOPS } from '../exposure'
import { hardwareConstraints, sensorPoint } from '../hardware'
import { applyRig, DEFAULT_RIG, gateRig, NEUTRAL_LOOK } from '../look'
import { rollFrom } from '../useHorizon'
import { focalFromRing, ringFromFocal } from '../../ui/LensDock'

describe('exposure model', () => {
  test('ISO 200 at 1/125s is the reference exposure', () => {
    expect(manualExposureEv(200, 1 / 125)).toBeCloseTo(0)
  })
  test('each doubling of ISO or shutter time adds one stop', () => {
    expect(manualExposureEv(400, 1 / 125)).toBeCloseTo(1)
    expect(manualExposureEv(200, 1 / 60)).toBeCloseTo(Math.log2(125 / 60))
    expect(manualExposureEv(100, 1 / 250)).toBeCloseTo(-2)
  })
  test('noise only appears above ISO 400 and keeps growing', () => {
    expect(isoNoiseFor(400)).toBe(0)
    expect(isoNoiseFor(1600)).toBeGreaterThan(isoNoiseFor(800))
  })
  test('no shake blur at or faster than the hand-holding limit', () => {
    expect(motionBlurFor(HANDHELD_LIMIT, false)).toBe(0)
    expect(motionBlurFor(1 / 250, false)).toBe(0)
  })
  test('slow shutters blur, stabilisation damps it', () => {
    const raw = motionBlurFor(1 / 4, false)
    expect(raw).toBeGreaterThan(0)
    expect(motionBlurFor(1 / 4, true)).toBeLessThan(raw)
  })
  test('labels read like a camera', () => {
    expect(formatShutter(1 / 125)).toBe('1/125')
    expect(formatShutter(1)).toBe('1s')
    expect(formatEv(0)).toBe('±0')
    expect(formatEv(1 / 3)).toBe('+⅓')
    expect(formatEv(-4 / 3)).toBe('−1⅓')
    expect(formatEv(2)).toBe('+2')
  })
  test('EV stops run −3..+3 in thirds and snapping finds the closest', () => {
    expect(EV_STOPS).toHaveLength(19)
    expect(EV_STOPS[0]).toBeCloseTo(-3)
    expect(EV_STOPS[18]).toBeCloseTo(3)
    expect(EV_STOPS[nearestStopIndex(EV_STOPS, 0.3)]).toBeCloseTo(1 / 3)
    expect(SHUTTER_STOPS[nearestStopIndex(SHUTTER_STOPS, 1 / 100)]).toBe(1 / 125)
  })
})

describe('rig', () => {
  test('manual exposure feeds exposure, noise and shake blur', () => {
    const out = applyRig(NEUTRAL_LOOK, { ...DEFAULT_RIG, manual: true, iso: 1600, shutter: 1 / 4, stabilize: false }, 7)
    expect(out.exposure).toBeCloseTo(manualExposureEv(1600, 1 / 4))
    expect(out.isoNoise).toBeGreaterThan(0)
    expect(out.motionBlur).toBeGreaterThan(0)
  })
  test('hardware-applied exposure is not simulated twice', () => {
    const out = applyRig(NEUTRAL_LOOK, { ...DEFAULT_RIG, manual: true, iso: 1600, shutter: 1 / 4, hwExposure: true }, 7)
    expect(out.exposure).toBe(0)
    expect(out.motionBlur).toBe(0)
  })
  test('tap-to-focus and double exposure switch their shader paths on', () => {
    const out = applyRig(NEUTRAL_LOOK, { ...DEFAULT_RIG, focus: [0.2, 0.7], double: true, blend: 'overlay', balance: 25 }, 7)
    expect(out.focusPoint).toEqual([0.2, 0.7])
    expect(out.dof).toBeGreaterThan(0)
    expect([out.double, out.blendMode, out.blendBalance]).toEqual([1, 2, 0.25])
  })
  test('gating strips accessories a body does not take', () => {
    const rig = { ...DEFAULT_RIG, focal: 120, lens: 'fisheye' as const, nd: 2, flash: true, manual: true, kelvin: 3200, double: true }
    const g = gateRig(rig, ['flash'], true)
    expect([g.focal, g.lens, g.nd, g.flash, g.manual, g.kelvin, g.double]).toEqual([24, 'none', 0, true, false, 5500, false])
    expect(gateRig(rig, ['focal', 'fisheye', 'nd', 'manual'], false).focal).toBe(120)
  })
})

describe('hardware constraints', () => {
  const caps = {
    exposureMode: ['continuous', 'manual'],
    iso: { min: 50, max: 3200 },
    exposureTime: { min: 1, max: 10000 },
    whiteBalanceMode: ['continuous', 'manual'],
    colorTemperature: { min: 2850, max: 7000 },
    focusMode: ['continuous', 'single-shot'],
  }
  test('manual ISO/shutter/WB map onto the track, clamped to its ranges', () => {
    const { advanced, applied } = hardwareConstraints(caps, { ...DEFAULT_RIG, manual: true, iso: 6400, shutter: 1 / 60, kelvin: 9000 }, false)
    expect(applied).toEqual({ exposure: true, whiteBalance: true, focus: false })
    expect(advanced).toContainEqual({ exposureMode: 'manual', iso: 3200, exposureTime: 10000 / 60 })
    expect(advanced).toContainEqual({ whiteBalanceMode: 'manual', colorTemperature: 7000 })
  })
  test('auto mode hands control back to the camera', () => {
    const { advanced, applied } = hardwareConstraints(caps, DEFAULT_RIG, false)
    expect(applied.exposure).toBe(false)
    expect(advanced).toContainEqual({ exposureMode: 'continuous' })
  })
  test('tap-to-focus uses points of interest only when supported', () => {
    expect(hardwareConstraints(caps, { ...DEFAULT_RIG, focus: [0.3, 0.4] }, true).applied.focus).toBe(true)
    expect(hardwareConstraints(caps, { ...DEFAULT_RIG, focus: [0.3, 0.4] }, false).applied.focus).toBe(false)
  })
  test('focus taps map through crop, zoom and mirroring to sensor coordinates', () => {
    // Centre stays centre whatever the crop or zoom.
    expect(sensorPoint([0.5, 0.5], [0.125, 0, 0.75, 1], 2, false)).toEqual([0.5, 0.5])
    // A 3:4 sensor cropped to the middle 75% width: the frame's left edge is 12.5% in.
    expect(sensorPoint([0, 0.5], [0.125, 0, 0.75, 1], 1, false)[0]).toBeCloseTo(0.125)
    // 2× zoom halves the distance from centre.
    expect(sensorPoint([1, 1], [0, 0, 1, 1], 2, false)).toEqual([0.75, 0.75])
    // Selfie preview is mirrored: tapping its left side focuses the sensor's right side.
    expect(sensorPoint([0.1, 0.5], [0, 0, 1, 1], 1, true)[0]).toBeCloseTo(0.9)
  })
  test('a camera with no controls gets no constraints', () => {
    expect(hardwareConstraints({}, { ...DEFAULT_RIG, manual: true }, true).advanced).toHaveLength(0)
  })
})

describe('horizon', () => {
  test('portrait roll comes from gamma, landscape from beta', () => {
    expect(rollFrom(0, 12, 0)).toBe(-12)
    expect(rollFrom(8, 0, 90)).toBe(-8)
    expect(rollFrom(8, 0, 270)).toBe(8)
  })
})

describe('zoom ring', () => {
  test('is logarithmic from 13mm to 120mm and round-trips', () => {
    expect(focalFromRing(0)).toBe(13)
    expect(focalFromRing(1000)).toBe(120)
    expect(focalFromRing(500)).toBe(39)
    expect(Math.abs(focalFromRing(ringFromFocal(50)) - 50)).toBeLessThanOrEqual(1)
  })
})
