/**
 * Reverse-camera trajectory math. Ground plane in metres: x = lateral (right +), z = distance
 * behind the bumper. Steering follows a kinematic bicycle model; projection is a pinhole camera
 * mounted on the tailgate, pitched down toward the road.
 */
export const WHEELBASE_M = 2.7
export const TRACK_HALF_WIDTH_M = 0.9
export const CAMERA_HEIGHT_M = 1.0
export const CAMERA_PITCH_RAD = (38 * Math.PI) / 180
/** Steering-wheel angle (°) → road-wheel angle ratio. The UI range is the road-wheel lock. */
export const MAX_STEER_DEG = 35

export interface GroundPoint {
  x: number
  z: number
}

export interface ScreenPoint {
  x: number
  y: number
  depth: number
}

/** Signed curvature (1/m) for a steering angle in degrees. Positive curves the path right. */
export function curvatureFor(steerDeg: number): number {
  const clamped = Math.max(-MAX_STEER_DEG, Math.min(MAX_STEER_DEG, steerDeg))
  return Math.tan((clamped * Math.PI) / 180) / WHEELBASE_M
}

/** Point on a path that runs parallel to the vehicle centreline at `offset` metres, after travelling `s` metres. */
export function pathPoint(curvature: number, offset: number, s: number): GroundPoint {
  if (Math.abs(curvature) < 1e-6) return { x: offset, z: s }
  const theta = s * curvature
  const cx = (1 - Math.cos(theta)) / curvature
  const cz = Math.sin(theta) / curvature
  return { x: cx + offset * Math.cos(theta), z: cz - offset * Math.sin(theta) }
}

export interface Camera {
  cx: number
  cy: number
  focal: number
}

/** A camera tuned so the 0 m track ends land on the bottom edge of a w×h frame. */
export function cameraFor(w: number, h: number): Camera {
  const cot = 1 / Math.tan(CAMERA_PITCH_RAD)
  const cy = h * 0.36
  const focalFromHeight = (h * 1.02 - cy) / cot
  const nearHalfWidth = TRACK_HALF_WIDTH_M / (CAMERA_HEIGHT_M * Math.sin(CAMERA_PITCH_RAD))
  const focalFromWidth = (w * 0.44) / nearHalfWidth
  return { cx: w / 2, cy, focal: Math.min(focalFromHeight, focalFromWidth) }
}

export function project(cam: Camera, p: GroundPoint): ScreenPoint | null {
  const sp = Math.sin(CAMERA_PITCH_RAD)
  const cp = Math.cos(CAMERA_PITCH_RAD)
  const depth = CAMERA_HEIGHT_M * sp + p.z * cp
  if (depth <= 0.05) return null
  const up = -CAMERA_HEIGHT_M * cp + p.z * sp
  return { x: cam.cx + (cam.focal * p.x) / depth, y: cam.cy - (cam.focal * up) / depth, depth }
}

export interface GuideBand {
  color: string
  from: number
  to: number
}

/** OEM distance bands: red to 0.5 m, yellow to 1 m, green to 2 m (then a faint run-out). */
export const GUIDE_BANDS: readonly GuideBand[] = [
  { color: '#FF2B1C', from: 0, to: 0.5 },
  { color: '#FFD21A', from: 0.5, to: 1.0 },
  { color: '#3BE15A', from: 1.0, to: 2.0 },
]
export const GUIDE_MARKS: readonly { at: number; color: string; label: string }[] = [
  { at: 0.5, color: '#FF2B1C', label: '0.5m' },
  { at: 1.0, color: '#FFD21A', label: '1m' },
  { at: 2.0, color: '#3BE15A', label: '2m' },
]

export function sampleTrack(cam: Camera, curvature: number, offset: number, from: number, to: number, steps = 24): ScreenPoint[] {
  const pts: ScreenPoint[] = []
  for (let i = 0; i <= steps; i++) {
    const s = from + ((to - from) * i) / steps
    const sp = project(cam, pathPoint(curvature, offset, s))
    if (sp) pts.push(sp)
  }
  return pts
}
