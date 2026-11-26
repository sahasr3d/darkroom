/**
 * Per-body retro sound for video recording, as plain data. `graph.ts` turns a spec into a
 * WebAudio node chain; keeping the recipe pure lets each body's character be unit-tested.
 */

export interface FilterStage {
  type: 'lowpass' | 'highpass' | 'bandpass' | 'lowshelf' | 'peaking'
  frequency: number
  Q?: number
  /** dB, for shelf/peaking stages. */
  gain?: number
}

export interface WowFlutter {
  /** Base delay the modulation swings around, in seconds. */
  baseDelay: number
  /** Slow wow (~0.5 Hz) and fast flutter (~6 Hz) depths, in seconds of delay swing. */
  wowDepth: number
  wowRate: number
  flutterDepth: number
  flutterRate: number
}

export interface AudioChainSpec {
  /** Short name for the status line. */
  name: string
  filters: readonly FilterStage[]
  /** Saturation drive for a soft tanh curve (0 = off): analogue warmth. */
  warmth: number
  /** Quantisation steps per half-wave for a crude bitcrush (0 = off). */
  crushSteps: number
  compress: boolean
  wow: WowFlutter | null
  /** Tape/projector hiss level (linear gain, 0 = none). */
  hiss: number
  /** Projector shutter clatter level (linear gain, 0 = none); clicks at the body's frame rate. */
  clatter: number
  /** Output trim. */
  gain: number
}

const CLEAN: AudioChainSpec = { name: 'clean', filters: [], warmth: 0, crushSteps: 0, compress: false, wow: null, hiss: 0, clatter: 0, gain: 1 }

const TAPE_WOW: WowFlutter = { baseDelay: 0.012, wowDepth: 0.0022, wowRate: 0.5, flutterDepth: 0.00035, flutterRate: 6 }

const VHS: AudioChainSpec = {
  name: 'VHS tape',
  filters: [
    { type: 'lowpass', frequency: 7000, Q: 0.7 },
    { type: 'highpass', frequency: 80, Q: 0.7 },
  ],
  warmth: 1.2,
  crushSteps: 0,
  compress: false,
  wow: TAPE_WOW,
  hiss: 0.012,
  clatter: 0,
  gain: 0.95,
}

const PROJECTOR: AudioChainSpec = {
  name: 'projector',
  filters: [
    { type: 'highpass', frequency: 300, Q: 0.7 },
    { type: 'lowpass', frequency: 4000, Q: 0.9 },
    { type: 'peaking', frequency: 1800, Q: 1, gain: 3 },
  ],
  warmth: 1.6,
  crushSteps: 0,
  compress: false,
  wow: null,
  hiss: 0.01,
  clatter: 0.05,
  gain: 1.1,
}

const DCR: AudioChainSpec = { ...CLEAN, name: 'MiniDV', filters: [{ type: 'highpass', frequency: 60, Q: 0.7 }], compress: true, hiss: 0.003 }

const WARM: AudioChainSpec = {
  ...CLEAN,
  name: 'warm',
  filters: [
    { type: 'lowpass', frequency: 11000, Q: 0.6 },
    { type: 'lowshelf', frequency: 220, gain: 3 },
  ],
  warmth: 1.4,
}

const FUNS: AudioChainSpec = {
  ...CLEAN,
  name: 'toy camcorder',
  filters: [
    { type: 'highpass', frequency: 150, Q: 0.7 },
    { type: 'lowpass', frequency: 5000, Q: 0.8 },
  ],
  crushSteps: 12,
  hiss: 0.004,
  gain: 0.9,
}

const BY_BODY: Readonly<Record<string, AudioChainSpec>> = {
  'v-vhs': VHS,
  'v-classic': VHS,
  'v-8mm': PROJECTOR,
  'v-16mm': PROJECTOR,
  'v-slide-p': PROJECTOR,
  'v-dcr': DCR,
  'v-kino': WARM,
  'v-glow': WARM,
  'v-funs': FUNS,
  'v-original': CLEAN,
}

/** The sound recipe for a video body; unknown bodies record clean. */
export const audioChainFor = (bodyId: string): AudioChainSpec => BY_BODY[bodyId] ?? CLEAN

/** True when the chain adds nothing, so a silent source needs no audio track at all. */
export const isClean = (spec: AudioChainSpec): boolean => spec.hiss === 0 && spec.clatter === 0

/** A symmetric tanh saturation curve, normalised so ±1 maps to ±1. */
export function warmthCurve(drive: number, samples = 1024): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(samples)
  const norm = Math.tanh(drive)
  for (let i = 0; i < samples; i++) {
    const x = (i / (samples - 1)) * 2 - 1
    curve[i] = drive > 0 ? Math.tanh(x * drive) / norm : x
  }
  return curve
}

/** A staircase curve: amplitude quantised to `steps` levels per half-wave. */
export function crushCurve(steps: number, samples = 1024): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(samples)
  for (let i = 0; i < samples; i++) {
    const x = (i / (samples - 1)) * 2 - 1
    curve[i] = steps > 0 ? Math.round(x * steps) / steps : x
  }
  return curve
}

/** Times (seconds) of shutter clicks across one loop of `seconds`, one per frame at `fps`. */
export function clatterTimes(fps: number, seconds: number): number[] {
  const n = Math.max(1, Math.floor(seconds * fps))
  return Array.from({ length: n }, (_, i) => i / fps)
}
