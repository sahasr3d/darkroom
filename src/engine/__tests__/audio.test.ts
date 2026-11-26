import { describe, expect, test } from 'vitest'
import { VIDEO_BODIES } from '../../cameras/bodies/video'
import { soundSourceOf } from '../audio/capture'
import { audioChainFor, clatterTimes, crushCurve, isClean, warmthCurve } from '../audio/chain'
import { pickMimeType } from '../recorder'

const types = (id: string) => audioChainFor(id).filters.map((f) => f.type)

describe('audio chain per body', () => {
  test('every video body has a recipe', () => {
    for (const body of VIDEO_BODIES) expect(audioChainFor(body.id).name).toBeTruthy()
  })
  test.each(['v-vhs', 'v-classic'])('%s: ~7 kHz lowpass, hiss and wow/flutter', (id) => {
    const c = audioChainFor(id)
    expect(c.filters.find((f) => f.type === 'lowpass')?.frequency).toBe(7000)
    expect(c.hiss).toBeGreaterThan(0)
    expect(c.wow?.wowRate).toBeCloseTo(0.5)
    expect(c.wow?.flutterRate).toBeCloseTo(6)
    expect(c.clatter).toBe(0)
  })
  test.each(['v-8mm', 'v-16mm', 'v-slide-p'])('%s: 300 to 4000 Hz band, projector clatter and hiss', (id) => {
    const c = audioChainFor(id)
    expect(c.filters.find((f) => f.type === 'highpass')?.frequency).toBe(300)
    expect(c.filters.find((f) => f.type === 'lowpass')?.frequency).toBe(4000)
    expect(c.clatter).toBeGreaterThan(0)
    expect(c.hiss).toBeGreaterThan(0)
    expect(c.wow).toBeNull()
  })
  test('DCR: compression and a slight hiss', () => {
    const c = audioChainFor('v-dcr')
    expect(c.compress).toBe(true)
    expect(c.hiss).toBeGreaterThan(0)
    expect(c.hiss).toBeLessThan(audioChainFor('v-vhs').hiss)
  })
  test.each(['v-kino', 'v-glow'])('%s: gentle lowpass and warmth', (id) => {
    const c = audioChainFor(id)
    expect(types(id)).toContain('lowpass')
    expect(c.warmth).toBeGreaterThan(0)
    expect(c.crushSteps).toBe(0)
  })
  test('V FunS: bitcrush and lowpass', () => {
    expect(audioChainFor('v-funs').crushSteps).toBeGreaterThan(0)
    expect(types('v-funs')).toContain('lowpass')
  })
  test.each(['v-original', 'fxn-r'])('%s records clean', (id) => {
    const c = audioChainFor(id)
    expect(c.filters).toHaveLength(0)
    expect(isClean(c)).toBe(true)
    expect(c.wow).toBeNull()
    expect(c.compress).toBe(false)
  })
})

describe('audio curves and clatter', () => {
  test('warmth curve is odd-symmetric, monotonic and hits ±1', () => {
    const c = warmthCurve(1.5, 101)
    expect(c[0]).toBeCloseTo(-1)
    expect(c[100]).toBeCloseTo(1)
    expect(c[50]).toBeCloseTo(0)
    expect(c[25]).toBeCloseTo(-c[75])
    for (let i = 1; i < c.length; i++) expect(c[i]).toBeGreaterThanOrEqual(c[i - 1])
  })
  test('zero drive is a straight line', () => {
    expect(Array.from(warmthCurve(0, 3))).toEqual([-1, 0, 1])
  })
  test('crush curve quantises to the given steps', () => {
    const levels = new Set(Array.from(crushCurve(4, 201)).map((v) => Math.round(v * 100) / 100))
    expect(levels.size).toBe(9)
  })
  test('one click per frame of the loop', () => {
    expect(clatterTimes(18, 1)).toHaveLength(18)
    expect(clatterTimes(24, 1)[1]).toBeCloseTo(1 / 24)
    expect(clatterTimes(0, 1)).toHaveLength(1)
  })
})

describe('sound source', () => {
  test('camera stream → microphone, imported file → its own track, still → none', () => {
    expect(soundSourceOf({ hasStream: true, blobSrc: false })).toBe('microphone')
    expect(soundSourceOf({ hasStream: false, blobSrc: true })).toBe('file')
    expect(soundSourceOf({ hasStream: false, blobSrc: false })).toBe('none')
  })
})

describe('recorder mime types with sound', () => {
  test('prefers VP9 + Opus WebM when recording sound', () => {
    expect(pickMimeType(() => true, true)).toBe('video/webm;codecs=vp9,opus')
  })
  test('falls back to AAC MP4 (Safari), then plain containers', () => {
    expect(pickMimeType((t) => t.startsWith('video/mp4'), true)).toBe('video/mp4;codecs=avc1,mp4a.40.2')
    expect(pickMimeType((t) => t === 'video/webm', true)).toBe('video/webm')
    expect(pickMimeType(() => false, true)).toBeNull()
  })
  test('silent clips keep the video-only list', () => {
    expect(pickMimeType(() => true, false)).toBe('video/webm;codecs=vp9')
  })
})
