import type { DustField } from './dust'
import { createRng } from './rng'
import type { Rect } from '../cameras/types'

export const FONT = {
  ui: "'JetBrains Mono', ui-monospace, monospace",
  badge: "'Space Mono', ui-monospace, monospace",
  osd: "'Share Tech Mono', ui-monospace, monospace",
  cursive: "'Caveat', cursive",
  marker: "'Permanent Marker', cursive",
} as const

let paperTile: HTMLCanvasElement | null = null

/** 384px grayscale tile: fine fibre noise + a few long fibres. Generated once, reused as a pattern. */
function getPaperTile(): HTMLCanvasElement {
  if (paperTile) return paperTile
  const size = 384
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('2D canvas unavailable')
  const img = ctx.createImageData(size, size)
  const rng = createRng(0x5eed)
  for (let i = 0; i < size * size; i++) {
    const v = 128 + (rng() - 0.5) * 46 + (rng() - 0.5) * 18
    img.data[i * 4] = v
    img.data[i * 4 + 1] = v
    img.data[i * 4 + 2] = v
    img.data[i * 4 + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  ctx.lineCap = 'round'
  for (let i = 0; i < 90; i++) {
    const x = rng() * size
    const y = rng() * size
    const a = rng() * Math.PI
    const len = 6 + rng() * 22
    ctx.strokeStyle = rng() > 0.5 ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.16)'
    ctx.lineWidth = 0.6 + rng() * 0.6
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.quadraticCurveTo(x + Math.cos(a + 0.4) * len * 0.5, y + Math.sin(a + 0.4) * len * 0.5, x + Math.cos(a) * len, y + Math.sin(a) * len)
    ctx.stroke()
  }
  paperTile = c
  return c
}

/** Solid paper stock with a scale-aware grain overlay (soft-light keeps the stock hue). */
export function drawPaper(ctx: CanvasRenderingContext2D, w: number, h: number, color: string, unit: number, strength: number): void {
  ctx.save()
  ctx.fillStyle = color
  ctx.fillRect(0, 0, w, h)
  const pattern = ctx.createPattern(getPaperTile(), 'repeat')
  if (pattern) {
    pattern.setTransform(new DOMMatrix().scale(Math.max(0.35, unit * 0.9)))
    ctx.globalCompositeOperation = 'soft-light'
    ctx.globalAlpha = strength
    ctx.fillStyle = pattern
    ctx.fillRect(0, 0, w, h)
  }
  ctx.restore()
}

/** Recessed cut-out: a crisp 2-unit dark lip plus a soft inner shadow falling onto the photo. */
export function drawInsetShadow(ctx: CanvasRenderingContext2D, r: Rect, unit: number, darkStock: boolean): void {
  const lip = Math.max(1, 2 * unit)
  ctx.save()
  ctx.beginPath()
  ctx.rect(r.x, r.y, r.w, r.h)
  ctx.clip()
  ctx.shadowColor = 'rgba(0,0,0,0.55)'
  ctx.shadowBlur = 9 * unit
  ctx.shadowOffsetX = 1.5 * unit
  ctx.shadowOffsetY = 3 * unit
  ctx.lineWidth = 40 * unit
  ctx.strokeStyle = 'rgba(0,0,0,1)'
  ctx.strokeRect(r.x - 20 * unit, r.y - 20 * unit, r.w + 40 * unit, r.h + 40 * unit)
  ctx.restore()

  ctx.save()
  ctx.lineWidth = lip
  ctx.strokeStyle = darkStock ? 'rgba(0,0,0,0.85)' : 'rgba(40,32,20,0.45)'
  ctx.strokeRect(r.x + lip / 2, r.y + lip / 2, r.w - lip, r.h - lip)
  ctx.strokeStyle = darkStock ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.55)'
  ctx.lineWidth = Math.max(1, unit)
  ctx.strokeRect(r.x - lip / 2, r.y - lip / 2, r.w + lip, r.h + lip)
  ctx.restore()
}

export function drawDust(ctx: CanvasRenderingContext2D, field: DustField, r: Rect, unit: number, amount: number): void {
  if (amount <= 0) return
  ctx.save()
  ctx.beginPath()
  ctx.rect(r.x, r.y, r.w, r.h)
  ctx.clip()

  for (const s of field.scratches) {
    ctx.strokeStyle = `rgba(250,246,236,${s.alpha * amount})`
    ctx.lineWidth = Math.max(0.6, s.width * unit)
    ctx.beginPath()
    const steps = 40
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      const y = s.y0 + (s.y1 - s.y0) * t
      const x = s.x + Math.sin(t * 9 + s.phase) * s.wobble
      if (i === 0) ctx.moveTo(r.x + x * r.w, r.y + y * r.h)
      else ctx.lineTo(r.x + x * r.w, r.y + y * r.h)
    }
    ctx.stroke()
  }

  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const h of field.hairs) {
    ctx.strokeStyle = h.light ? `rgba(245,240,228,${h.alpha * amount})` : `rgba(18,14,10,${h.alpha * amount})`
    ctx.lineWidth = Math.max(0.5, h.width * unit)
    ctx.beginPath()
    h.points.forEach(([x, y], i) => {
      if (i === 0) ctx.moveTo(r.x + x * r.w, r.y + y * r.h)
      else ctx.lineTo(r.x + x * r.w, r.y + y * r.h)
    })
    ctx.stroke()
  }

  for (const s of field.specks) {
    ctx.fillStyle = s.light ? `rgba(248,244,232,${s.alpha * amount})` : `rgba(14,10,8,${s.alpha * amount})`
    ctx.beginPath()
    ctx.ellipse(r.x + s.x * r.w, r.y + s.y * r.h, Math.max(0.5, s.r * unit), Math.max(0.5, s.r * unit * 0.75), s.x * 6, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

export interface OsdTextOptions {
  size: number
  align?: CanvasTextAlign
  baseline?: CanvasTextBaseline
  color?: string
  stroke?: number
  font?: string
}

/** Camera OSD text: crisp fill over a black outline stroke (outline width in device px). */
export function osdText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, o: OsdTextOptions): number {
  ctx.save()
  ctx.font = `${Math.round(o.size)}px ${o.font ?? FONT.osd}`
  ctx.textAlign = o.align ?? 'left'
  ctx.textBaseline = o.baseline ?? 'alphabetic'
  ctx.lineJoin = 'round'
  ctx.miterLimit = 2
  const stroke = o.stroke ?? Math.max(1, o.size / 22)
  ctx.lineWidth = stroke * 2
  ctx.strokeStyle = '#000'
  ctx.strokeText(text, x, y)
  ctx.fillStyle = o.color ?? '#fff'
  ctx.fillText(text, x, y)
  const width = ctx.measureText(text).width
  ctx.restore()
  return width
}
