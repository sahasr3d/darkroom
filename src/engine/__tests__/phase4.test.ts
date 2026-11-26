import { applyPalette, GIFEncoder, quantize } from 'gifenc'
import { describe, expect, test } from 'vitest'
import { fpsOf } from '../../cameras/bodies/video'
import { CAMERA_BODIES } from '../../cameras/registry'
import { playOrder, sheetGeometry, wiggleOrder, WIGGLE_VIEWS } from '../burst'
import { marginsFor } from '../compositor'
import { encodeGifBytes } from '../gifEncode'
import { camcorderStamp, formatCounter, formatTimecode } from '../overlays/video'
import { extensionFor, pickMimeType } from '../recorder'

describe('burst ordering', () => {
  test('wiggle plays the four views back and forth without repeating the ends', () => {
    expect(wiggleOrder(4)).toEqual([0, 1, 2, 3, 2, 1])
    expect(wiggleOrder(1)).toEqual([0])
  })
  test('D3D views are symmetric around the centre', () => {
    expect(WIGGLE_VIEWS.reduce((a, b) => a + b, 0)).toBe(0)
  })
  test('sequence plays every frame once, in order', () => {
    expect(playOrder({ kind: 'sequence', frames: 16, intervalMs: 125 }, 16)).toEqual(Array.from({ length: 16 }, (_, i) => i))
  })
})

describe('contact sheet', () => {
  test('sixteen frames make a 4×4 print with border and gutters', () => {
    const g = sheetGeometry(16, 400, 300)
    expect([g.cols, g.rows]).toEqual([4, 4])
    expect(g.width).toBe(4 * 400 + 3 * g.gutter + 2 * g.border)
    expect(g.height).toBe(4 * 300 + 3 * g.gutter + 2 * g.border)
  })
})

describe('recorder', () => {
  test('prefers VP9 WebM, falls back to MP4 (Safari), or reports nothing', () => {
    expect(pickMimeType(() => true)).toBe('video/webm;codecs=vp9')
    expect(pickMimeType((t) => t.startsWith('video/mp4'))).toBe('video/mp4;codecs=avc1')
    expect(pickMimeType(() => false)).toBeNull()
  })
  test('file extension follows the container', () => {
    expect(extensionFor('video/mp4;codecs=avc1')).toBe('mp4')
    expect(extensionFor('video/webm;codecs=vp9')).toBe('webm')
  })
})

describe('camcorder OSD', () => {
  test('tape counter and SMPTE timecode', () => {
    expect(formatCounter(75.4)).toBe('0:01:15')
    expect(formatTimecode(12.5, 30)).toBe('0:00:12:15')
    expect(formatTimecode(3661, 24)).toBe('1:01:01:00')
  })
  test('date stamp reads like a 90s camcorder', () => {
    expect(camcorderStamp(new Date(1996, 10, 25, 19, 42))).toEqual({ date: 'NOV.25 1996', time: '7:42 PM' })
    expect(camcorderStamp(new Date(2001, 0, 3, 0, 5)).time).toBe('12:05 AM')
  })
})

describe('video bodies', () => {
  const video = CAMERA_BODIES.filter((b) => b.medium === 'video')
  test('all ten retro video cameras are on the shelf', () => {
    expect(video.map((b) => b.badge)).toEqual(['8mm', '16mm', 'VHS', 'DCR', 'Kino', 'V Classic', 'V FunS', 'Glow', 'Slide P', 'Original V'])
  })
  test('every video body exposes the 18/24/30 fps switch and the gate toggles', () => {
    for (const b of video) {
      const keys = b.groups.flatMap((g) => g.controls.map((c) => c.key))
      expect(keys, b.badge).toEqual(expect.arrayContaining(['fps', 'gateRounded', 'perfs', 'scan', 'jitter', 'border']))
      expect([18, 24, 30]).toContain(fpsOf(b.defaults))
    }
  })
  test('8mm defaults to choppy 18 fps, Kino to 24 fps cinema', () => {
    expect(fpsOf(video[0].defaults)).toBe(18)
    expect(fpsOf(video.find((b) => b.badge === 'Kino')!.defaults)).toBe(24)
  })
  test('Kino letterboxes a 2.39 image into a 16:9 frame', () => {
    const kino = video.find((b) => b.badge === 'Kino')!
    const m = marginsFor(kino.frame(kino.defaults))
    expect(2.39 / (1 + m.t + m.b)).toBeCloseTo(16 / 9, 2)
  })
  test('scanline and jitter toggles switch their shader effects', () => {
    const vhs = video.find((b) => b.badge === 'VHS')!
    expect(vhs.look({ ...vhs.defaults, scan: true }).scanlines).toBeGreaterThan(0)
    expect(vhs.look({ ...vhs.defaults, scan: false }).scanlines).toBe(0)
    expect(vhs.look({ ...vhs.defaults, jitter: true }).gateWeave).toBeGreaterThan(0)
  })
})

describe('motion bodies', () => {
  test('D3D fires a 4-view wiggle, Golf a 16-frame sequence', () => {
    const d3d = CAMERA_BODIES.find((b) => b.badge === 'D3D')!
    const golf = CAMERA_BODIES.find((b) => b.badge === 'Golf')!
    expect(d3d.burst).toMatchObject({ kind: 'wiggle', frames: 4 })
    expect(golf.burst).toMatchObject({ kind: 'sequence', frames: 16 })
  })
})

describe('GIF encoding', () => {
  test('gifenc produces a looping GIF89a', () => {
    const w = 4
    const h = 4
    const rgba = new Uint8Array(w * h * 4).map((_, i) => (i % 4 === 3 ? 255 : (i * 37) % 256))
    const gif = GIFEncoder()
    for (let f = 0; f < 2; f++) {
      const palette = quantize(rgba, 16)
      gif.writeFrame(applyPalette(rgba, palette), w, h, { palette, delay: 100, repeat: f === 0 ? 0 : undefined })
    }
    gif.finish()
    const bytes = gif.bytes()
    expect(String.fromCharCode(...bytes.slice(0, 6))).toBe('GIF89a')
    expect(bytes[bytes.length - 1]).toBe(0x3b)
    // NETSCAPE2.0 application extension = loop forever.
    expect(String.fromCharCode(...bytes).includes('NETSCAPE2.0')).toBe(true)
  })

  test('the shared encoder (worker and fallback) writes frames in play order', () => {
    const frame = (v: number) => ({ data: new Uint8ClampedArray(4 * 4 * 4).map((_, i) => (i % 4 === 3 ? 255 : v)), width: 4, height: 4 })
    const bytes = encodeGifBytes([frame(10), frame(200)], [0, 1, 0], 80)
    expect(String.fromCharCode(...bytes.slice(0, 6))).toBe('GIF89a')
    expect(bytes[bytes.length - 1]).toBe(0x3b)
    // One graphic control extension (0x21 0xF9) per written frame.
    const frames = bytes.reduce((n, b, i) => (b === 0x21 && bytes[i + 1] === 0xf9 ? n + 1 : n), 0)
    expect(frames).toBe(3)
  })
})
