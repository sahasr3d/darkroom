import { osdText } from '../../engine/draw2d'
import { pick, randInt, randRange } from '../../engine/rng'
import { ALL_ACCESSORIES, bool, num, str, type CameraBody, type Params } from '../types'

const TIMESTAMP_RE = /^\d{4}\/(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01]) ([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/

export function validateTimestamp(value: string): string | null {
  return TIMESTAMP_RE.test(value.trim()) ? null : 'Use YYYY/MM/DD HH:MM:SS'
}

const pad = (n: number): string => String(n).padStart(2, '0')

export function formatTimestamp(d: Date): string {
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** Decimal degrees → the hemisphere-prefixed form dash cams burn in, e.g. "N37.7749  W122.4194". */
export function formatGps(lat: number, lon: number): string {
  const ns = lat >= 0 ? 'N' : 'S'
  const ew = lon >= 0 ? 'E' : 'W'
  return `${ns}${Math.abs(lat).toFixed(4)}  ${ew}${Math.abs(lon).toFixed(4)}`
}

const defaults: Params = {
  intensity: 85,
  lens: 150,
  sharpen: 55,
  iso: 40,
  aberration: 40,
  night: false,
  resolution: '1080P',
  model: 'ROADEYE DX-9',
  timestamp: '2026/11/25 21:47:09',
  speed: 68,
  speedUnit: 'KM/H',
  gps: formatGps(37.7749, -122.4194),
}

export const dashCam: CameraBody = {
  id: 'dash-cam',
  badge: 'Dash Cam',
  tagline: '150° wide-angle DVR with burned-in telemetry',
  category: 'auto',
  format: 'CMOS 1/2.8in',
  aspect: () => 16 / 9,
  frame: () => ({ kind: 'none' }),
  dateStamp: false,
  accessories: ALL_ACCESSORIES.filter((a) => a === 'nd' || a === 'manual'),
  sampleScene: 'highway',
  shutter: 'digital',
  defaults,
  groups: [
    {
      title: 'Sensor & lens',
      controls: [
        { kind: 'range', key: 'lens', label: 'Lens angle', min: 110, max: 170, step: 1, unit: '°' },
        { kind: 'range', key: 'sharpen', label: 'Digital sharpening', min: 0, max: 100, step: 1 },
        { kind: 'range', key: 'iso', label: 'High-ISO noise', min: 0, max: 100, step: 1 },
        { kind: 'range', key: 'aberration', label: 'Edge fringing', min: 0, max: 100, step: 1 },
        { kind: 'toggle', key: 'night', label: 'IR night vision' },
      ],
    },
    {
      title: 'On-screen telemetry',
      controls: [
        { kind: 'select', key: 'resolution', label: 'Resolution tag', options: [ { value: '1080P', label: '1080P 30' }, { value: '1440P', label: '1440P 30' }, { value: '4K', label: '4K UHD 30' } ] },
        { kind: 'text', key: 'model', label: 'Model name', maxLength: 18, placeholder: 'ROADEYE DX-9' },
        { kind: 'text', key: 'timestamp', label: 'Timestamp', maxLength: 19, placeholder: 'YYYY/MM/DD HH:MM:SS', validate: validateTimestamp },
        { kind: 'range', key: 'speed', label: 'Speed', min: 0, max: 240, step: 1 },
        { kind: 'select', key: 'speedUnit', label: 'Unit', options: [ { value: 'KM/H', label: 'km/h' }, { value: 'MPH', label: 'mph' } ] },
        { kind: 'text', key: 'gps', label: 'GPS', maxLength: 28, placeholder: 'N37.7749  W122.4194' },
      ],
    },
  ],

  randomize: (p, rng) => {
    const d = new Date(randInt(rng, 2016, 2026), randInt(rng, 0, 11), randInt(rng, 1, 28), randInt(rng, 0, 23), randInt(rng, 0, 59), randInt(rng, 0, 59))
    return {
      ...p,
      lens: randInt(rng, 135, 165),
      sharpen: randInt(rng, 35, 80),
      iso: randInt(rng, 20, 70),
      aberration: randInt(rng, 20, 65),
      speed: randInt(rng, 18, 128),
      timestamp: formatTimestamp(d),
      gps: formatGps(randRange(rng, -60, 65), randRange(rng, -170, 170)),
      resolution: pick(rng, ['1080P', '1440P', '4K']),
    }
  },

  look: (p) => {
    const lens = (num(p, 'lens') - 110) / 60
    const night = bool(p, 'night')
    return {
      barrel: 0.1 + lens * 0.75,
      ca: (num(p, 'aberration') / 100) * 1.6,
      sharpen: num(p, 'sharpen') / 100,
      isoNoise: (num(p, 'iso') / 100) * (night ? 1.25 : 0.9),
      exposure: night ? 0.25 : 0.04,
      contrast: night ? 1.25 : 1.16,
      saturation: night ? 1 : 1.12,
      gain: night ? [1, 1, 1] : [0.98, 1.0, 1.04],
      highTint: [0.01, 0.01, 0.02],
      rolloff: 0.15,
      vignette: night ? 0.55 : 0.3,
      night: night ? 1 : 0,
    }
  },

  animated: () => true,

  overlay: (ctx, p, info) => {
    const img = info.layout.image
    const s = img.h / 1000
    const size = 34 * s
    const pad = 30 * s
    const x0 = img.x + pad
    const x1 = img.x + img.w - pad
    const yTop = img.y + pad + size * 0.85
    const yBot = img.y + img.h - pad
    const stroke = Math.max(1, s)

    const recOn = info.forExport || Math.floor(info.time * 1.25) % 2 === 0
    if (recOn) {
      ctx.save()
      ctx.beginPath()
      ctx.arc(x0 + size * 0.36, yTop - size * 0.33, size * 0.32, 0, Math.PI * 2)
      ctx.fillStyle = '#FF1E12'
      ctx.lineWidth = stroke * 2
      ctx.strokeStyle = '#000'
      ctx.stroke()
      ctx.fill()
      ctx.restore()
    }
    osdText(ctx, 'REC', x0 + size * 0.9, yTop, { size, color: recOn ? '#FF2A1E' : '#fff', stroke })
    const resTag = `${str(p, 'resolution')} 30FPS`
    osdText(ctx, resTag, x0 + size * 3.3, yTop, { size: size * 0.8, stroke })
    osdText(ctx, str(p, 'model').toUpperCase(), x1, yTop, { size: size * 0.8, align: 'right', stroke })

    const speedText = `${Math.round(num(p, 'speed'))} ${str(p, 'speedUnit')}`
    osdText(ctx, str(p, 'gps'), x0, yBot - size * 1.25, { size: size * 0.78, stroke })
    osdText(ctx, str(p, 'timestamp'), x0, yBot, { size, stroke })
    osdText(ctx, speedText, x1, yBot, { size: size * 1.35, align: 'right', stroke })
    if (bool(p, 'night')) osdText(ctx, 'IR', x1, yBot - size * 1.6, { size: size * 0.8, align: 'right', stroke, color: '#BFFFC8' })
  },
}
