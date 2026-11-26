/**
 * Adaptive viewfinder resolution. While the preview is animating, per-frame render times feed a
 * small governor: a slow rolling average steps the preview down (1 → ¾ → ½ of the layout edge),
 * a long fast streak steps it back up. Exports never consult it.
 */

export const PREVIEW_SCALES = [1, 0.75, 0.5] as const
export type PreviewScale = (typeof PREVIEW_SCALES)[number]

/** Frames in the rolling average. */
export const WINDOW_FRAMES = 30
/** Step down when the rolling average is slower than this (ms). */
export const SLOW_MS = 14
/** Step up after this many consecutive full-window averages faster than FAST_MS. */
export const FAST_MS = 6
export const CALM_FRAMES = 120

export interface PreviewGovernor {
  /** Index into PREVIEW_SCALES. */
  level: number
  /** The most recent frame times, newest last (at most WINDOW_FRAMES). */
  window: readonly number[]
  /** Consecutive frames whose rolling average was under FAST_MS. */
  calm: number
}

export const INITIAL_GOVERNOR: PreviewGovernor = { level: 0, window: [], calm: 0 }

const mean = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)

/** Feed one frame's render time; returns the next governor state (a level change resets the window). */
export function stepGovernor(g: PreviewGovernor, frameMs: number): PreviewGovernor {
  if (!Number.isFinite(frameMs) || frameMs < 0) return g
  const window = [...g.window, frameMs].slice(-WINDOW_FRAMES)
  if (window.length < WINDOW_FRAMES) return { ...g, window }
  const avg = mean(window)
  const lowest = PREVIEW_SCALES.length - 1
  if (avg > SLOW_MS && g.level < lowest) return { level: g.level + 1, window: [], calm: 0 }
  const calm = avg < FAST_MS ? g.calm + 1 : 0
  if (calm >= CALM_FRAMES && g.level > 0) return { level: g.level - 1, window: [], calm: 0 }
  return { level: g.level, window, calm }
}

export const scaleOf = (g: Pick<PreviewGovernor, 'level'>): PreviewScale => PREVIEW_SCALES[Math.min(Math.max(g.level, 0), PREVIEW_SCALES.length - 1)]

/** Viewfinder tag text for a reduced preview, or null at full resolution. */
export function previewTag(scale: number): string | null {
  if (scale >= 1) return null
  return scale >= 0.75 ? 'Preview ¾' : 'Preview ½'
}
