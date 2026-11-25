import { clamp } from './rng'

/**
 * Manual exposure model. Everything is relative to a reference exposure of ISO 200 at 1/125s,
 * which is what the camera bodies are graded for; each doubling of ISO or shutter time is +1 EV.
 */
export const REF_ISO = 200
export const REF_SHUTTER = 1 / 125

export const ISO_STOPS = [50, 100, 200, 400, 800, 1600, 3200, 6400] as const
export const SHUTTER_STOPS = [1 / 1000, 1 / 500, 1 / 250, 1 / 125, 1 / 60, 1 / 30, 1 / 15, 1 / 8, 1 / 4, 1 / 2, 1] as const
/** EV compensation in third-stops from −3 to +3. */
export const EV_STOPS: readonly number[] = Array.from({ length: 19 }, (_, i) => Math.round((i - 9) * (1 / 3) * 1000) / 1000)
export const ND_STOPS = [0, 1, 2, 3] as const

/** Slowest shutter you can hand-hold without visible shake (the 1/60 rule of thumb). */
export const HANDHELD_LIMIT = 1 / 60

export const WB_PRESETS = [
  { label: 'Tungsten', kelvin: 3200 },
  { label: 'Fluorescent', kelvin: 4200 },
  { label: 'Daylight', kelvin: 5500 },
  { label: 'Cloudy', kelvin: 6500 },
  { label: 'Shade', kelvin: 7500 },
] as const

/** Stops of exposure the manual ISO + shutter pair adds over the reference. */
export function manualExposureEv(iso: number, shutter: number): number {
  return Math.log2(iso / REF_ISO) + Math.log2(shutter / REF_SHUTTER)
}

/** Extra sensor/film noise from pushing ISO above 400. */
export function isoNoiseFor(iso: number): number {
  return clamp(Math.log2(iso / 400) * 0.14, 0, 0.6)
}

/**
 * Hand-shake blur length (fraction of the frame) for a shutter speed. Nothing at or faster than
 * the hand-holding limit; grows with each stop slower; stabilisation buys back about two stops.
 */
export function motionBlurFor(shutter: number, stabilized: boolean): number {
  if (shutter <= HANDHELD_LIMIT) return 0
  const stops = Math.log2(shutter / HANDHELD_LIMIT)
  return clamp(stops * 0.0055, 0, 0.04) * (stabilized ? 0.25 : 1)
}

export function formatShutter(s: number): string {
  return s >= 1 ? `${s}s` : `1/${Math.round(1 / s)}`
}

const THIRDS = ['', '⅓', '⅔']

/** "+1⅓" style EV label. */
export function formatEv(v: number): string {
  const thirds = Math.round(Math.abs(v) * 3)
  if (thirds === 0) return '±0'
  const whole = Math.floor(thirds / 3)
  const frac = THIRDS[thirds % 3]
  return `${v > 0 ? '+' : '−'}${whole > 0 || !frac ? whole : ''}${frac}`
}

/** Index of the stop closest to `v` (log-distance, so it works for ISO and shutter alike). */
export function nearestStopIndex(stops: readonly number[], v: number): number {
  let best = 0
  for (let i = 1; i < stops.length; i++) {
    const d = (s: number) => Math.abs(stops[0] > 0 && v > 0 ? Math.log2(s / v) : s - v)
    if (d(stops[i]) < d(stops[best])) best = i
  }
  return best
}
