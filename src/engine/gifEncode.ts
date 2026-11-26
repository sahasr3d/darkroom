import { applyPalette, GIFEncoder, quantize } from 'gifenc'

/** One RGBA frame, as plain data so it can cross into a worker. */
export interface RgbaFrame {
  data: Uint8ClampedArray<ArrayBuffer>
  width: number
  height: number
}

/** Encode frames (in `order`) as a looping GIF; each frame gets its own 256-colour palette. */
export function encodeGifBytes(frames: readonly RgbaFrame[], order: readonly number[], delayMs: number): Uint8Array<ArrayBuffer> {
  const gif = GIFEncoder()
  order.forEach((idx, n) => {
    const img = frames[idx]
    const palette = quantize(img.data, 256)
    gif.writeFrame(applyPalette(img.data, palette), img.width, img.height, { palette, delay: delayMs, repeat: n === 0 ? 0 : undefined })
  })
  gif.finish()
  return gif.bytes().slice()
}
