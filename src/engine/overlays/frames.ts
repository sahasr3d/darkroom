import type { CompositeInfo, PaperPattern, Rect, SlideMount } from '../../cameras/types'
import { drawPaper, FONT } from '../draw2d'
import { createRng } from '../rng'

/**
 * Physical frame renderers for the 2D compositor. Geometry follows the real formats:
 * 135 film is 35mm tall with KS perforations 2.79 × 1.98mm on a 4.75mm pitch, sitting in the
 * 5.5mm band outside the 24mm image; slide mounts are 50mm squares with a 36 × 24mm window.
 */

const EDGE_ORANGE = 'rgba(236,150,58,0.88)'

// ---------------------------------------------------------------------------
// Instant paper editions

export function drawPaperPattern(ctx: CanvasRenderingContext2D, w: number, h: number, pattern: PaperPattern, unit: number): void {
  if (pattern === 'none') return
  ctx.save()
  if (pattern === 'stripes') {
    const colors = ['#F6C9C4', '#F8E7A8', '#BFE3CF', '#BFD5F2']
    const band = 46 * unit
    ctx.translate(w / 2, h / 2)
    ctx.rotate(-Math.PI / 4)
    const span = Math.hypot(w, h)
    for (let i = -Math.ceil(span / band); i < span / band; i++) {
      ctx.fillStyle = colors[((i % 4) + 4) % 4]
      ctx.fillRect(i * band, -span, band, span * 2)
    }
  } else if (pattern === 'dots') {
    ctx.fillStyle = '#BFE6D6'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#FFFDF6'
    const step = 52 * unit
    for (let y = step / 2, row = 0; y < h; y += step * 0.866, row++) {
      for (let x = row % 2 ? step : step / 2; x < w; x += step) {
        ctx.beginPath()
        ctx.arc(x, y, 9 * unit, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  } else if (pattern === 'grid') {
    ctx.fillStyle = '#F7F6F1'
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = 'rgba(70,120,190,0.28)'
    ctx.lineWidth = Math.max(1, 1.2 * unit)
    const step = 30 * unit
    ctx.beginPath()
    for (let x = 0; x < w; x += step) {
      ctx.moveTo(x, 0)
      ctx.lineTo(x, h)
    }
    for (let y = 0; y < h; y += step) {
      ctx.moveTo(0, y)
      ctx.lineTo(w, y)
    }
    ctx.stroke()
  } else {
    const g = ctx.createLinearGradient(0, 0, w, h)
    g.addColorStop(0, '#F9B8C6')
    g.addColorStop(0.45, '#FBC98E')
    g.addColorStop(1, '#B9A4E6')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
  }
  ctx.restore()
}

// ---------------------------------------------------------------------------
// Film gate corners (half-frame, slides)

/** Mask an image rect's corners with `color` so it reads as a rounded gate/window. */
export function roundCorners(ctx: CanvasRenderingContext2D, r: Rect, radius: number, color: string): void {
  ctx.save()
  ctx.beginPath()
  ctx.rect(r.x - 1, r.y - 1, r.w + 2, r.h + 2)
  ctx.roundRect(r.x, r.y, r.w, r.h, radius)
  ctx.fillStyle = color
  ctx.fill('evenodd')
  ctx.restore()
}

function edgeText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, align: CanvasTextAlign = 'left'): void {
  ctx.save()
  ctx.font = `${Math.round(size)}px ${FONT.osd}`
  ctx.fillStyle = EDGE_ORANGE
  ctx.textAlign = align
  ctx.textBaseline = 'middle'
  ctx.shadowColor = 'rgba(255,140,40,0.5)'
  ctx.shadowBlur = size * 0.3
  ctx.fillText(text, x, y)
  ctx.restore()
}

// ---------------------------------------------------------------------------
// Half-frame strip

export function drawHalfFrameForeground(ctx: CanvasRenderingContext2D, info: CompositeInfo, label: string): void {
  const { layout, unit } = info
  layout.slots.forEach((s, i) => {
    roundCorners(ctx, s.rect, 10 * unit, '#0d0b09')
    const frameNo = `${label}${i === 0 ? '' : 'A'}`
    edgeText(ctx, `▸ ${frameNo}`, s.rect.x + s.rect.w / 2, s.rect.y + s.rect.h + (layout.canvasH - s.rect.y - s.rect.h) / 2, 30 * unit, 'center')
  })
}

// ---------------------------------------------------------------------------
// 135 panoramic across the sprockets

export function sprocketHoles(r: Rect): Rect[] {
  const H = r.h
  const hw = 0.0798 * H
  const hh = 0.0566 * H
  const pitch = 0.1357 * H
  const top = r.y + 0.054 * H
  const bottom = r.y + H - 0.054 * H - hh
  const holes: Rect[] = []
  const start = r.x + ((r.w % pitch) / 2 || pitch / 4)
  for (let x = start; x + hw <= r.x + r.w; x += pitch) {
    holes.push({ x, y: top, w: hw, h: hh }, { x, y: bottom, w: hw, h: hh })
  }
  return holes
}

export function drawSprocketForeground(ctx: CanvasRenderingContext2D, info: CompositeInfo, holes: boolean, text: string): void {
  const r = info.layout.image
  const H = r.h
  if (holes) {
    ctx.save()
    for (const hole of sprocketHoles(r)) {
      ctx.beginPath()
      ctx.roundRect(hole.x, hole.y, hole.w, hole.h, 0.012 * H)
      ctx.fillStyle = 'rgba(246,241,229,0.96)'
      ctx.shadowColor = 'rgba(0,0,0,0.65)'
      ctx.shadowBlur = 0.006 * H
      ctx.fill()
    }
    ctx.restore()
  }
  if (text) {
    const size = 0.034 * H
    const pitch = 0.1357 * H * 5
    for (let x = r.x + pitch * 0.35, n = 0; x < r.x + r.w - size * 6; x += pitch, n++) {
      edgeText(ctx, n % 2 ? `${text}` : `◂ ${Math.max(1, 14 + n)}A`, x, r.y + 0.026 * H, size)
    }
  }
}

// ---------------------------------------------------------------------------
// Slide mounts

export const SLIDE_MARGINS = { l: 0.2917, r: 0.2917, t: 0.5417, b: 0.5417 }

export function drawSlideBackground(ctx: CanvasRenderingContext2D, info: CompositeInfo, mount: SlideMount): void {
  const { canvasW: w, canvasH: h } = info.layout
  if (mount === 'card') {
    drawPaper(ctx, w, h, '#E6DECB', info.unit, 0.5)
    return
  }
  ctx.save()
  const g = ctx.createLinearGradient(0, 0, w, h)
  g.addColorStop(0, '#34363B')
  g.addColorStop(1, '#202226')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  // Moulded ribs along the edges.
  ctx.strokeStyle = 'rgba(255,255,255,0.05)'
  ctx.lineWidth = Math.max(1, 3 * info.unit)
  for (let i = 1; i <= 4; i++) {
    const inset = i * 14 * info.unit
    ctx.strokeRect(inset, inset, w - inset * 2, h - inset * 2)
  }
  ctx.restore()
}

export function drawSlideForeground(ctx: CanvasRenderingContext2D, info: CompositeInfo, mount: SlideMount, label: string): void {
  const { layout, unit } = info
  const img = layout.image
  const card = mount === 'card'
  roundCorners(ctx, img, 16 * unit, card ? '#E6DECB' : '#2A2C31')
  ctx.save()
  ctx.lineWidth = Math.max(1, 5 * unit)
  ctx.strokeStyle = card ? 'rgba(80,64,40,0.35)' : 'rgba(0,0,0,0.6)'
  ctx.beginPath()
  ctx.roundRect(img.x - 2 * unit, img.y - 2 * unit, img.w + 4 * unit, img.h + 4 * unit, 18 * unit)
  ctx.stroke()
  ctx.strokeStyle = card ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.12)'
  ctx.lineWidth = Math.max(1, 2 * unit)
  ctx.beginPath()
  ctx.roundRect(img.x - 7 * unit, img.y - 7 * unit, img.w + 14 * unit, img.h + 14 * unit, 22 * unit)
  ctx.stroke()

  ctx.fillStyle = card ? 'rgba(52,42,30,0.78)' : 'rgba(235,235,230,0.8)'
  ctx.font = `${Math.round(30 * unit)}px ${FONT.ui}`
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  ctx.fillText(label, layout.canvasW / 2, img.y / 2)
  ctx.font = `${Math.round(24 * unit)}px ${FONT.ui}`
  ctx.fillText(card ? 'Processed transparency' : 'Mounted slide', layout.canvasW / 2, img.y + img.h + (layout.canvasH - img.y - img.h) / 2)
  ctx.restore()
}

// ---------------------------------------------------------------------------
// Medium-format negative carrier (filed-out gate)

export function drawNegativeForeground(ctx: CanvasRenderingContext2D, info: CompositeInfo, seed: number): void {
  const r = info.layout.image
  const rng = createRng(seed ^ 0x51ed)
  const depth = Math.min(r.w, r.h) * 0.018
  const steps = 60
  const jag = () => rng() * depth
  const pts: [number, number][] = []
  for (let i = 0; i <= steps; i++) pts.push([r.x + (r.w * i) / steps, r.y + jag()])
  for (let i = 0; i <= steps; i++) pts.push([r.x + r.w - jag(), r.y + (r.h * i) / steps])
  for (let i = steps; i >= 0; i--) pts.push([r.x + (r.w * i) / steps, r.y + r.h - jag()])
  for (let i = steps; i >= 0; i--) pts.push([r.x + jag(), r.y + (r.h * i) / steps])
  ctx.save()
  ctx.beginPath()
  ctx.rect(r.x - 2, r.y - 2, r.w + 4, r.h + 4)
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)))
  ctx.closePath()
  ctx.fillStyle = '#060605'
  ctx.fill('evenodd')
  ctx.restore()
}
