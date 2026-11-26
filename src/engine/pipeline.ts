import { intensityOf, num, type CameraBody, type Layout, type Params, type SlotSpec } from '../cameras/types'
import { composite, marginsFor } from './compositor'
import { cropRect, layoutForExport, layoutToFit, type LayoutInput } from './layout'
import { applyRig, gateRig, lutTarget, mixLook, type LookParams, type Rig } from './look'
import type { CubeLut } from './lut'
import { Renderer, type RenderRequest, type SourceSlot, type SrcRect } from './renderer'

export interface SourceImage {
  id: string
  label: string
  image: TexImageSource & CanvasImageSource
  width: number
  height: number
  /** Live sources (camera) are re-uploaded every frame. */
  live?: boolean
  /** Front camera: preview is mirrored like a selfie screen. */
  mirrored?: boolean
}

export interface FrameOptions {
  time: number
  forExport: boolean
  /** Seconds since recording started (camcorder OSDs, timecode); omit when not recording. */
  elapsed?: number | null
  /** Per-frame look changes on top of the body + rig (e.g. D3D parallax view offset). */
  lookPatch?: Partial<LookParams>
}

export interface Shot {
  body: CameraBody
  params: Params
  rig: Rig
  source: SourceImage
  /** Second exposure for two-frame bodies (half-frame frame B). Falls back to `source`. */
  pair?: SourceImage | null
}

function get2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas context unavailable')
  return ctx
}

export function slotsOf(body: CameraBody, params: Params): readonly SlotSpec[] {
  return body.slots?.(params) ?? [{ aspect: body.aspect(params), align: 0.5, source: 0 }]
}

const sourceFor = (shot: Shot, slot: SourceSlot): SourceImage => (slot === 1 ? (shot.pair ?? shot.source) : shot.source)

export function layoutInput(shot: Shot): LayoutInput {
  const { body, params } = shot
  const a = sourceFor(shot, 0)
  const b = sourceFor(shot, 1)
  return {
    sources: [
      { w: a.width, h: a.height },
      { w: b.width, h: b.height },
    ],
    // A mirrored source is shown flipped, so its crop pans from the opposite edge in raw pixels.
    slots: slotsOf(body, params).map((s) => (sourceFor(shot, s.source).mirrored ? { ...s, align: 1 - s.align } : s)),
    gap: body.slotGap ?? 0,
    margins: marginsFor(body.frame(params)),
  }
}

export const seedOf = (params: Params): number => num(params, 'seed') || 7

/** Front camera: mirror in the GPU sampling so HUD text and frames stay readable. */
const mirrorRect = (r: SrcRect, mirrored?: boolean): SrcRect => (mirrored ? [r[0] + r[2], r[1], -r[2], r[3]] : r)

/**
 * Orchestrates the hybrid pipeline: the 3-pass GPU renderer develops each exposure into its
 * slot, then the 2D compositor lays down paper, frames, LED dates and HUD overlays.
 */
export class Pipeline {
  readonly renderer: Renderer
  private uploaded: (string | null)[] = [null, null]

  constructor() {
    this.renderer = new Renderer()
  }

  get maxSize(): number {
    return this.renderer.maxSize
  }

  private ensureUploaded(slot: SourceSlot, source: SourceImage): void {
    if (source.live && source.image instanceof HTMLVideoElement && source.image.readyState < 2) return
    if (source.live || source.id !== this.uploaded[slot]) {
      this.renderer.upload(slot, source.image, source.width, source.height, !source.live)
      this.uploaded[slot] = this.renderer.isLost ? null : source.id
    }
  }

  /** Load (or with null, remove) the custom grade used by every body's film pass. */
  setLut(lut: CubeLut | null): void {
    this.renderer.setLut(lut)
  }

  previewLayout(shot: Shot, maxW: number, maxH: number): Layout {
    return layoutToFit(layoutInput(shot), Math.min(maxW, this.maxSize * 2), Math.min(maxH, this.maxSize))
  }

  exportLayout(shot: Shot): Layout {
    return layoutForExport(layoutInput(shot), this.maxSize)
  }

  render(target: HTMLCanvasElement, shot: Shot, layout: Layout, opts: FrameOptions): void {
    const { body, params, rig } = shot
    if (target.width !== layout.canvasW) target.width = layout.canvasW
    if (target.height !== layout.canvasH) target.height = layout.canvasH
    const ctx = get2d(target)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    ctx.clearRect(0, 0, target.width, target.height)

    const seed = seedOf(params)
    const gated = gateRig(rig, body.accessories, layout.slots.length > 1)
    const graded = { ...body.look(params), ...lutTarget(gated) }
    const look: LookParams = { ...applyRig(mixLook(graded, intensityOf(params)), gated, seed), ...opts.lookPatch }
    // Double exposure: the paired frame becomes the second exposure on single-frame bodies.
    const doubleSrc = gated.double && shot.pair ? shot.pair : null
    look.double = doubleSrc ? 1 : 0
    let second: RenderRequest['second']
    if (doubleSrc) {
      this.ensureUploaded(1, doubleSrc)
      const slot0 = layout.slots[0].rect
      second = { slot: 1, srcRect: mirrorRect(cropRect(doubleSrc.width, doubleSrc.height, slot0.w / slot0.h), doubleSrc.mirrored) }
    }
    const info = { layout, unit: Math.min(layout.slots[0].rect.w, layout.slots[0].rect.h) / 1000, time: opts.time, forExport: opts.forExport, seed, elapsed: opts.elapsed ?? null }
    composite(ctx, body, params, info, (i) => {
      const slot = layout.slots[i]
      const source = sourceFor(shot, slot.source)
      this.ensureUploaded(slot.source, source)
      return this.renderer.render({
        slot: slot.source,
        look,
        width: slot.rect.w,
        height: slot.rect.h,
        srcRect: mirrorRect(slot.srcRect, source.mirrored),
        seed: seed + i * 131,
        time: opts.time,
        second,
      })
    })
  }

  /** "Before" view: the same canvas with the untouched crops dropped into each slot. */
  renderBefore(target: HTMLCanvasElement, after: HTMLCanvasElement, shot: Shot, layout: Layout): void {
    if (target.width !== after.width) target.width = after.width
    if (target.height !== after.height) target.height = after.height
    const ctx = get2d(target)
    ctx.clearRect(0, 0, target.width, target.height)
    ctx.drawImage(after, 0, 0)
    for (const slot of layout.slots) {
      const source = sourceFor(shot, slot.source)
      const [sx, sy, sw, sh] = slot.srcRect
      const { x, y, w, h } = slot.rect
      ctx.save()
      if (source.mirrored) {
        ctx.translate(x * 2 + w, 0)
        ctx.scale(-1, 1)
      }
      ctx.drawImage(source.image, sx * source.width, sy * source.height, sw * source.width, sh * source.height, x, y, w, h)
      ctx.restore()
    }
  }
}
