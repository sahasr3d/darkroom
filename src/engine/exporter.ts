import { FONT } from './draw2d'
import type { Pipeline, Shot } from './pipeline'

export const STORY_W = 1080
export const STORY_H = 1920

export interface ExportResult {
  blob: Blob
  width: number
  height: number
  filename: string
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('The browser could not encode this PNG. Try a smaller image.'))), 'image/png')
  })
}

/** Zero-size a big scratch canvas so Safari/iOS hand its backing store back immediately. */
function release(canvas: HTMLCanvasElement): void {
  canvas.width = 0
  canvas.height = 0
}

function stamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

/** Native-resolution render of the current look. */
export function renderFull(pipeline: Pipeline, shot: Shot): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  const layout = pipeline.exportLayout(shot)
  pipeline.render(canvas, shot, layout, { time: 0, forExport: true })
  return canvas
}

const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

/** Dual saving: the untouched source at its native resolution (mirrored as it was framed). */
export async function exportOriginal(shot: Shot): Promise<ExportResult> {
  const { source } = shot
  const canvas = document.createElement('canvas')
  canvas.width = source.width
  canvas.height = source.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas unavailable')
  if (source.mirrored) {
    ctx.translate(canvas.width, 0)
    ctx.scale(-1, 1)
  }
  ctx.drawImage(source.image, 0, 0, source.width, source.height)
  const blob = await toBlob(canvas)
  release(canvas)
  return { blob, width: source.width, height: source.height, filename: `${slug(shot.body.badge)}-${stamp()}-original.png` }
}

export async function exportPng(pipeline: Pipeline, shot: Shot): Promise<ExportResult> {
  const canvas = renderFull(pipeline, shot)
  const { width, height } = canvas
  const blob = await toBlob(canvas)
  release(canvas)
  return { blob, width, height, filename: `${slug(shot.body.badge)}-${stamp()}.png` }
}

/** Cheap, portable large-radius blur: repeated half-scale downsampling, then one smooth upscale. */
function blurredCover(src: HTMLCanvasElement, w: number, h: number): HTMLCanvasElement {
  const scale = Math.max(w / src.width, h / src.height)
  const cw = src.width * scale
  const ch = src.height * scale
  let cur = document.createElement('canvas')
  cur.width = Math.max(1, Math.round(w / 2))
  cur.height = Math.max(1, Math.round(h / 2))
  let ctx = cur.getContext('2d')
  if (!ctx) throw new Error('2D canvas unavailable')
  ctx.drawImage(src, (w - cw) / 4, (h - ch) / 4, cw / 2, ch / 2)
  for (let i = 0; i < 5; i++) {
    const next = document.createElement('canvas')
    next.width = Math.max(1, Math.round(cur.width / 2))
    next.height = Math.max(1, Math.round(cur.height / 2))
    const nctx = next.getContext('2d')
    if (!nctx) throw new Error('2D canvas unavailable')
    nctx.imageSmoothingQuality = 'high'
    nctx.drawImage(cur, 0, 0, next.width, next.height)
    cur = next
    ctx = nctx
  }
  const out = document.createElement('canvas')
  out.width = w
  out.height = h
  const octx = out.getContext('2d')
  if (!octx) throw new Error('2D canvas unavailable')
  octx.imageSmoothingQuality = 'high'
  octx.filter = 'blur(24px)'
  octx.drawImage(cur, -40, -40, w + 80, h + 80)
  octx.filter = 'none'
  return out
}

export async function exportStory(pipeline: Pipeline, shot: Shot): Promise<ExportResult> {
  const full = renderFull(pipeline, shot)
  const canvas = document.createElement('canvas')
  canvas.width = STORY_W
  canvas.height = STORY_H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas unavailable')

  const backdrop = blurredCover(full, STORY_W, STORY_H)
  ctx.drawImage(backdrop, 0, 0)
  release(backdrop)
  ctx.fillStyle = 'rgba(12,12,10,0.42)'
  ctx.fillRect(0, 0, STORY_W, STORY_H)

  const margin = 84
  const maxW = STORY_W - margin * 2
  const maxH = STORY_H - 520
  const s = Math.min(maxW / full.width, maxH / full.height)
  const w = Math.round(full.width * s)
  const h = Math.round(full.height * s)
  const x = Math.round((STORY_W - w) / 2)
  const y = Math.round((STORY_H - h) / 2 - 40)
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.55)'
  ctx.shadowBlur = 60
  ctx.shadowOffsetY = 24
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(full, x, y, w, h)
  ctx.restore()
  release(full)

  ctx.fillStyle = 'rgba(245,244,238,0.92)'
  ctx.font = `700 34px ${FONT.badge}`
  ctx.textAlign = 'left'
  ctx.fillText(shot.body.badge, margin, STORY_H - 150)
  ctx.fillStyle = 'rgba(245,244,238,0.6)'
  ctx.font = `24px ${FONT.ui}`
  ctx.fillText(shot.body.format, margin, STORY_H - 108)
  ctx.textAlign = 'right'
  ctx.fillText(shot.body.tagline.split(' ').slice(0, 3).join(' '), STORY_W - margin, STORY_H - 108)

  const blob = await toBlob(canvas)
  release(canvas)
  return { blob, width: STORY_W, height: STORY_H, filename: `${slug(shot.body.badge)}-story-${stamp()}.png` }
}

export function download(result: ExportResult): void {
  const url = URL.createObjectURL(result.blob)
  const a = document.createElement('a')
  a.href = url
  a.download = result.filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}
