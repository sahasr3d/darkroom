/** Small JPEG thumbnails for the camera-roll grid. */

const THUMB_EDGE = 320
const THUMB_QUALITY = 0.8

function encode(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('The thumbnail could not be encoded.'))), type, quality))
}

function drawScaled(source: CanvasImageSource, w: number, h: number): HTMLCanvasElement {
  const s = Math.min(1, THUMB_EDGE / Math.max(w, h))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(w * s))
  canvas.height = Math.max(1, Math.round(h * s))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas unavailable')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  return canvas
}

/** Thumbnail of whatever a canvas shows right now (burst frames, the recorder's last frame). */
export async function thumbnailFromCanvas(source: HTMLCanvasElement): Promise<Blob | null> {
  if (!source.width || !source.height) return null
  try {
    const canvas = drawScaled(source, source.width, source.height)
    const blob = await encode(canvas, 'image/jpeg', THUMB_QUALITY)
    canvas.width = 0
    return blob
  } catch {
    return null
  }
}

/** Thumbnail of an image file (PNG, JPEG, the first frame of a GIF); null if it cannot be decoded. */
export async function thumbnailFromImage(blob: Blob): Promise<Blob | null> {
  try {
    const bitmap = await createImageBitmap(blob)
    try {
      const canvas = drawScaled(bitmap, bitmap.width, bitmap.height)
      const out = await encode(canvas, 'image/jpeg', THUMB_QUALITY)
      canvas.width = 0
      return out
    } finally {
      bitmap.close()
    }
  } catch {
    return null
  }
}
