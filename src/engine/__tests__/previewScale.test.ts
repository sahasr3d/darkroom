import { describe, expect, test } from 'vitest'
import { CALM_FRAMES, INITIAL_GOVERNOR, previewTag, scaleOf, stepGovernor, WINDOW_FRAMES, type PreviewGovernor } from '../previewScale'

const feed = (g: PreviewGovernor, ms: number, frames: number): PreviewGovernor => Array.from({ length: frames }).reduce<PreviewGovernor>((acc) => stepGovernor(acc, ms), g)

describe('preview scale governor', () => {
  test('starts at full resolution', () => {
    expect(scaleOf(INITIAL_GOVERNOR)).toBe(1)
  })
  test('waits for a full window before judging', () => {
    expect(feed(INITIAL_GOVERNOR, 40, WINDOW_FRAMES - 1).level).toBe(0)
  })
  test('steps down 1 → ¾ → ½ under sustained slow frames, and no further', () => {
    const one = feed(INITIAL_GOVERNOR, 20, WINDOW_FRAMES)
    expect(scaleOf(one)).toBe(0.75)
    expect(one.window).toEqual([])
    const two = feed(one, 20, WINDOW_FRAMES)
    expect(scaleOf(two)).toBe(0.5)
    expect(scaleOf(feed(two, 50, WINDOW_FRAMES * 3))).toBe(0.5)
  })
  test('a single spike inside a fast window does not step down', () => {
    const g = feed(INITIAL_GOVERNOR, 5, WINDOW_FRAMES - 1)
    expect(stepGovernor(g, 60).level).toBe(0)
  })
  test('steps back up only after a long fast streak', () => {
    const low = feed(feed(INITIAL_GOVERNOR, 20, WINDOW_FRAMES), 20, WINDOW_FRAMES)
    const almost = feed(low, 3, WINDOW_FRAMES - 1 + CALM_FRAMES - 1)
    expect(almost.level).toBe(2)
    expect(scaleOf(stepGovernor(almost, 3))).toBe(0.75)
  })
  test('middling frame times hold the current level', () => {
    const low = feed(INITIAL_GOVERNOR, 20, WINDOW_FRAMES)
    expect(feed(low, 10, 500).level).toBe(1)
  })
  test('a slower window resets the calm streak', () => {
    const low = feed(INITIAL_GOVERNOR, 20, WINDOW_FRAMES)
    const calm = feed(low, 3, WINDOW_FRAMES + 50)
    expect(calm.calm).toBeGreaterThan(0)
    expect(feed(calm, 13, WINDOW_FRAMES).calm).toBe(0)
  })
  test('ignores nonsense timings and never mutates its input', () => {
    const g = feed(INITIAL_GOVERNOR, 5, 3)
    expect(stepGovernor(g, Number.NaN)).toBe(g)
    expect(stepGovernor(g, -1)).toBe(g)
    stepGovernor(g, 5)
    expect(g.window).toHaveLength(3)
  })
  test('tag text only appears when reduced', () => {
    expect(previewTag(1)).toBeNull()
    expect(previewTag(0.75)).toBe('Preview ¾')
    expect(previewTag(0.5)).toBe('Preview ½')
  })
})
