import { bool, str, type CameraBody, type CompositeInfo, type FrameSpec, type InstantFormat, type Margins, type Params } from '../cameras/types'
import { drawInsetShadow, drawPaper } from './draw2d'
import {
  drawHalfFrameForeground,
  drawNegativeForeground,
  drawPaperPattern,
  drawSlideBackground,
  drawSlideForeground,
  drawSprocketForeground,
  SLIDE_MARGINS,
} from './overlays/frames'
import { drawLedDate, type LedColor } from './overlays/ledDate'
import { drawGateForeground } from './overlays/video'

/**
 * Pass 2D — paper and frames behind the photo, then frame details, LED date and body
 * overlays on top. Every size is expressed in `info.unit` (1/1000 of the image short edge).
 */

/** Real instant-film proportions, as fractions of the image's short edge. */
export const INSTANT_FORMATS: Record<InstantFormat, { aspect: number; margins: Margins; label: string }> = {
  sx70: { aspect: 1, margins: { l: 0.057, r: 0.057, t: 0.066, b: 0.29 }, label: 'Integral square' },
  mini: { aspect: 46 / 62, margins: { l: 0.087, r: 0.087, t: 0.152, b: 0.37 }, label: 'Mini' },
  square: { aspect: 1, margins: { l: 0.081, r: 0.081, t: 0.113, b: 0.274 }, label: 'Square' },
  wide: { aspect: 99 / 62, margins: { l: 0.073, r: 0.073, t: 0.113, b: 0.274 }, label: 'Wide' },
}

const NO_MARGINS: Margins = { l: 0, r: 0, t: 0, b: 0 }
const uniform = (m: number): Margins => ({ l: m, r: m, t: m, b: m })

export function marginsFor(frame: FrameSpec): Margins {
  switch (frame.kind) {
    case 'none':
      return NO_MARGINS
    case 'print':
      return uniform(frame.border)
    case 'instant':
      return INSTANT_FORMATS[frame.format].margins
    case 'halfFrame':
      return { l: 0.05, r: 0.05, t: 0.06, b: 0.11 }
    case 'sprocket':
      return uniform(0.015)
    case 'slide':
      return SLIDE_MARGINS
    case 'negative':
      return uniform(0.07)
    case 'gate': {
      const b = frame.border ? 0.035 : 0
      return { l: b, r: b, t: b + frame.letterbox, b: b + frame.letterbox }
    }
  }
}

export function drawFrameBackground(ctx: CanvasRenderingContext2D, frame: FrameSpec, info: CompositeInfo): void {
  const { canvasW, canvasH } = info.layout
  switch (frame.kind) {
    case 'instant':
      drawPaper(ctx, canvasW, canvasH, frame.paper, info.unit, frame.dark ? 0.35 : 0.55)
      if (frame.pattern !== 'none') {
        drawPaperPattern(ctx, canvasW, canvasH, frame.pattern, info.unit)
        drawPaper(ctx, 0, 0, frame.paper, info.unit, 0)
      }
      return
    case 'print':
      drawPaper(ctx, canvasW, canvasH, frame.paper, info.unit, 0.4)
      return
    case 'slide':
      drawSlideBackground(ctx, info, frame.mount)
      return
    case 'halfFrame':
      ctx.fillStyle = '#0d0b09'
      ctx.fillRect(0, 0, canvasW, canvasH)
      return
    case 'gate':
      ctx.fillStyle = frame.wall ?? '#000'
      ctx.fillRect(0, 0, canvasW, canvasH)
      return
    default:
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, canvasW, canvasH)
  }
}

export function drawFrameForeground(ctx: CanvasRenderingContext2D, frame: FrameSpec, info: CompositeInfo): void {
  const img = info.layout.image
  switch (frame.kind) {
    case 'instant':
      drawInsetShadow(ctx, img, info.unit, frame.dark)
      return
    case 'print':
      ctx.save()
      ctx.strokeStyle = 'rgba(60,50,35,0.25)'
      ctx.lineWidth = Math.max(1, info.unit)
      ctx.strokeRect(img.x, img.y, img.w, img.h)
      ctx.restore()
      return
    case 'halfFrame':
      drawHalfFrameForeground(ctx, info, frame.edgeText)
      return
    case 'sprocket':
      drawSprocketForeground(ctx, info, frame.holes, frame.edgeText)
      return
    case 'slide':
      drawSlideForeground(ctx, info, frame.mount, frame.label)
      return
    case 'negative':
      drawNegativeForeground(ctx, info, frame.seed)
      return
    case 'gate':
      drawGateForeground(ctx, info, frame.rounded, frame.perforations, frame.wall ?? '#000')
      return
  }
}

export function drawDateStamp(ctx: CanvasRenderingContext2D, params: Params, info: CompositeInfo): void {
  const text = str(params, 'dateText').trim()
  if (!bool(params, 'dateStamp') || !text) return
  const img = info.layout.slots[info.layout.slots.length - 1]?.rect ?? info.layout.image
  const u = info.unit
  const color: LedColor = str(params, 'dateColor') === 'red' ? 'red' : 'orange'
  drawLedDate(ctx, text, img.x + img.w - 52 * u, img.y + img.h - 44 * u, 40 * u, color)
}

/**
 * Full Pass-2D composite. `developSlot` returns the GPU-developed image for one slot; it is
 * called once per slot, in order, right before that slot is drawn (the GPU canvas is reused).
 */
export function composite(ctx: CanvasRenderingContext2D, body: CameraBody, params: Params, info: CompositeInfo, developSlot: (index: number) => CanvasImageSource): void {
  const frame = body.frame(params)
  drawFrameBackground(ctx, frame, info)
  info.layout.slots.forEach((slot, i) => {
    ctx.drawImage(developSlot(i), slot.rect.x, slot.rect.y, slot.rect.w, slot.rect.h)
  })
  drawFrameForeground(ctx, frame, info)
  if (body.dateStamp) drawDateStamp(ctx, params, info)
  body.overlay?.(ctx, params, info)
}
