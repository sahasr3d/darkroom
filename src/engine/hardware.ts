import type { Rig } from './look'

/**
 * Map manual controls onto real camera hardware through MediaStreamTrack constraints, where the
 * browser and device expose them (mostly Chrome on Android). Anything not supported stays a
 * shader simulation; the returned flags tell the pipeline what the sensor already did.
 */
export interface HardwareApplied {
  exposure: boolean
  whiteBalance: boolean
  focus: boolean
}

export const NO_HARDWARE: HardwareApplied = { exposure: false, whiteBalance: false, focus: false }

type Range = { min: number; max: number }

const isRange = (v: unknown): v is Range => typeof v === 'object' && v !== null && 'min' in v && 'max' in v
const modes = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]) : [])
const within = (v: number, r: Range): number => Math.min(r.max, Math.max(r.min, v))

/**
 * Map a tap in the developed frame (uv of the cropped, zoomed, possibly mirrored image) back to
 * normalised sensor coordinates, which is what `pointsOfInterest` expects. `rawCrop` is the crop
 * in raw (un-mirrored) frame space; a mirrored preview shows it flipped, so u runs right-to-left.
 */
export function sensorPoint(uv: readonly [number, number], rawCrop: readonly [number, number, number, number], zoom: number, mirrored: boolean): [number, number] {
  const z = Math.max(1, zoom)
  const u = 0.5 + (uv[0] - 0.5) / z
  const v = 0.5 + (uv[1] - 0.5) / z
  const x = rawCrop[0] + (mirrored ? 1 - u : u) * rawCrop[2]
  const y = rawCrop[1] + v * rawCrop[3]
  const clamp01 = (n: number) => Math.min(1, Math.max(0, n))
  return [clamp01(x), clamp01(y)]
}

export function trackOf(video: HTMLVideoElement): MediaStreamTrack | null {
  const stream = video.srcObject
  return stream instanceof MediaStream ? (stream.getVideoTracks()[0] ?? null) : null
}

/** Build the constraint set for this rig given the track's capabilities. Pure, so it is testable. */
export function hardwareConstraints(caps: Record<string, unknown>, rig: Rig, supportsPoi: boolean): { advanced: Record<string, unknown>[]; applied: HardwareApplied } {
  const advanced: Record<string, unknown>[] = []
  const applied: HardwareApplied = { ...NO_HARDWARE }

  const exposureModes = modes(caps.exposureMode)
  if (rig.manual && exposureModes.includes('manual') && isRange(caps.iso) && isRange(caps.exposureTime)) {
    // exposureTime is in units of 100 µs.
    advanced.push({ exposureMode: 'manual', iso: within(rig.iso, caps.iso), exposureTime: within(rig.shutter * 10000, caps.exposureTime) })
    applied.exposure = true
  } else if (exposureModes.includes('continuous')) {
    advanced.push({ exposureMode: 'continuous' })
  }

  const wbModes = modes(caps.whiteBalanceMode)
  if (rig.manual && wbModes.includes('manual') && isRange(caps.colorTemperature)) {
    advanced.push({ whiteBalanceMode: 'manual', colorTemperature: within(rig.kelvin, caps.colorTemperature) })
    applied.whiteBalance = true
  } else if (wbModes.includes('continuous')) {
    advanced.push({ whiteBalanceMode: 'continuous' })
  }

  const focusModes = modes(caps.focusMode)
  if (rig.focus && supportsPoi && (focusModes.includes('single-shot') || focusModes.includes('continuous'))) {
    advanced.push({ pointsOfInterest: [{ x: rig.focus[0], y: rig.focus[1] }], focusMode: focusModes.includes('single-shot') ? 'single-shot' : 'continuous' })
    applied.focus = true
  }
  return { advanced, applied }
}

export async function applyHardware(track: MediaStreamTrack, rig: Rig): Promise<HardwareApplied> {
  const caps = (track.getCapabilities?.() ?? {}) as Record<string, unknown>
  const supported = navigator.mediaDevices?.getSupportedConstraints?.() as Record<string, boolean> | undefined
  const { advanced, applied } = hardwareConstraints(caps, rig, !!supported?.pointsOfInterest)
  if (advanced.length === 0) return NO_HARDWARE
  try {
    await track.applyConstraints({ advanced } as MediaTrackConstraints)
    return applied
  } catch {
    return NO_HARDWARE
  }
}
