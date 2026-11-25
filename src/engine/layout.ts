import type { SrcRect } from './renderer'
import type { ImageSlot, Layout, Margins, Rect, SlotSpec } from '../cameras/types'

export interface SourceDims {
  w: number
  h: number
}

/**
 * Geometry input for one exposure. A frame has one or more image slots laid out side by side
 * at a shared height (the half-frame diptych has two); `gap` and `margins` are fractions of
 * the first slot's short edge.
 */
export interface LayoutInput {
  sources: readonly SourceDims[]
  slots: readonly SlotSpec[]
  gap: number
  margins: Margins
}

/** Hard ceiling on exported canvas area (≈ 50 MP) to stay inside browser canvas limits. */
export const MAX_CANVAS_AREA = 50_000_000

/** Crop of the source to `aspect` (w/h). `align` slides the crop window from left/top (0) to right/bottom (1). */
export function cropRect(srcW: number, srcH: number, aspect: number | null, align = 0.5): SrcRect {
  if (!aspect) return [0, 0, 1, 1]
  const srcAspect = srcW / srcH
  if (Math.abs(srcAspect - aspect) < 1e-6) return [0, 0, 1, 1]
  const a = Math.min(1, Math.max(0, align))
  if (srcAspect > aspect) {
    const w = aspect / srcAspect
    return [(1 - w) * a, 0, w, 1]
  }
  const h = srcAspect / aspect
  return [0, (1 - h) * a, 1, h]
}

const dimsOf = (input: LayoutInput, slot: SlotSpec): SourceDims => input.sources[slot.source] ?? input.sources[0]

/** Layout at a given scale: `scale` multiplies the first slot's cropped native pixel size. */
export function layoutAtScale(input: LayoutInput, scale: number): Layout {
  const crops = input.slots.map((slot) => {
    const d = dimsOf(input, slot)
    const srcRect = cropRect(d.w, d.h, slot.aspect, slot.align)
    return { slot, srcRect, aspect: (d.w * srcRect[2]) / (d.h * srcRect[3]) }
  })
  const first = crops[0]
  const d0 = dimsOf(input, first.slot)
  const h = Math.max(1, Math.round(d0.h * first.srcRect[3] * scale))
  const widths = crops.map((c) => Math.max(1, Math.round(h * c.aspect)))
  const base = Math.min(widths[0], h)
  const gap = Math.round(input.gap * base)
  const m = input.margins
  const l = Math.round(m.l * base)
  const r = Math.round(m.r * base)
  const t = Math.round(m.t * base)
  const b = Math.round(m.b * base)

  let x = l
  const slots: ImageSlot[] = crops.map((c, i) => {
    const rect: Rect = { x, y: t, w: widths[i], h }
    x += widths[i] + gap
    return { rect, srcRect: c.srcRect, source: c.slot.source }
  })
  const totalW = widths.reduce((s, w) => s + w, 0) + gap * (widths.length - 1)
  return {
    canvasW: totalW + l + r,
    canvasH: h + t + b,
    image: { x: l, y: t, w: totalW, h },
    srcRect: first.srcRect,
    slots,
  }
}

/** Largest layout whose canvas fits inside maxW × maxH (never upscales past 1:1 × upscaleCap). */
export function layoutToFit(input: LayoutInput, maxW: number, maxH: number, upscaleCap = 1): Layout {
  const unit = layoutAtScale(input, 1)
  const scale = Math.min(maxW / unit.canvasW, maxH / unit.canvasH, upscaleCap)
  return layoutAtScale(input, scale)
}

/** Native-resolution export layout, clamped by GPU texture size (per slot) and total canvas area. */
export function layoutForExport(input: LayoutInput, maxImageEdge: number): Layout {
  const native = layoutAtScale(input, 1)
  const largestSlot = Math.max(...native.slots.map((s) => Math.max(s.rect.w, s.rect.h)))
  const edgeScale = maxImageEdge / largestSlot
  const areaScale = Math.sqrt(MAX_CANVAS_AREA / (native.canvasW * native.canvasH))
  return layoutAtScale(input, Math.min(1, edgeScale, areaScale))
}
