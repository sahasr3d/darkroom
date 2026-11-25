/**
 * Quartz-date-back imprint: vector seven-segment digits with the slight italic slant and
 * orange/red bloom of a 90s compact. Drawn as geometry so it stays crisp at any export size.
 */

export type LedColor = 'orange' | 'red'
export type LedFormat = 'ymd' | 'mdy' | 'dmy'

export const LED_COLORS: Record<LedColor, { core: string; glow: string }> = {
  orange: { core: '#FFB35C', glow: 'rgba(255,122,24,0.9)' },
  red: { core: '#FF6A4D', glow: 'rgba(255,40,24,0.9)' },
}

//           a  b  c  d  e  f  g
const SEGMENTS: Record<string, readonly number[]> = {
  '0': [1, 1, 1, 1, 1, 1, 0],
  '1': [0, 1, 1, 0, 0, 0, 0],
  '2': [1, 1, 0, 1, 1, 0, 1],
  '3': [1, 1, 1, 1, 0, 0, 1],
  '4': [0, 1, 1, 0, 0, 1, 1],
  '5': [1, 0, 1, 1, 0, 1, 1],
  '6': [1, 0, 1, 1, 1, 1, 1],
  '7': [1, 1, 1, 0, 0, 0, 0],
  '8': [1, 1, 1, 1, 1, 1, 1],
  '9': [1, 1, 1, 1, 0, 1, 1],
  '-': [0, 0, 0, 0, 0, 0, 1],
}

export const segmentsFor = (ch: string): readonly number[] | undefined => SEGMENTS[ch]

/** Characters the imprint can show; everything else is rejected by the UI. */
export const LED_ALLOWED = /^[0-9 '\-.:]*$/

const pad = (n: number): string => String(n).padStart(2, '0')

export function formatLedDate(d: Date, format: LedFormat): string {
  const yy = `'${pad(d.getFullYear() % 100)}`
  const mm = pad(d.getMonth() + 1)
  const dd = pad(d.getDate())
  if (format === 'mdy') return `${mm} ${dd} ${yy}`
  if (format === 'dmy') return `${dd} ${mm} ${yy}`
  return `${yy} ${mm} ${dd}`
}

export function validateLedText(value: string): string | null {
  if (!LED_ALLOWED.test(value)) return "Digits, spaces, - . : and ' only"
  if (value.trim().length === 0) return 'Enter a date'
  return null
}

type Poly = [number, number][]

/** Segment polygons for one digit cell of width w, height h (origin top-left). */
function segmentPolys(w: number, h: number, t: number): Poly[] {
  const half = h / 2
  const g = t * 0.18
  const hz = (y: number): Poly => [
    [g + t / 2, y],
    [g + t, y - t / 2],
    [w - g - t, y - t / 2],
    [w - g - t / 2, y],
    [w - g - t, y + t / 2],
    [g + t, y + t / 2],
  ]
  const vt = (x: number, y0: number, y1: number): Poly => [
    [x, y0 + g + t / 2],
    [x + t / 2, y0 + g + t],
    [x + t / 2, y1 - g - t],
    [x, y1 - g - t / 2],
    [x - t / 2, y1 - g - t],
    [x - t / 2, y0 + g + t],
  ]
  return [hz(t / 2), vt(w - t / 2, 0, half), vt(w - t / 2, half, h), hz(h - t / 2), vt(t / 2, half, h), vt(t / 2, 0, half), hz(half)]
}

const metrics = (size: number) => ({ w: size * 0.56, t: size * 0.13, gap: size * 0.2 })

export function measureLed(text: string, size: number): number {
  const { w, t, gap } = metrics(size)
  let total = 0
  for (const ch of text) {
    if (ch === ' ') total += w * 0.55
    else if (ch === "'" || ch === '.' || ch === ':') total += t + gap * 0.6
    else total += w + gap
  }
  return total
}

function tracePolys(ctx: CanvasRenderingContext2D, text: string, size: number): void {
  const { w, t, gap } = metrics(size)
  const polys = segmentPolys(w, size, t)
  let cx = 0
  ctx.beginPath()
  for (const ch of text) {
    if (ch === ' ') {
      cx += w * 0.55
      continue
    }
    if (ch === "'") {
      ctx.rect(cx, 0, t, size * 0.28)
      cx += t + gap * 0.6
      continue
    }
    if (ch === '.' || ch === ':') {
      ctx.rect(cx, size - t, t, t)
      if (ch === ':') ctx.rect(cx, size * 0.3, t, t)
      cx += t + gap * 0.6
      continue
    }
    const on = SEGMENTS[ch] ?? SEGMENTS['-']
    polys.forEach((poly, i) => {
      if (!on[i]) return
      poly.forEach(([px, py], j) => (j === 0 ? ctx.moveTo(cx + px, py) : ctx.lineTo(cx + px, py)))
      ctx.closePath()
    })
    cx += w + gap
  }
}

/** Draw a glowing imprint whose right edge sits at `right` and bottom at `bottom`. */
export function drawLedDate(ctx: CanvasRenderingContext2D, text: string, right: number, bottom: number, size: number, color: LedColor): void {
  const c = LED_COLORS[color]
  ctx.save()
  ctx.translate(right - measureLed(text, size), bottom - size)
  ctx.transform(1, 0, -0.1, 1, size * 0.1, 0)
  ctx.globalCompositeOperation = 'screen'
  ctx.shadowColor = c.glow
  ctx.shadowBlur = size * 0.45
  ctx.fillStyle = c.glow
  tracePolys(ctx, text, size)
  ctx.fill()
  ctx.shadowBlur = size * 0.12
  ctx.fillStyle = c.core
  tracePolys(ctx, text, size)
  ctx.fill()
  ctx.restore()
}
