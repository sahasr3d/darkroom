import { describe, expect, test } from 'vitest'
import { NEUTRAL_LOOK } from '../../engine/look'
import { formatLedDate, measureLed, segmentsFor, validateLedText } from '../../engine/overlays/ledDate'
import { createRng } from '../../engine/rng'
import { SCENES } from '../../engine/scenes'
import { CAMERA_BODIES, shelfGroups } from '../registry'

describe('camera registry', () => {
  test('ids are unique', () => {
    const ids = CAMERA_BODIES.map((b) => b.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  test.each(CAMERA_BODIES.map((b) => [b.badge, b] as const))('%s is a complete body', (_badge, body) => {
    expect(body.defaults.intensity).toBeTypeOf('number')
    for (const g of body.groups) for (const c of g.controls) if (c.kind !== 'action') expect(body.defaults, `${c.key} default`).toHaveProperty(c.key)
    for (const key of Object.keys(body.look(body.defaults))) expect(NEUTRAL_LOOK, key).toHaveProperty(key)
    const aspect = body.aspect(body.defaults)
    expect(aspect === null || (aspect > 0.3 && aspect < 4)).toBe(true)
    expect(SCENES.map((s) => s.id)).toContain(body.sampleScene)
    const varied = body.randomize(body.defaults, createRng(3))
    expect(Object.keys(varied)).toEqual(expect.arrayContaining(Object.keys(body.defaults)))
  })

  test('every Phase 2 shelf body is registered', () => {
    const badges = CAMERA_BODIES.map((b) => b.badge)
    for (const b of ['FXN R', 'CPM35', 'D Classic', 'D Fun S', 'NT16', 'Classic U', 'S Classic', 'D Half', '135 SR', 'SX-70', 'InstaC', 'Inst SQC', 'Inst SS', 'Hoga', 'D Exp', '135 NE', 'D Slide', 'CCD', 'Dash Cam', 'Reverse Cam']) {
      expect(badges).toContain(b)
    }
  })

  test('D Half exposes two slots, the second fed by the paired frame', () => {
    const body = CAMERA_BODIES.find((b) => b.badge === 'D Half')!
    const slots = body.slots!(body.defaults)
    expect(slots).toHaveLength(2)
    expect(slots.map((s) => s.source)).toEqual([0, 1])
    expect(body.frame(body.defaults).kind).toBe('halfFrame')
  })

  test('shelf groups keep every body exactly once', () => {
    expect(shelfGroups().flatMap((g) => g.bodies)).toHaveLength(CAMERA_BODIES.length)
  })
})

describe('LED date back', () => {
  const d = new Date(1998, 7, 24)
  test('formats the classic orders', () => {
    expect(formatLedDate(d, 'ymd')).toBe("'98 08 24")
    expect(formatLedDate(d, 'mdy')).toBe("08 24 '98")
    expect(formatLedDate(d, 'dmy')).toBe("24 08 '98")
  })
  test('accepts only characters a seven-segment back can show', () => {
    expect(validateLedText("'98 08 24")).toBeNull()
    expect(validateLedText('AUG 24')).not.toBeNull()
    expect(validateLedText('   ')).not.toBeNull()
  })
  test('8 lights every segment, 1 lights only the right side', () => {
    expect(segmentsFor('8')).toEqual([1, 1, 1, 1, 1, 1, 1])
    expect(segmentsFor('1')).toEqual([0, 1, 1, 0, 0, 0, 0])
  })
  test('width grows with text and scales with size', () => {
    expect(measureLed("'98 08 24", 20)).toBeGreaterThan(measureLed('98', 20))
    expect(measureLed('88', 40)).toBeCloseTo(measureLed('88', 20) * 2)
  })
})
