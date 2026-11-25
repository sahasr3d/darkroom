import type { SourceImage } from './pipeline'
import { renderScene, SCENES, type SceneId } from './scenes'

export const MAX_UPLOAD_BYTES = 60 * 1024 * 1024
/** Decoded-size ceiling (~100 MP ≈ 400 MB RGBA) — a tiny file can still expand into gigabytes. */
export const MAX_UPLOAD_PIXELS = 100_000_000
const ACCEPTED = /^image\/(png|jpe?g|webp|gif|bmp|avif|heic|heif)$/i

export const MAX_VIDEO_BYTES = 500 * 1024 * 1024
const VIDEO_ACCEPTED = /^video\//i

export const isVideoFile = (file: File): boolean => VIDEO_ACCEPTED.test(file.type)

/**
 * Open a video from disk as a playing, looping, muted source. It is treated as `live`, so the
 * pipeline re-uploads every frame. Call `releaseVideoSource` when it is replaced.
 */
export async function videoFileSource(file: File): Promise<SourceImage> {
  if (file.size > MAX_VIDEO_BYTES) throw new Error(`“${file.name}” is over 500 MB. Trim it and import again.`)
  const url = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.muted = true
  video.loop = true
  video.playsInline = true
  video.preload = 'auto'
  video.src = url
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve()
      video.onerror = () => reject(new Error(`“${file.name}” couldn't be played. Use MP4 (H.264) or WebM.`))
    })
    await video.play()
  } catch (err: unknown) {
    URL.revokeObjectURL(url)
    throw err instanceof Error ? err : new Error(`“${file.name}” couldn't be played.`)
  }
  return { id: `video-${file.name}-${file.size}-${file.lastModified}`, label: file.name, image: video, width: video.videoWidth, height: video.videoHeight, live: true }
}

/** Stop an imported video and free its object URL. */
export function releaseVideoSource(src: SourceImage | null): void {
  const v = src?.image
  if (!(v instanceof HTMLVideoElement) || !v.src.startsWith('blob:')) return
  v.pause()
  URL.revokeObjectURL(v.src)
  v.removeAttribute('src')
  v.load()
}

export function sceneSource(id: SceneId): SourceImage {
  const canvas = renderScene(id)
  const label = SCENES.find((s) => s.id === id)?.label ?? id
  return { id: `scene-${id}`, label, image: canvas, width: canvas.width, height: canvas.height }
}

/** Downscale anything larger than the GPU can sample in one texture. */
function fitToGpu(bitmap: ImageBitmap, maxEdge: number): { image: TexImageSource & CanvasImageSource; width: number; height: number } {
  const longest = Math.max(bitmap.width, bitmap.height)
  if (longest <= maxEdge) return { image: bitmap, width: bitmap.width, height: bitmap.height }
  try {
    const s = maxEdge / longest
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * s)
    canvas.height = Math.round(bitmap.height * s)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2D canvas unavailable')
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    return { image: canvas, width: canvas.width, height: canvas.height }
  } finally {
    bitmap.close()
  }
}

/** Read pixel dimensions from the header via an <img> load, before committing to a full bitmap decode. */
function probeSize(file: File): Promise<[number, number]> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve([img.naturalWidth, img.naturalHeight])
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error(`“${file.name}” couldn't be decoded. It may be damaged or in an unsupported format.`))
    }
    img.src = url
  })
}

export async function fileSource(file: File, maxEdge: number): Promise<SourceImage> {
  if (!ACCEPTED.test(file.type)) throw new Error(`“${file.name}” isn't a photo this browser can open. Use JPG, PNG, WebP or AVIF.`)
  if (file.size > MAX_UPLOAD_BYTES) throw new Error(`“${file.name}” is over 60 MB. Export a smaller copy and drop it in again.`)
  const [w, h] = await probeSize(file)
  if (w * h > MAX_UPLOAD_PIXELS) {
    throw new Error(`“${file.name}” is ${w}×${h} pixels, over the 100-megapixel limit. Export a smaller copy and drop it in again.`)
  }
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new Error(`“${file.name}” couldn't be decoded. It may be damaged or in an unsupported format.`)
  }
  const fitted = fitToGpu(bitmap, maxEdge)
  return { id: `upload-${file.name}-${file.size}-${file.lastModified}`, label: file.name, ...fitted }
}
