import { describe, expect, test } from 'vitest'
import { ANALOG_SRC, FILM_SRC, OPTICS_SRC } from '../gl/shaders'
import { applyRig, DEFAULT_RIG, focalToOptics, GELS, kelvinToGain, mixLook, NEUTRAL_LOOK, type LookParams } from '../look'
import { uniformName } from '../renderer'

describe('mixLook', () => {
  test('intensity 0 is the untouched photo', () => {
    const u = mixLook({ contrast: 1.4, lift: 0.2, gain: [1.2, 1, 0.8], colorMatrix: [2, 0, 0, 0, 2, 0, 0, 0, 2] }, 0)
    expect(u.contrast).toBe(1)
    expect(u.lift).toBe(0)
    expect(u.gain).toEqual([1, 1, 1])
    expect(u.colorMatrix).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1])
  })
  test('placement fields ignore intensity', () => {
    const u = mixLook({ leakPos: [0.1, 0.9], scanCount: 576, starPoints: 6 }, 0.3)
    expect(u.leakPos).toEqual([0.1, 0.9])
    expect(u.scanCount).toBe(576)
    expect(u.starPoints).toBe(6)
  })
  test('intensity 1 returns the full look', () => {
    expect(mixLook({ grain: 0.5 }, 1).grain).toBe(0.5)
  })
})

describe('white balance', () => {
  test('5500K is neutral', () => {
    const [r, g, b] = kelvinToGain(5500)
    expect(r).toBeCloseTo(1, 2)
    expect(g).toBeCloseTo(1, 2)
    expect(b).toBeCloseTo(1, 2)
  })
  test('tungsten light (3200K) needs a cooling correction', () => {
    const [r, , b] = kelvinToGain(3200)
    expect(b).toBeGreaterThan(r)
  })
  test('shade (8000K) needs a warming correction', () => {
    const [r, , b] = kelvinToGain(8000)
    expect(r).toBeGreaterThan(b)
  })
  test('positive tint pulls green down (magenta)', () => {
    expect(kelvinToGain(5500, 1)[1]).toBeLessThan(kelvinToGain(5500, 0)[1])
  })
})

describe('focal length', () => {
  test('24mm is the native field of view', () => {
    expect(focalToOptics(24)).toEqual({ zoom: 1, barrel: 0 })
  })
  test('longer lenses crop in proportionally', () => {
    expect(focalToOptics(120).zoom).toBe(5)
    expect(focalToOptics(50).zoom).toBeCloseTo(50 / 24)
  })
  test('13mm adds wide-angle barrel instead of zooming out', () => {
    const o = focalToOptics(13)
    expect(o.zoom).toBe(1)
    expect(o.barrel).toBeGreaterThan(0.5)
  })
})

describe('rig', () => {
  test('default rig leaves the look unchanged apart from neutral white balance', () => {
    const out = applyRig(NEUTRAL_LOOK, DEFAULT_RIG, 7)
    expect(out.zoom).toBe(1)
    expect(out.exposure).toBe(0)
    expect(out.prism).toBe(0)
  })
  test('accessories switch their shader paths on', () => {
    const out = applyRig(NEUTRAL_LOOK, { ...DEFAULT_RIG, lens: 'starburst', starPoints: 6, flash: true, gel: 'red', nd: 2, ev: 1 }, 7)
    expect(out.star).toBe(1)
    expect(out.starPoints).toBe(6)
    expect(out.flashGel).toEqual(GELS.red)
    expect(out.exposure - out.nd).toBe(-1)
  })
  test('kaleidoscope prism uses six segments', () => {
    const out = applyRig(NEUTRAL_LOOK, { ...DEFAULT_RIG, lens: 'prism', prismMode: 'kaleido' }, 7)
    expect([out.prism, out.prismMode, out.prismSegments]).toEqual([1, 2, 6])
  })
})

describe('shader contract', () => {
  const all = OPTICS_SRC + FILM_SRC + ANALOG_SRC
  test.each(Object.keys(NEUTRAL_LOOK) as (keyof LookParams)[])('%s has a uniform in some pass', (key) => {
    expect(all).toMatch(new RegExp(`uniform [a-z0-9]+ ${uniformName(key)};`))
  })
})
