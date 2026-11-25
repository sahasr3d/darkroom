import type { CompositeInfo } from '../../cameras/types'
import { FONT } from '../draw2d'
import { roundCorners } from './frames'

/**
 * Cine gate and camcorder on-screen displays for the video bodies. Everything is sized in
 * `info.unit` and timed from `info.elapsed` (recording clock) or `info.time` (preview clock).
 */

/** Perforation strip down the left edge: dark film base with one bright hole per frame. */
export function drawPerforations(ctx: CanvasRenderingContext2D, info: CompositeInfo): void {
  const r = info.layout.image
  const H = r.h
  const stripW = 0.085 * H
  const holeW = 0.042 * H
  const holeH = 0.075 * H
  // The film is pulled down once per frame; a tiny drift keeps the strip alive between frames.
  const frame = Math.floor((info.elapsed ?? info.time) * 18)
  const drift = ((frame * 37) % 7) * 0.002 * H
  ctx.save()
  ctx.fillStyle = 'rgba(10,8,6,0.92)'
  ctx.fillRect(r.x, r.y, stripW, r.h)
  ctx.fillStyle = 'rgba(246,238,220,0.95)'
  for (const cy of [0, 0.5, 1]) {
    ctx.beginPath()
    ctx.roundRect(r.x + (stripW - holeW) / 2, r.y + cy * H - holeH / 2 + drift, holeW, holeH, 0.012 * H)
    ctx.fill()
  }
  ctx.restore()
}

export function drawGateForeground(ctx: CanvasRenderingContext2D, info: CompositeInfo, rounded: boolean, perforations: boolean, maskColor: string): void {
  if (perforations) drawPerforations(ctx, info)
  if (rounded) roundCorners(ctx, info.layout.image, Math.min(info.layout.image.w, info.layout.image.h) * 0.07, maskColor)
}

// ---------------------------------------------------------------------------
// Camcorder OSD

function osd(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, opts: { align?: CanvasTextAlign; color?: string } = {}): void {
  ctx.save()
  ctx.font = `${Math.round(size)}px ${FONT.osd}`
  ctx.textAlign = opts.align ?? 'left'
  ctx.textBaseline = 'alphabetic'
  // VHS-era character generators drew white text with a hard black drop shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.85)'
  ctx.fillText(text, x + size * 0.07, y + size * 0.07)
  ctx.fillStyle = opts.color ?? '#F4F4EE'
  ctx.fillText(text, x, y)
  ctx.restore()
}

const pad2 = (n: number) => String(Math.floor(n)).padStart(2, '0')

/** h:mm:ss tape counter. */
export function formatCounter(seconds: number): string {
  const s = Math.max(0, seconds)
  return `${Math.floor(s / 3600)}:${pad2((s / 60) % 60)}:${pad2(s % 60)}`
}

/** h:mm:ss:ff SMPTE-style timecode at `fps`. */
export function formatTimecode(seconds: number, fps: number): string {
  const s = Math.max(0, seconds)
  return `${formatCounter(s)}:${pad2((s * fps) % fps)}`
}

export interface OsdText {
  date: string
  time: string
}

/** VHS camcorder: PLAY/REC, tape speed, counter, date and time. */
export function drawVhsOsd(ctx: CanvasRenderingContext2D, info: CompositeInfo, text: OsdText): void {
  const r = info.layout.image
  const s = 52 * info.unit
  const m = 46 * info.unit
  const recording = info.elapsed !== null
  osd(ctx, recording ? 'REC ●' : 'PLAY ▶', r.x + m, r.y + m + s, s, { color: recording ? '#FF4A3D' : undefined })
  osd(ctx, 'SP', r.x + m, r.y + m + s * 2.1, s * 0.8)
  if (recording) osd(ctx, formatCounter(info.elapsed ?? 0), r.x + r.w - m, r.y + m + s, s, { align: 'right' })
  osd(ctx, text.time, r.x + m, r.y + r.h - m - s * 1.1, s)
  osd(ctx, text.date, r.x + m, r.y + r.h - m, s)
}

/** MiniDV camcorder: REC/STBY, frame-accurate timecode, battery, aspect tag, date stamp. */
export function drawDcrOsd(ctx: CanvasRenderingContext2D, info: CompositeInfo, text: OsdText, fps: number): void {
  const r = info.layout.image
  const s = 40 * info.unit
  const m = 40 * info.unit
  const recording = info.elapsed !== null
  const blinkOn = info.forExport || Math.floor((info.elapsed ?? info.time) * 2) % 2 === 0
  osd(ctx, recording ? (blinkOn ? '● REC' : '  REC') : 'STBY', r.x + m, r.y + m + s, s, { color: recording ? '#FF3B2F' : undefined })
  osd(ctx, formatTimecode(info.elapsed ?? 0, fps), r.x + r.w - m, r.y + m + s, s, { align: 'right' })
  ctx.save()
  const bx = r.x + m
  const by = r.y + r.h - m - s * 2.3
  ctx.strokeStyle = '#F4F4EE'
  ctx.lineWidth = Math.max(1, 3 * info.unit)
  ctx.strokeRect(bx, by, s * 1.6, s * 0.75)
  ctx.fillStyle = '#F4F4EE'
  ctx.fillRect(bx + s * 1.6, by + s * 0.22, s * 0.15, s * 0.3)
  ctx.fillRect(bx + s * 0.12, by + s * 0.12, s * 0.9, s * 0.51)
  ctx.restore()
  osd(ctx, '60min', bx + s * 2, by + s * 0.68, s * 0.8)
  osd(ctx, 'SP  16:9', r.x + m, r.y + r.h - m, s * 0.8)
  osd(ctx, text.date, r.x + r.w - m, r.y + r.h - m - s * 1.15, s, { align: 'right' })
  osd(ctx, text.time, r.x + r.w - m, r.y + r.h - m, s, { align: 'right' })
}

/** 90s consumer camcorder: just the burned-in date and time, bottom right. */
export function drawDateOsd(ctx: CanvasRenderingContext2D, info: CompositeInfo, text: OsdText): void {
  const r = info.layout.image
  const s = 50 * info.unit
  const m = 50 * info.unit
  if (info.elapsed !== null) osd(ctx, 'REC', r.x + m, r.y + m + s, s, { color: '#FF4A3D' })
  osd(ctx, text.date, r.x + r.w - m, r.y + r.h - m - s * 1.15, s, { align: 'right' })
  osd(ctx, text.time, r.x + r.w - m, r.y + r.h - m, s, { align: 'right' })
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

/** Camcorder-style date and time strings for a moment, e.g. "NOV.25 1996" and "7:42 PM". */
export function camcorderStamp(d: Date): OsdText {
  const h = d.getHours()
  return { date: `${MONTHS[d.getMonth()]}.${pad2(d.getDate())} ${d.getFullYear()}`, time: `${h % 12 || 12}:${pad2(d.getMinutes())} ${h < 12 ? 'AM' : 'PM'}` }
}
