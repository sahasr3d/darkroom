/**
 * Burst bodies (D3D, Golf). Loaded on demand with `import()` the first time a burst fires, so
 * the GIF encoder and loop recorder stay out of the initial bundle.
 */
import { loopDelayOf, loopOutputOf, parallaxOf, wantsContactSheet } from '../cameras/bodies/motion'
import { captureBurst, contactSheet, developBurst, encodeGif, encodeLoopVideo, playOrder } from '../engine/burst'
import { download } from '../engine/exporter'
import type { Pipeline, Shot, SourceImage } from '../engine/pipeline'
import { extensionFor } from '../engine/recorder'
import { slug, stamp } from './naming'

/** Long edge of developed burst frames before GIF scaling. */
const BURST_MAX_EDGE = 960

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('The contact sheet could not be encoded.'))), 'image/png'))
}

/**
 * One press of a burst body: capture, develop, and save the loop (GIF and/or video) plus the
 * Golf contact sheet. Returns a human summary for the status line.
 */
export async function runBurst(pipeline: Pipeline, shot: Shot, grab: (() => SourceImage | null) | null): Promise<string> {
  const spec = shot.body.burst
  if (!spec) return ''
  const frames = await captureBurst(spec, grab, shot.source)
  const developed = developBurst(pipeline, shot, frames, spec, parallaxOf(shot.params), BURST_MAX_EDGE, !grab)
  const order = playOrder(spec, developed.length)
  const delay = loopDelayOf(shot.params)
  const output = loopOutputOf(shot.params)
  const base = `${slug(shot.body.badge)}-${stamp()}`
  const { width, height } = developed[0]
  const saved: string[] = []

  if (output === 'gif' || output === 'both') {
    const blob = await encodeGif(developed, order, delay)
    download({ blob, width, height, filename: `${base}.gif` })
    saved.push(`${base}.gif`)
  }
  let videoProblem = ''
  if (output === 'video' || output === 'both') {
    try {
      const clip = await encodeLoopVideo(developed, order, delay)
      download({ blob: clip.blob, width, height, filename: `${base}.${extensionFor(clip.mimeType)}` })
      saved.push(`${base}.${extensionFor(clip.mimeType)}`)
    } catch (err: unknown) {
      // Keep whatever already saved (the GIF); report the video separately.
      if (saved.length === 0 && output === 'video') throw err
      videoProblem = ` The video version failed: ${err instanceof Error ? err.message : 'unknown error'}`
    }
  }
  if (spec.kind === 'sequence' && wantsContactSheet(shot.params)) {
    const sheet = contactSheet(developed)
    download({ blob: await canvasBlob(sheet), width: sheet.width, height: sheet.height, filename: `${base}-sheet.png` })
    saved.push(`${base}-sheet.png`)
    sheet.width = 0
  }
  developed.forEach((c) => {
    c.width = 0
  })
  return `Saved ${saved.join(', ')} (${frames.length} frames).${videoProblem}`
}
