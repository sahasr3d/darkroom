/**
 * Burst bodies (D3D, Golf). Loaded on demand with `import()` the first time a burst fires, so
 * the GIF encoder and loop recorder stay out of the initial bundle.
 */
import { loopDelayOf, loopOutputOf, parallaxOf, wantsContactSheet } from '../cameras/bodies/motion'
import { captureBurst, contactSheet, developBurst, encodeGif, encodeLoopVideo, playOrder } from '../engine/burst'
import type { Pipeline, Shot, SourceImage } from '../engine/pipeline'
import { extensionFor } from '../engine/recorder'
import { slug, stamp } from './naming'
import type { Keep, KeepItem } from './roll/keep'
import { thumbnailFromCanvas } from './roll/thumbnail'
import { snapshotOf } from './snapshot'

/** Long edge of developed burst frames before GIF scaling. */
const BURST_MAX_EDGE = 960

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('The contact sheet could not be encoded.'))), 'image/png'))
}

/**
 * One press of a burst body: capture, develop, and keep the loop (GIF and/or video) plus the
 * Golf contact sheet through the exposure sink. Returns a human summary for the status line.
 */
export async function runBurst(pipeline: Pipeline, shot: Shot, grab: (() => SourceImage | null) | null, keep: Keep): Promise<string> {
  const spec = shot.body.burst
  if (!spec) return ''
  const frames = await captureBurst(spec, grab, shot.source)
  const developed = developBurst(pipeline, shot, frames, spec, parallaxOf(shot.params), BURST_MAX_EDGE, !grab)
  const order = playOrder(spec, developed.length)
  const delay = loopDelayOf(shot.params)
  const output = loopOutputOf(shot.params)
  const base = `${slug(shot.body.badge)}-${stamp()}`
  const { width, height } = developed[0]
  const snapshot = snapshotOf(shot)
  const thumb = await thumbnailFromCanvas(developed[0])
  const items: KeepItem[] = []

  if (output === 'gif' || output === 'both') {
    const blob = await encodeGif(developed, order, delay)
    items.push({ kind: 'gif', blob, width, height, filename: `${base}.gif`, snapshot, thumb })
  }
  let videoProblem = ''
  if (output === 'video' || output === 'both') {
    try {
      const clip = await encodeLoopVideo(developed, order, delay)
      items.push({ kind: 'video', blob: clip.blob, width, height, filename: `${base}.${extensionFor(clip.mimeType)}`, snapshot, thumb })
    } catch (err: unknown) {
      // Keep whatever already developed (the GIF); report the video separately.
      if (items.length === 0 && output === 'video') throw err
      videoProblem = ` The video version failed: ${err instanceof Error ? err.message : 'unknown error'}`
    }
  }
  if (spec.kind === 'sequence' && wantsContactSheet(shot.params)) {
    const sheet = contactSheet(developed)
    items.push({ kind: 'sheet', blob: await canvasBlob(sheet), width: sheet.width, height: sheet.height, filename: `${base}-sheet.png`, snapshot, thumb: await thumbnailFromCanvas(sheet) })
    sheet.width = 0
  }
  developed.forEach((c) => {
    c.width = 0
  })
  const summary = await keep(items)
  return `${summary} ${frames.length} frames.${videoProblem}`
}
