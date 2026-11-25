import { describe, expect, test } from 'vitest'
import { generateDust } from '../dust'
import { cameraFor, curvatureFor, pathPoint, project, sampleTrack, TRACK_HALF_WIDTH_M } from '../guides'
import { cropRect, layoutAtScale, layoutForExport, layoutToFit, MAX_CANVAS_AREA } from '../layout'
import { createRng } from '../rng'
import { sprocketHoles } from '../overlays/frames'
import { formatTimestamp, validateTimestamp } from '../../cameras/bodies/dashCam'

const POLAROID_MARGINS = { l: 0.057, r: 0.057, t: 0.066, b: 0.29 }

describe('rng', () => {
  test('same seed yields the same sequence', () => {
    const a = createRng(42)
    const b = createRng(42)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })
  test('values stay in [0, 1)', () => {
    const r = createRng(7)
    for (let i = 0; i < 1000; i++) {
      const v = r()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('layout', () => {
  const one = (w: number, h: number, aspect: number | null, margins = { l: 0, r: 0, t: 0, b: 0 }) => ({
    sources: [{ w, h }],
    slots: [{ aspect, align: 0.5, source: 0 as const }],
    gap: 0,
    margins,
  })

  test('square crop centres the short edge on landscape input', () => {
    const [x, y, w, h] = cropRect(3000, 2000, 1)
    expect(x).toBeCloseTo(1 / 6)
    expect(w).toBeCloseTo(2 / 3)
    expect([y, h]).toEqual([0, 1])
  })
  test('no crop when aspect is null', () => {
    expect(cropRect(3000, 2000, null)).toEqual([0, 0, 1, 1])
  })
  test('align pans the crop window from left to right', () => {
    expect(cropRect(3000, 2000, 1, 0)[0]).toBe(0)
    expect(cropRect(3000, 2000, 1, 1)[0]).toBeCloseTo(1 / 3)
  })
  test('polaroid chin is the widest margin', () => {
    const l = layoutAtScale(one(1000, 1000, 1, POLAROID_MARGINS), 1)
    expect(l.image).toEqual({ x: 57, y: 66, w: 1000, h: 1000 })
    expect(l.canvasH - l.image.y - l.image.h).toBe(290)
    expect(l.canvasW).toBe(1114)
  })
  test('fit never exceeds the box', () => {
    const l = layoutToFit(one(4000, 3000, null, POLAROID_MARGINS), 800, 600)
    expect(l.canvasW).toBeLessThanOrEqual(800)
    expect(l.canvasH).toBeLessThanOrEqual(600)
  })
  test('export keeps native resolution when it fits', () => {
    const l = layoutForExport(one(2400, 1600, null), 8192)
    expect([l.canvasW, l.canvasH]).toEqual([2400, 1600])
  })
  test('export clamps to GPU edge and canvas area', () => {
    const l = layoutForExport(one(12000, 9000, null), 8192)
    expect(Math.max(l.image.w, l.image.h)).toBeLessThanOrEqual(8192)
    expect(l.canvasW * l.canvasH).toBeLessThanOrEqual(MAX_CANVAS_AREA * 1.001)
  })
  test('half-frame diptych lays two equal portrait slots side by side with a gap', () => {
    const l = layoutAtScale(
      { sources: [{ w: 2400, h: 1600 }, { w: 1200, h: 1600 }], slots: [{ aspect: 0.75, align: 0.2, source: 0 }, { aspect: 0.75, align: 0.8, source: 1 }], gap: 0.1, margins: { l: 0, r: 0, t: 0, b: 0 } },
      1,
    )
    const [a, b] = l.slots
    expect(a.rect.h).toBe(1600)
    expect(b.rect.h).toBe(a.rect.h)
    expect(a.rect.w).toBe(1200)
    expect(b.rect.x - (a.rect.x + a.rect.w)).toBe(120)
    expect(l.image.w).toBe(a.rect.w + b.rect.w + 120)
    expect(b.source).toBe(1)
  })
})

describe('sprocket holes', () => {
  test('follow the 135 perforation pitch and sit in both edge bands', () => {
    const r = { x: 0, y: 0, w: 2000, h: 1000 }
    const holes = sprocketHoles(r)
    const top = holes.filter((h) => h.y < 500)
    const bottom = holes.filter((h) => h.y >= 500)
    expect(top.length).toBe(bottom.length)
    expect(top[1].x - top[0].x).toBeCloseTo(135.7, 0)
    expect(top[0].y).toBeCloseTo(54)
    expect(bottom[0].y + bottom[0].h).toBeCloseTo(946)
    for (const h of holes) expect(h.x + h.w).toBeLessThanOrEqual(r.w)
  })
})

describe('reverse-cam guides', () => {
  test('zero steering gives straight parallel tracks', () => {
    const k = curvatureFor(0)
    expect(k).toBe(0)
    expect(pathPoint(k, TRACK_HALF_WIDTH_M, 2)).toEqual({ x: TRACK_HALF_WIDTH_M, z: 2 })
  })
  test('positive steering curves the path to the right, negative to the left', () => {
    expect(pathPoint(curvatureFor(25), 0, 2).x).toBeGreaterThan(0)
    expect(pathPoint(curvatureFor(-25), 0, 2).x).toBeLessThan(0)
  })
  test('steering is clamped to ±35°', () => {
    expect(curvatureFor(90)).toBeCloseTo(curvatureFor(35))
  })
  test('near track ends sit at the bottom of the frame and converge with distance', () => {
    const cam = cameraFor(1920, 1080)
    const near = project(cam, { x: TRACK_HALF_WIDTH_M, z: 0 })
    const far = project(cam, { x: TRACK_HALF_WIDTH_M, z: 2 })
    expect(near && far).toBeTruthy()
    expect(near!.y).toBeGreaterThan(1080 * 0.85)
    expect(far!.y).toBeLessThan(near!.y)
    expect(far!.x - cam.cx).toBeLessThan(near!.x - cam.cx)
  })
  test('sampled track has one point per step', () => {
    expect(sampleTrack(cameraFor(1280, 720), curvatureFor(10), -0.9, 0, 2, 10)).toHaveLength(11)
  })
})

describe('dust', () => {
  test('is deterministic per seed', () => {
    expect(generateDust(9, 0.5, 0.5)).toEqual(generateDust(9, 0.5, 0.5))
  })
  test('raising density keeps earlier specks in place', () => {
    const lo = generateDust(9, 0.2, 0)
    const hi = generateDust(9, 0.6, 0)
    expect(hi.specks.slice(0, lo.specks.length)).toEqual(lo.specks)
  })
  test('zero density produces nothing', () => {
    const d = generateDust(1, 0, 0)
    expect(d.specks.length + d.hairs.length + d.scratches.length).toBe(0)
  })
})

describe('dash cam timestamp', () => {
  test('accepts YYYY/MM/DD HH:MM:SS', () => {
    expect(validateTimestamp('2026/11/25 21:47:09')).toBeNull()
  })
  test('rejects partial or impossible values', () => {
    expect(validateTimestamp('2026/11/25 21:47')).not.toBeNull()
    expect(validateTimestamp('2026/13/25 21:47:09')).not.toBeNull()
    expect(validateTimestamp('2026/11/25 25:47:09')).not.toBeNull()
  })
  test('formatter round-trips through the validator', () => {
    expect(validateTimestamp(formatTimestamp(new Date(2020, 0, 5, 3, 4, 5)))).toBeNull()
  })
})
