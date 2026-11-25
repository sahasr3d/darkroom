import { applyPalette, GIFEncoder, quantize } from 'gifenc'
import type { BurstSpec } from '../cameras/types'
import type { Pipeline, Shot, SourceImage } from './pipeline'
import { startRecording } from './recorder'

/**
 * Multi-shot motion: D3D wiggle-3D (four parallax views played back and forth) and Golf
 * sixteen-frame staccato runs. Frames are developed through the full pipeline, then encoded as a
 * looping GIF, a looping video clip, and (for Golf) a 4×4 contact sheet.
 */

/** D3D lens offsets, left to right, in parallax units. */
export const WIGGLE_VIEWS = [-1.5, -0.5, 0.5, 1.5] as const

/** Ping-pong order for a wiggle loop: 0 1 2 3 2 1 (then repeat), so motion never jumps. */
export function wiggleOrder(n: number): number[] {
  if (n <= 1) return [0]
  const forward = Array.from({ length: n }, (_, i) => i)
  const back = forward.slice(1, -1).reverse()
  return [...forward, ...back]
}

/** Playback order for a burst. */
export const playOrder = (spec: BurstSpec, frames: number): number[] => (spec.kind === 'wiggle' ? wiggleOrder(frames) : Array.from({ length: frames }, (_, i) => i))

/** Grab `spec.frames` frames: rapid live captures, or the same still repeated. */
export async function captureBurst(spec: BurstSpec, grab: (() => SourceImage | null) | null, still: SourceImage): Promise<SourceImage[]> {
  const count = spec.kind === 'wiggle' ? WIGGLE_VIEWS.length : spec.frames
  if (!grab) return Array.from({ length: count }, () => still)
  const frames: SourceImage[] = []
  for (let i = 0; i < count; i++) {
    const f = grab()
    if (f) frames.push(f)
    if (i < count - 1) await new Promise((r) => setTimeout(r, spec.intervalMs))
  }
  return frames.length ? frames : [still]
}

/**
 * Develop each frame. D3D: every view gets its own depth-parallax offset (real parallax on
 * stills, extra separation on live bursts). Golf on a still: a slow push-in fakes the run.
 */
export function developBurst(pipeline: Pipeline, shot: Shot, frames: readonly SourceImage[], spec: BurstSpec, strength: number, maxEdge: number, stillOnly: boolean): HTMLCanvasElement[] {
  return frames.map((source, i) => {
    const s: Shot = { ...shot, source }
    const layout = pipeline.previewLayout(s, maxEdge, maxEdge)
    const canvas = document.createElement('canvas')
    const lookPatch = spec.kind === 'wiggle' ? { parallax: WIGGLE_VIEWS[i % WIGGLE_VIEWS.length] * strength * 0.02 } : stillOnly ? { zoom: 1 + i * 0.012 } : undefined
    pipeline.render(canvas, s, layout, { time: i / 12, forExport: true, lookPatch })
    return canvas
  })
}

function scaled(src: HTMLCanvasElement, maxEdge: number): ImageData {
  const s = Math.min(1, maxEdge / Math.max(src.width, src.height))
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(src.width * s))
  c.height = Math.max(1, Math.round(src.height * s))
  const ctx = c.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('2D canvas unavailable')
  ctx.drawImage(src, 0, 0, c.width, c.height)
  return ctx.getImageData(0, 0, c.width, c.height)
}

/** Encode frames (in `order`) as a looping GIF; each frame gets its own 256-colour palette. */
export function encodeGif(frames: readonly HTMLCanvasElement[], order: readonly number[], delayMs: number, maxEdge = 640): Blob {
  const images = frames.map((f) => scaled(f, maxEdge))
  const gif = GIFEncoder()
  order.forEach((idx, n) => {
    const img = images[idx]
    const palette = quantize(img.data, 256)
    gif.writeFrame(applyPalette(img.data, palette), img.width, img.height, { palette, delay: delayMs, repeat: n === 0 ? 0 : undefined })
  })
  gif.finish()
  return new Blob([gif.bytes().slice()], { type: 'image/gif' })
}

/** Record the loop as a short video clip (a few passes so it plays smoothly where it won't loop). */
export async function encodeLoopVideo(frames: readonly HTMLCanvasElement[], order: readonly number[], delayMs: number, passes = 4): Promise<{ blob: Blob; mimeType: string }> {
  const canvas = document.createElement('canvas')
  canvas.width = frames[0].width
  canvas.height = frames[0].height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas unavailable')
  const fps = 1000 / delayMs
  const total = order.length * passes
  return new Promise((resolve, reject) => {
    let session: ReturnType<typeof startRecording> | null = null
    try {
      session = startRecording({
        canvas,
        fps,
        maxSeconds: (total + 2) / fps,
        drawFrame: (_t, i) => {
          ctx.drawImage(frames[order[i % order.length]], 0, 0)
          if (i >= total && session) void session.stop().then((r) => resolve({ blob: r.blob, mimeType: r.mimeType }), reject)
        },
        onAutoStop: (r) => resolve({ blob: r.blob, mimeType: r.mimeType }),
      })
    } catch (err) {
      reject(err)
    }
  })
}

/** Geometry for an n-frame contact sheet: columns, rows, gutter and border in cell units. */
export function sheetGeometry(n: number, cellW: number, cellH: number): { cols: number; rows: number; gutter: number; border: number; width: number; height: number } {
  const cols = Math.ceil(Math.sqrt(n))
  const rows = Math.ceil(n / cols)
  const gutter = Math.round(Math.min(cellW, cellH) * 0.04)
  const border = Math.round(Math.min(cellW, cellH) * 0.12)
  return { cols, rows, gutter, border, width: cols * cellW + (cols - 1) * gutter + border * 2, height: rows * cellH + (rows - 1) * gutter + border * 2 }
}

/** The Golf print: all frames in reading order on one white sheet with thin black frame lines. */
export function contactSheet(frames: readonly HTMLCanvasElement[], cellEdge = 480): HTMLCanvasElement {
  const f0 = frames[0]
  const s = cellEdge / Math.max(f0.width, f0.height)
  const cw = Math.round(f0.width * s)
  const ch = Math.round(f0.height * s)
  const g = sheetGeometry(frames.length, cw, ch)
  const sheet = document.createElement('canvas')
  sheet.width = g.width
  sheet.height = g.height
  const ctx = sheet.getContext('2d')
  if (!ctx) throw new Error('2D canvas unavailable')
  ctx.fillStyle = '#F4F1E8'
  ctx.fillRect(0, 0, g.width, g.height)
  frames.forEach((f, i) => {
    const x = g.border + (i % g.cols) * (cw + g.gutter)
    const y = g.border + Math.floor(i / g.cols) * (ch + g.gutter)
    ctx.drawImage(f, x, y, cw, ch)
    ctx.strokeStyle = '#111'
    ctx.lineWidth = Math.max(1, Math.round(g.gutter * 0.25))
    ctx.strokeRect(x, y, cw, ch)
  })
  return sheet
}
