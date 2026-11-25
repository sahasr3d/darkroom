import { FONT, osdText } from '../../engine/draw2d'
import { cameraFor, curvatureFor, GUIDE_BANDS, GUIDE_MARKS, pathPoint, project, sampleTrack, TRACK_HALF_WIDTH_M, type ScreenPoint } from '../../engine/guides'
import { pick, randInt } from '../../engine/rng'
import { bool, num, str, type CameraBody, type Params } from '../types'

const defaults: Params = {
  intensity: 90,
  steering: 18,
  fisheye: 70,
  chroma: 55,
  scanlines: 45,
  static: 30,
  system: 'NTSC',
  guides: true,
  warning: true,
}

function strokePath(ctx: CanvasRenderingContext2D, pts: ScreenPoint[]): void {
  ctx.beginPath()
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
  ctx.stroke()
}

/** Outlined guideline: dark halo first, colour on top — how OEM overlays stay legible on bright asphalt. */
function guideStroke(ctx: CanvasRenderingContext2D, pts: ScreenPoint[], color: string, width: number): void {
  ctx.strokeStyle = 'rgba(0,0,0,0.55)'
  ctx.lineWidth = width + Math.max(2, width * 0.6)
  strokePath(ctx, pts)
  ctx.strokeStyle = color
  ctx.lineWidth = width
  strokePath(ctx, pts)
}

function drawGuides(ctx: CanvasRenderingContext2D, steering: number, w: number, h: number, ox: number, oy: number): void {
  const cam = cameraFor(w, h)
  cam.cx += ox
  cam.cy += oy
  const k = curvatureFor(steering)
  const base = h / 1000
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  for (const band of GUIDE_BANDS) {
    for (const side of [-1, 1]) {
      const pts = sampleTrack(cam, k, side * TRACK_HALF_WIDTH_M, band.from, band.to)
      const width = Math.max(1.5, (9 - band.from * 2.6) * base)
      guideStroke(ctx, pts, band.color, width)
    }
  }

  for (const mark of GUIDE_MARKS) {
    const l = project(cam, pathPoint(k, -TRACK_HALF_WIDTH_M, mark.at))
    const r = project(cam, pathPoint(k, TRACK_HALF_WIDTH_M, mark.at))
    if (!l || !r) continue
    const width = Math.max(1.5, (8 - mark.at * 2.2) * base)
    const tick = (r.x - l.x) * 0.2
    const pts = [l, { ...l, x: l.x + tick }]
    const pts2 = [{ ...r, x: r.x - tick }, r]
    guideStroke(ctx, pts, mark.color, width)
    guideStroke(ctx, pts2, mark.color, width)
    osdText(ctx, mark.label, r.x + 14 * base, r.y + 9 * base, { size: Math.max(9, 26 * base * (1.25 - mark.at * 0.18)), color: mark.color, stroke: Math.max(1, base) })
  }
  ctx.restore()
}

function cautionIcon(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(x + size / 2, y)
  ctx.lineTo(x + size, y + size * 0.9)
  ctx.lineTo(x, y + size * 0.9)
  ctx.closePath()
  ctx.fillStyle = '#FFC400'
  ctx.fill()
  ctx.fillStyle = '#000'
  ctx.font = `bold ${Math.round(size * 0.62)}px ${FONT.ui}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText('!', x + size / 2, y + size * 0.82)
  ctx.restore()
}

function drawWarning(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  const base = h / 1000
  const barH = 74 * base
  ctx.save()
  ctx.fillStyle = 'rgba(0,0,0,0.62)'
  ctx.fillRect(x, y, w, barH)
  const icon = barH * 0.6
  const text = 'CHECK SURROUNDINGS FOR SAFETY'
  ctx.font = `${Math.round(barH * 0.42)}px ${FONT.osd}`
  const tw = ctx.measureText(text).width
  const total = icon + barH * 0.3 + tw
  const sx = x + (w - total) / 2
  cautionIcon(ctx, sx, y + (barH - icon * 0.9) / 2, icon)
  ctx.fillStyle = '#F4F4F0'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, sx + icon + barH * 0.3, y + barH / 2 + base * 2)
  ctx.restore()
}

export const reverseCam: CameraBody = {
  id: 'reverse-cam',
  badge: 'Reverse Cam',
  tagline: '170° OEM backup camera with live trajectory lines',
  category: 'auto',
  format: 'NTSC CCD 1/4in',
  aspect: () => 4 / 3,
  frame: () => ({ kind: 'none' }),
  dateStamp: false,
  accessories: ['manual'],
  sampleScene: 'street',
  shutter: 'digital',
  defaults,
  groups: [
    {
      title: 'Trajectory',
      controls: [
        { kind: 'range', key: 'steering', label: 'Steering wheel angle', min: -35, max: 35, step: 1, unit: '°', detent: 0 },
        { kind: 'toggle', key: 'guides', label: 'Parking guidelines' },
        { kind: 'toggle', key: 'warning', label: 'Safety warning bar' },
      ],
    },
    {
      title: 'Signal',
      controls: [
        { kind: 'range', key: 'fisheye', label: 'Fisheye (170°)', min: 0, max: 100, step: 1 },
        { kind: 'range', key: 'chroma', label: 'Chroma bleed', min: 0, max: 100, step: 1 },
        { kind: 'range', key: 'scanlines', label: 'Scanlines', min: 0, max: 100, step: 1 },
        { kind: 'range', key: 'static', label: 'Static interference', min: 0, max: 100, step: 1 },
        { kind: 'select', key: 'system', label: 'Video system', options: [ { value: 'NTSC', label: 'NTSC 480i' }, { value: 'PAL', label: 'PAL 576i' } ] },
      ],
    },
  ],

  randomize: (p, rng) => ({
    ...p,
    steering: randInt(rng, -30, 30),
    fisheye: randInt(rng, 50, 90),
    chroma: randInt(rng, 30, 80),
    scanlines: randInt(rng, 20, 65),
    static: randInt(rng, 10, 55),
    system: pick(rng, ['NTSC', 'PAL']),
  }),

  look: (p) => {
    const pal = str(p, 'system') === 'PAL'
    return {
      fisheye: 0.35 + (num(p, 'fisheye') / 100) * 0.65,
      chromaBlur: (num(p, 'chroma') / 100) * (pal ? 0.8 : 1.0),
      scanlines: (num(p, 'scanlines') / 100) * 0.9,
      scanCount: pal ? 576 : 480,
      staticNoise: (num(p, 'static') / 100) * 0.7,
      ca: 0.6,
      exposure: 0.12,
      contrast: 1.02,
      saturation: pal ? 0.82 : 0.74,
      lift: 0.06,
      gain: pal ? [1.0, 1.0, 1.02] : [0.97, 1.02, 1.05],
      isoNoise: 0.22,
      vignette: 0.32,
    }
  },

  animated: (p) => num(p, 'static') > 0,

  overlay: (ctx, p, info) => {
    const img = info.layout.image
    if (bool(p, 'guides')) drawGuides(ctx, num(p, 'steering'), img.w, img.h, img.x, img.y)
    if (bool(p, 'warning')) drawWarning(ctx, img.x, img.y, img.w, img.h)
  },
}
