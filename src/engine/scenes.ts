import { FONT } from './draw2d'
import { createRng, randRange, type Rng } from './rng'

export type SceneId = 'street' | 'highway' | 'golden'

export const SCENES: readonly { id: SceneId; label: string; note: string }[] = [
  { id: 'street', label: 'Daytime street', note: 'Hard sun, glass, painted lines' },
  { id: 'highway', label: 'Night highway', note: 'Sodium lamps, tail-lights' },
  { id: 'golden', label: 'Golden hour', note: 'Low sun, backlit grass' },
]

export const SCENE_W = 2400
export const SCENE_H = 1600

interface View {
  vpx: number
  vpy: number
  f: number
  camH: number
}

type Pt = [number, number]

const proj = (v: View, x: number, y: number, z: number): Pt => [v.vpx + (x * v.f) / z, v.vpy - ((y - v.camH) * v.f) / z]

function poly(ctx: CanvasRenderingContext2D, pts: Pt[], fill: string): void {
  ctx.beginPath()
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)))
  ctx.closePath()
  ctx.fillStyle = fill
  ctx.fill()
}

/** World-space quad on a plane: corners given as [x,y,z] in metres. */
function quad(ctx: CanvasRenderingContext2D, v: View, corners: [number, number, number][], fill: string): void {
  poly(ctx, corners.map(([x, y, z]) => proj(v, x, y, z)), fill)
}

function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha: number): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r)
  g.addColorStop(0, color)
  g.addColorStop(0.25, color)
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.globalAlpha = alpha
  ctx.fillStyle = g
  ctx.fillRect(x - r, y - r, r * 2, r * 2)
  ctx.restore()
}

function addSensorNoise(ctx: CanvasRenderingContext2D, rng: Rng, amount: number): void {
  const img = ctx.getImageData(0, 0, SCENE_W, SCENE_H)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const n = (rng() - 0.5) * amount
    d[i] += n
    d[i + 1] += n
    d[i + 2] += n
  }
  ctx.putImageData(img, 0, 0)
}

// ---------------------------------------------------------------------------
function drawBuildingsSide(ctx: CanvasRenderingContext2D, v: View, rng: Rng, side: -1 | 1, shade: number): void {
  const palette = ['#B5654A', '#D9C7A8', '#8C8F94', '#C98F5A', '#E3DED3', '#6F7A84', '#A9553F', '#CDBB96']
  const X = side * 10
  const segs: { z0: number; z1: number; h: number; color: string }[] = []
  let z = 5
  while (z < 220) {
    const len = randRange(rng, 9, 22)
    segs.push({ z0: z, z1: z + len, h: randRange(rng, 9, 34), color: palette[Math.floor(rng() * palette.length)] })
    z += len
  }
  for (const s of [...segs].reverse()) {
    quad(ctx, v, [[X, 0, s.z0], [X + side * 30, 0, s.z0], [X + side * 30, s.h, s.z0], [X, s.h, s.z0]], shadeColor(s.color, shade - 0.18))
    quad(ctx, v, [[X, 0, s.z0], [X, 0, s.z1], [X, s.h, s.z1], [X, s.h, s.z0]], shadeColor(s.color, shade))
    quad(ctx, v, [[X, 0, s.z0], [X, 0, s.z1], [X, 3.4, s.z1], [X, 3.4, s.z0]], shadeColor('#2A2C30', shade))
    for (let y = 4.4; y < s.h - 1.4; y += 3.3) {
      for (let wz = s.z0 + 1.0; wz < s.z1 - 1.4; wz += 2.9) {
        const sky = rng() > 0.55
        quad(ctx, v, [[X, y, wz], [X, y, wz + 1.5], [X, y + 1.9, wz + 1.5], [X, y + 1.9, wz]], sky ? shadeColor('#A9C4DA', shade + 0.05) : shadeColor('#28323D', shade))
      }
    }
  }
}

function shadeColor(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16)
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c * k)))
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`
}

function drawCar(ctx: CanvasRenderingContext2D, v: View, x: number, z: number, color: string, lit: number): void {
  const [l, b] = proj(v, x - 0.92, 0, z)
  const [r, t] = proj(v, x + 0.92, 1.45, z)
  const w = r - l
  const h = b - t
  ctx.fillStyle = 'rgba(0,0,0,0.35)'
  ctx.beginPath()
  ctx.ellipse((l + r) / 2, b, w * 0.62, h * 0.08, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#121212'
  ctx.fillRect(l + w * 0.06, b - h * 0.12, w * 0.18, h * 0.12)
  ctx.fillRect(r - w * 0.24, b - h * 0.12, w * 0.18, h * 0.12)
  ctx.fillStyle = color
  ctx.fillRect(l, t + h * 0.38, w, h * 0.52)
  poly(ctx, [[l + w * 0.12, t + h * 0.4], [l + w * 0.22, t], [r - w * 0.22, t], [r - w * 0.12, t + h * 0.4]], color)
  poly(ctx, [[l + w * 0.18, t + h * 0.37], [l + w * 0.26, t + h * 0.06], [r - w * 0.26, t + h * 0.06], [r - w * 0.18, t + h * 0.37]], '#1D2630')
  ctx.fillStyle = '#B3140E'
  ctx.fillRect(l + w * 0.04, t + h * 0.48, w * 0.16, h * 0.1)
  ctx.fillRect(r - w * 0.2, t + h * 0.48, w * 0.16, h * 0.1)
  ctx.fillStyle = '#E6E2D6'
  ctx.fillRect(l + w * 0.4, t + h * 0.66, w * 0.2, h * 0.08)
  if (lit > 0) {
    glow(ctx, l + w * 0.12, t + h * 0.53, w * 0.45, '#FF2A14', lit)
    glow(ctx, r - w * 0.12, t + h * 0.53, w * 0.45, '#FF2A14', lit)
  }
}

function drawStreet(ctx: CanvasRenderingContext2D, rng: Rng): void {
  const v: View = { vpx: 1180, vpy: 690, f: 1100, camH: 1.6 }
  const sky = ctx.createLinearGradient(0, 0, 0, v.vpy)
  sky.addColorStop(0, '#4F8BC9')
  sky.addColorStop(0.7, '#A8CBE6')
  sky.addColorStop(1, '#E4EDF0')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, SCENE_W, v.vpy + 2)
  for (let i = 0; i < 14; i++) {
    const cx = randRange(rng, 300, 2200)
    const cy = randRange(rng, 80, 420)
    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    ctx.beginPath()
    ctx.ellipse(cx, cy, randRange(rng, 90, 260), randRange(rng, 18, 46), 0, 0, Math.PI * 2)
    ctx.fill()
  }
  glow(ctx, 1980, 150, 340, '#FFF4D6', 0.9)
  glow(ctx, 1980, 150, 70, '#FFFFFF', 1)
  for (let x = 980; x < 1400; x += randRange(rng, 14, 30)) {
    const h = randRange(rng, 20, 90)
    ctx.fillStyle = '#8FA3B5'
    ctx.fillRect(x, v.vpy - h, 22, h + 2)
  }

  quad(ctx, v, [[-6, 0, 1.2], [6, 0, 1.2], [6, 0, 400], [-6, 0, 400]], '#4B4D50')
  for (const side of [-1, 1]) {
    quad(ctx, v, [[side * 6, 0, 1.2], [side * 10, 0, 1.2], [side * 10, 0, 400], [side * 6, 0, 400]], '#B8B4AA')
    quad(ctx, v, [[side * 6, 0, 1.2], [side * 6.15, 0, 1.2], [side * 6.15, 0, 400], [side * 6, 0, 400]], '#E6E2D8')
  }
  for (let z = 3; z < 300; z += 6) quad(ctx, v, [[-0.08, 0, z], [0.08, 0, z], [0.08, 0, z + 3], [-0.08, 0, z + 3]], '#E9E4D2')
  for (let x = -5.5; x < 5.5; x += 1.1) quad(ctx, v, [[x, 0, 4], [x + 0.55, 0, 4], [x + 0.55, 0, 6.5], [x, 0, 6.5]], '#ECE9E0')

  drawBuildingsSide(ctx, v, rng, -1, 1.0)
  drawBuildingsSide(ctx, v, rng, 1, 0.62)

  for (let z = 120; z >= 10; z -= 15) {
    for (const side of [-1, 1]) {
      const [tx, ty] = proj(v, side * 7.4, 0, z)
      const [, top] = proj(v, side * 7.4, 3.2, z)
      const [cx, cy] = proj(v, side * 7.4, 4.8, z)
      const rad = (2.3 * v.f) / z
      ctx.strokeStyle = '#3B2E25'
      ctx.lineWidth = Math.max(1, (0.3 * v.f) / z)
      ctx.beginPath()
      ctx.moveTo(tx, ty)
      ctx.lineTo(tx, top)
      ctx.stroke()
      ctx.fillStyle = side < 0 ? '#4E7A3A' : '#2F4D27'
      ctx.beginPath()
      ctx.arc(cx, cy, rad, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = side < 0 ? 'rgba(170,210,110,0.35)' : 'rgba(0,0,0,0.15)'
      ctx.beginPath()
      ctx.arc(cx + rad * 0.25, cy - rad * 0.25, rad * 0.6, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  drawCar(ctx, v, 3.0, 70, '#2F5D8A', 0)
  drawCar(ctx, v, -2.9, 38, '#D8D4CC', 0)
  drawCar(ctx, v, 2.8, 16, '#B0281F', 0)
  addSensorNoise(ctx, rng, 10)
}

// ---------------------------------------------------------------------------
function drawHighway(ctx: CanvasRenderingContext2D, rng: Rng): void {
  const v: View = { vpx: 1200, vpy: 760, f: 1150, camH: 1.4 }
  const sky = ctx.createLinearGradient(0, 0, 0, v.vpy)
  sky.addColorStop(0, '#03040A')
  sky.addColorStop(0.75, '#101628')
  sky.addColorStop(1, '#4A3226')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, SCENE_W, v.vpy + 2)
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = `rgba(255,255,255,${randRange(rng, 0.2, 0.8)})`
    ctx.fillRect(rng() * SCENE_W, rng() * v.vpy * 0.7, 1.6, 1.6)
  }
  for (let x = 0; x < SCENE_W; x += randRange(rng, 18, 46)) {
    const h = randRange(rng, 8, 80)
    ctx.fillStyle = '#0A0C14'
    ctx.fillRect(x, v.vpy - h, 40, h + 2)
    for (let k = 0; k < h / 6; k++) if (rng() > 0.6) {
      ctx.fillStyle = 'rgba(255,200,120,0.8)'
      ctx.fillRect(x + rng() * 36, v.vpy - rng() * h, 2.5, 2.5)
    }
  }
  ctx.fillStyle = '#060608'
  ctx.fillRect(0, v.vpy, SCENE_W, SCENE_H - v.vpy)
  quad(ctx, v, [[-12, 0, 1], [12, 0, 1], [12, 0, 600], [-12, 0, 600]], '#17181C')
  for (const x of [-9.6, 7.4]) quad(ctx, v, [[x - 0.1, 0, 1.5], [x + 0.1, 0, 1.5], [x + 0.1, 0, 600], [x - 0.1, 0, 600]], '#BFB9A6')
  for (const x of [-6.0, 1.8, 5.4]) {
    for (let z = 3; z < 500; z += 12) quad(ctx, v, [[x - 0.08, 0, z], [x + 0.08, 0, z], [x + 0.08, 0, z + 3], [x - 0.08, 0, z + 3]], '#D8D4C6')
  }
  quad(ctx, v, [[-2.9, 0, 3], [-2.3, 0, 3], [-2.3, 0.9, 3], [-2.9, 0.9, 3]], '#2A2926')
  quad(ctx, v, [[-2.3, 0, 3], [-2.3, 0, 600], [-2.3, 0.9, 600], [-2.3, 0.9, 3]], '#34322D')
  quad(ctx, v, [[-2.3, 0.82, 3], [-2.3, 0.82, 600], [-2.3, 0.9, 600], [-2.3, 0.9, 3]], '#6A655A')

  for (let z = 420; z >= 26; z -= 34) {
    const [px, py] = proj(v, -2.6, 0, z)
    const [, top] = proj(v, -2.6, 10, z)
    const [lx, ly] = proj(v, 0.9, 9.6, z)
    ctx.strokeStyle = '#2A2A2E'
    ctx.lineWidth = Math.max(1, (0.25 * v.f) / z)
    ctx.beginPath()
    ctx.moveTo(px, py)
    ctx.lineTo(px, top)
    ctx.lineTo(lx, ly)
    ctx.stroke()
    const [gx, gy] = proj(v, 1.2, 0, z + 2)
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    const pool = ctx.createRadialGradient(gx, gy, 0, gx, gy, (7 * v.f) / z)
    pool.addColorStop(0, 'rgba(255,150,60,0.35)')
    pool.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = pool
    ctx.beginPath()
    ctx.ellipse(gx, gy, (7 * v.f) / z, (2.2 * v.f) / z, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
    glow(ctx, lx, ly, (3.4 * v.f) / z, '#FFB25A', 0.85)
    glow(ctx, lx, ly, (0.5 * v.f) / z + 2, '#FFF3D0', 1)
  }

  const [s0x, s0y] = proj(v, 1.2, 9.2, 80)
  const [s1x, s1y] = proj(v, 8.6, 6.4, 80)
  ctx.fillStyle = '#1D6B3A'
  ctx.fillRect(s0x, s0y, s1x - s0x, s1y - s0y)
  ctx.strokeStyle = '#E8EFE6'
  ctx.lineWidth = 2
  ctx.strokeRect(s0x + 4, s0y + 4, s1x - s0x - 8, s1y - s0y - 8)
  ctx.fillStyle = '#F2F5EE'
  ctx.font = `600 ${Math.round((s1y - s0y) * 0.3)}px ${FONT.ui}`
  ctx.fillText('Exit 24', s0x + 14, s0y + (s1y - s0y) * 0.42)
  ctx.font = `${Math.round((s1y - s0y) * 0.24)}px ${FONT.ui}`
  ctx.fillText('Harbor Blvd  1 mi', s0x + 14, s0y + (s1y - s0y) * 0.8)

  for (const [x, z] of [[3.7, 160], [0, 95], [3.6, 48], [0.1, 30]] as const) {
    const [l, b] = proj(v, x - 0.9, 0, z)
    const [r, t] = proj(v, x + 0.9, 1.4, z)
    ctx.fillStyle = '#0B0B0D'
    ctx.fillRect(l, t + (b - t) * 0.3, r - l, (b - t) * 0.6)
    const [ly, lyy] = proj(v, x - 0.7, 0.85, z)
    const [ry] = proj(v, x + 0.7, 0.85, z)
    for (const lxp of [ly, ry]) {
      glow(ctx, lxp, lyy, (0.9 * v.f) / z + 6, '#FF2412', 0.95)
      glow(ctx, lxp, lyy, (0.12 * v.f) / z + 1.5, '#FFD0C0', 1)
    }
  }
  for (const [x, z] of [[-4.3, 240], [-7.8, 130], [-4.2, 70], [-7.6, 36]] as const) {
    const [ly, yy] = proj(v, x - 0.7, 0.7, z)
    const [ry] = proj(v, x + 0.7, 0.7, z)
    for (const lxp of [ly, ry]) {
      glow(ctx, lxp, yy, (2.4 * v.f) / z + 8, '#FFF1D8', 0.9)
      glow(ctx, lxp, yy, (0.2 * v.f) / z + 2, '#FFFFFF', 1)
    }
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.fillStyle = 'rgba(255,240,220,0.12)'
    ctx.fillRect(ly - (6 * v.f) / z, yy - 1.5, (13 * v.f) / z, 3)
    ctx.restore()
  }
  addSensorNoise(ctx, rng, 14)
}

// ---------------------------------------------------------------------------
function ridge(ctx: CanvasRenderingContext2D, rng: Rng, base: number, amp: number, color: string): void {
  const p1 = rng() * 10
  const p2 = rng() * 10
  ctx.beginPath()
  ctx.moveTo(0, SCENE_H)
  for (let x = 0; x <= SCENE_W; x += 16) {
    const y = base - amp * (0.55 * Math.sin(x * 0.0021 + p1) + 0.3 * Math.sin(x * 0.0057 + p2) + 0.15 * Math.sin(x * 0.019))
    ctx.lineTo(x, y)
  }
  ctx.lineTo(SCENE_W, SCENE_H)
  ctx.closePath()
  ctx.fillStyle = color
  ctx.fill()
}

function drawGolden(ctx: CanvasRenderingContext2D, rng: Rng): void {
  const horizon = 1010
  const sky = ctx.createLinearGradient(0, 0, 0, horizon)
  sky.addColorStop(0, '#2C3A62')
  sky.addColorStop(0.38, '#7A5B7C')
  sky.addColorStop(0.72, '#E2894B')
  sky.addColorStop(1, '#FFD592')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, SCENE_W, horizon + 4)
  for (let i = 0; i < 10; i++) {
    ctx.fillStyle = `rgba(255,${Math.round(randRange(rng, 150, 200))},150,${randRange(rng, 0.25, 0.5)})`
    ctx.beginPath()
    ctx.ellipse(randRange(rng, 0, SCENE_W), randRange(rng, 260, 720), randRange(rng, 200, 520), randRange(rng, 8, 20), 0, 0, Math.PI * 2)
    ctx.fill()
  }
  glow(ctx, 1690, 930, 900, '#FF9F4A', 0.55)
  glow(ctx, 1690, 930, 240, '#FFE2A0', 0.9)
  glow(ctx, 1690, 930, 72, '#FFFFFF', 1)

  ridge(ctx, rng, horizon - 30, 70, '#8A6574')
  ridge(ctx, rng, horizon + 10, 45, '#5C4558')
  const field = ctx.createLinearGradient(0, horizon, 0, SCENE_H)
  field.addColorStop(0, '#B97A3C')
  field.addColorStop(0.35, '#8A5424')
  field.addColorStop(1, '#3D2412')
  ctx.fillStyle = field
  ctx.fillRect(0, horizon + 20, SCENE_W, SCENE_H)

  ctx.lineCap = 'round'
  for (let i = 0; i < 5200; i++) {
    const y = horizon + 30 + Math.pow(rng(), 0.7) * (SCENE_H - horizon)
    const depth = (y - horizon) / (SCENE_H - horizon)
    const x = rng() * SCENE_W
    const len = 6 + depth * 48 * rng()
    const lean = (rng() - 0.4) * len * 0.5
    const nearSun = Math.max(0, 1 - Math.abs(x - 1690) / 1100)
    ctx.strokeStyle = rng() > 0.5 - nearSun * 0.3 ? `rgba(255,${200 + Math.round(nearSun * 40)},120,${0.25 + nearSun * 0.5})` : 'rgba(40,22,8,0.5)'
    ctx.lineWidth = 0.6 + depth * 1.8
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + lean, y - len)
    ctx.stroke()
  }

  for (let i = 0; i < 9; i++) {
    const t = i / 8
    const x = 240 + t * 1050
    const yb = 1520 - t * 470
    const h = 150 * (1 - t * 0.82)
    ctx.fillStyle = 'rgba(20,10,4,0.45)'
    poly(ctx, [[x - 3, yb], [x + 4, yb], [x - 220 * (1 - t * 0.7), yb + 70 * (1 - t * 0.7)], [x - 230 * (1 - t * 0.7), yb + 60 * (1 - t * 0.7)]], 'rgba(20,10,4,0.4)')
    ctx.fillStyle = '#24160F'
    ctx.fillRect(x - Math.max(2, 12 * (1 - t)), yb - h, Math.max(3, 22 * (1 - t)), h)
    ctx.fillStyle = 'rgba(255,190,110,0.8)'
    ctx.fillRect(x + Math.max(1, 8 * (1 - t)), yb - h, Math.max(1, 3 * (1 - t)), h)
  }
  ctx.strokeStyle = 'rgba(30,18,10,0.7)'
  ctx.lineWidth = 2
  for (const off of [0.35, 0.7]) {
    ctx.beginPath()
    ctx.moveTo(240, 1520 - 150 * off)
    ctx.lineTo(1290, 1050 - 150 * 0.18 * off)
    ctx.stroke()
  }

  ctx.fillStyle = '#1C1416'
  ctx.fillRect(500, 640, 26, 400)
  for (let i = 0; i < 26; i++) {
    ctx.beginPath()
    ctx.arc(512 + randRange(rng, -190, 190), 640 + randRange(rng, -170, 60), randRange(rng, 50, 110), 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.strokeStyle = '#1A1314'
  for (const [x, h] of [[900, 420], [1480, 300], [2050, 210]] as const) {
    ctx.lineWidth = 7
    ctx.beginPath()
    ctx.moveTo(x, horizon + 20)
    ctx.lineTo(x, horizon + 20 - h)
    ctx.moveTo(x - 50, horizon + 40 - h)
    ctx.lineTo(x + 50, horizon + 40 - h)
    ctx.stroke()
  }
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(850, horizon + 40 - 420)
  ctx.quadraticCurveTo(1190, horizon - 230, 1430, horizon + 40 - 300)
  ctx.quadraticCurveTo(1760, horizon - 110, 2000, horizon + 40 - 210)
  ctx.stroke()
  addSensorNoise(ctx, rng, 9)
}

const cache = new Map<SceneId, HTMLCanvasElement>()

export function renderScene(id: SceneId): HTMLCanvasElement {
  const hit = cache.get(id)
  if (hit) return hit
  const canvas = document.createElement('canvas')
  canvas.width = SCENE_W
  canvas.height = SCENE_H
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('2D canvas unavailable')
  const rng = createRng(id === 'street' ? 11 : id === 'highway' ? 23 : 37)
  if (id === 'street') drawStreet(ctx, rng)
  else if (id === 'highway') drawHighway(ctx, rng)
  else drawGolden(ctx, rng)
  cache.set(id, canvas)
  return canvas
}
