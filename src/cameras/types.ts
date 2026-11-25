import type { SrcRect } from '../engine/renderer'
import type { LookParams, RigCapability } from '../engine/look'
import type { Rng } from '../engine/rng'
import type { SceneId } from '../engine/scenes'

export type ParamValue = number | string | boolean
export type Params = Readonly<Record<string, ParamValue>>

// ---------------------------------------------------------------------------
// Body controls (rendered generically by the settings drawer)

interface ControlBase {
  key: string
  label: string
}
export interface RangeControl extends ControlBase {
  kind: 'range'
  min: number
  max: number
  step: number
  unit?: string
  detent?: number
}
export interface Option {
  value: string
  label: string
}
export interface SelectControl extends ControlBase {
  kind: 'select'
  options: readonly Option[]
}
export interface SwatchControl extends ControlBase {
  kind: 'swatch'
  options: readonly Option[]
}
export interface ToggleControl extends ControlBase {
  kind: 'toggle'
}
export interface TextControl extends ControlBase {
  kind: 'text'
  maxLength: number
  placeholder?: string
  validate?: (value: string) => string | null
}
export interface ActionControl extends ControlBase {
  kind: 'action'
}
export type Control = RangeControl | SelectControl | SwatchControl | ToggleControl | TextControl | ActionControl
export interface ControlGroup {
  title: string
  controls: readonly Control[]
}

// ---------------------------------------------------------------------------
// Geometry

export interface Margins {
  l: number
  r: number
  t: number
  b: number
}
export interface Rect {
  x: number
  y: number
  w: number
  h: number
}
/** One exposure inside a frame: where it lands and which part of which source fills it. */
export interface SlotSpec {
  /** Crop aspect (w/h); null keeps the source aspect. */
  aspect: number | null
  /** Horizontal/vertical crop position, 0 = left/top, 1 = right/bottom. */
  align: number
  /** 0 = the main source, 1 = the paired frame (half-frame frame B). */
  source: 0 | 1
}
export interface ImageSlot {
  rect: Rect
  srcRect: SrcRect
  source: 0 | 1
}
export interface Layout {
  canvasW: number
  canvasH: number
  /** Bounding box of every image slot. */
  image: Rect
  /** Crop of the first slot (kept for single-image callers). */
  srcRect: SrcRect
  slots: readonly ImageSlot[]
}

// ---------------------------------------------------------------------------
// Frames drawn by the 2D compositor

export type InstantFormat = 'sx70' | 'mini' | 'square' | 'wide'
export type PaperPattern = 'none' | 'stripes' | 'dots' | 'grid' | 'sunset'
export type SlideMount = 'card' | 'plastic'
export type FrameSpec =
  | { kind: 'none' }
  | { kind: 'print'; paper: string; border: number }
  | { kind: 'instant'; format: InstantFormat; paper: string; dark: boolean; pattern: PaperPattern }
  /** Two portrait half-frames on one strip of film, split by a dark divider. */
  | { kind: 'halfFrame'; edgeText: string }
  /** Panoramic exposure running across the 35mm sprocket holes. */
  | { kind: 'sprocket'; holes: boolean; edgeText: string }
  /** Transparency in a 50mm slide mount. */
  | { kind: 'slide'; mount: SlideMount; label: string }
  /** Medium-format negative carrier: black border with a ragged filed edge. */
  | { kind: 'negative'; seed: number }
  /**
   * Cine/video gate: optional rounded projector-gate corners, a perforation strip down the left
   * edge, a black film border, and letterbox bars (fraction of the image short edge, top+bottom).
   */
  | { kind: 'gate'; rounded: boolean; perforations: boolean; border: boolean; letterbox: number; wall?: string }

export interface CompositeInfo {
  layout: Layout
  /** 1/1000 of the image's short edge — overlays are sized in this unit. */
  unit: number
  time: number
  forExport: boolean
  seed: number
  /** Seconds since recording started, or null when not recording. */
  elapsed: number | null
}

// ---------------------------------------------------------------------------
// Camera bodies

export type CameraCategory = 'film35' | 'halfPano' | 'instant' | 'toy' | 'motion' | 'auto' | 'video'

/** Multi-shot bodies: how many frames a press captures and how they become a loop. */
export interface BurstSpec {
  /** 'wiggle' = D3D ping-pong of parallax views; 'sequence' = Golf staccato run. */
  kind: 'wiggle' | 'sequence'
  frames: number
  /** Gap between captures when shooting live, ms. */
  intervalMs: number
}
export type AccessoryId = RigCapability
export type ShutterSound = 'leaf' | 'focal-plane' | 'instant' | 'digital'

export const ALL_ACCESSORIES: readonly AccessoryId[] = ['focal', 'fisheye', 'prism', 'starburst', 'nd', 'flash', 'leak', 'manual']

export interface CameraBody {
  id: string
  /** Engraved badge on the body plate. */
  badge: string
  /** One line on what the camera is, e.g. "Warm 35mm daily film". */
  tagline: string
  category: CameraCategory
  /** Film/sensor descriptor shown in the status bar, e.g. "35mm ISO 200". */
  format: string
  /** Crop aspect (w/h). `null` keeps the source's own aspect. */
  aspect: (params: Params) => number | null
  /** Multi-exposure bodies (half-frame) describe each slot; single-image bodies omit this. */
  slots?: (params: Params) => readonly SlotSpec[]
  /** Gap between slots as a fraction of the slot's short edge. */
  slotGap?: number
  groups: readonly ControlGroup[]
  defaults: Params
  /** Colour science and optics before master intensity. */
  look: (params: Params) => Partial<LookParams>
  frame: (params: Params) => FrameSpec
  /** Supports the glowing LED date imprint (uses dateStamp/dateText/dateColor params). */
  dateStamp: boolean
  /** Extra overlay drawn last (OSD, guidelines, captions). */
  overlay?: (ctx: CanvasRenderingContext2D, params: Params, info: CompositeInfo) => void
  animated: (params: Params) => boolean
  accessories: readonly AccessoryId[]
  sampleScene: SceneId
  shutter: ShutterSound
  randomize: (params: Params, rng: Rng) => Params
  onAction?: (key: string, params: Params, rng: Rng) => Params
  /** 'video' bodies record clips; everything else takes stills. */
  medium?: 'photo' | 'video'
  /** Multi-shot motion bodies (D3D, Golf). */
  burst?: BurstSpec
}

export const num = (p: Params, key: string): number => {
  const v = p[key]
  return typeof v === 'number' ? v : Number(v) || 0
}
export const str = (p: Params, key: string): string => String(p[key] ?? '')
export const bool = (p: Params, key: string): boolean => p[key] === true
export const intensityOf = (p: Params): number => num(p, 'intensity') / 100
