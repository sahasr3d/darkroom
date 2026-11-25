import { useCallback, useEffect, useRef, useState } from 'react'
import { loopDelayOf, loopOutputOf, parallaxOf, wantsContactSheet } from '../cameras/bodies/motion'
import { fpsOf } from '../cameras/bodies/video'
import { captureBurst, contactSheet, developBurst, encodeGif, encodeLoopVideo, playOrder } from '../engine/burst'
import { download, type ExportResult } from '../engine/exporter'
import type { Pipeline, Shot, SourceImage } from '../engine/pipeline'
import { extensionFor, startRecording, type RecordingResult, type RecordingSession } from '../engine/recorder'

/** Long edge of recorded clips: 720p-class keeps 30 fps rendering comfortable on phones. */
export const RECORD_MAX_EDGE = 1280
/** Long edge of developed burst frames before GIF scaling. */
const BURST_MAX_EDGE = 960

const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const stamp = (): string => new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('The contact sheet could not be encoded.'))), 'image/png'))
}

export interface VideoRecorder {
  /** performance.now() when recording began, or null. */
  since: number | null
  start: () => void
  stop: () => void
}

/**
 * Records the current shot through the pipeline at the body's frame rate. `getShot` is read on
 * every frame, so grading changes made while rolling land in the clip.
 */
export function useVideoRecorder(pipeline: Pipeline | null, getShot: () => Shot | null, onSaved: (message: string) => void, onError: (message: string) => void): VideoRecorder {
  const [since, setSince] = useState<number | null>(null)
  const session = useRef<RecordingSession | null>(null)
  const meta = useRef<{ badge: string; fps: number; w: number; h: number } | null>(null)

  /** Clear the session exactly once; a second caller (auto-stop racing a manual stop) finds nothing. */
  const finish = useCallback((): { badge: string; fps: number; w: number; h: number } | null => {
    const m = meta.current
    meta.current = null
    session.current = null
    setSince(null)
    return m
  }, [])

  const save = useCallback(
    (r: RecordingResult) => {
      const m = finish()
      if (!m) return
      const result: ExportResult = { blob: r.blob, width: m.w, height: m.h, filename: `${slug(m.badge)}-${stamp()}.${extensionFor(r.mimeType)}` }
      download(result)
      onSaved(`Saved ${result.filename} (${r.seconds.toFixed(1)}s, ${m.fps} fps, ${m.w}×${m.h}).`)
    },
    [onSaved, finish],
  )

  const fail = useCallback(
    (err: unknown) => {
      if (!finish()) return
      onError(err instanceof Error ? err.message : 'The recording could not be saved.')
    },
    [finish, onError],
  )

  const start = useCallback(() => {
    const shot = getShot()
    if (!pipeline || !shot || session.current) return
    const fps = fpsOf(shot.params)
    // Layout is fixed for the whole clip: the recorder canvas cannot change size mid-stream.
    const layout = pipeline.previewLayout(shot, RECORD_MAX_EDGE, RECORD_MAX_EDGE)
    const canvas = document.createElement('canvas')
    const video = shot.source.image
    if (video instanceof HTMLVideoElement && video.src.startsWith('blob:')) video.currentTime = 0
    meta.current = { badge: shot.body.badge, fps, w: layout.canvasW, h: layout.canvasH }
    const sourceId = shot.source.id
    try {
      const s = startRecording({
        canvas,
        fps,
        drawFrame: (t) => {
          const current = getShot()
          // The layout was fixed for this source; a new source (scene, import, camera) ends the clip.
          if (current && current.source.id !== sourceId) {
            void session.current?.stop().then(save, fail)
            return
          }
          pipeline.render(canvas, current && current.body.id === shot.body.id ? current : shot, layout, { time: t, forExport: false, elapsed: t })
        },
        onAutoStop: save,
        onAutoStopError: fail,
      })
      session.current = s
      setSince(performance.now())
    } catch (err: unknown) {
      meta.current = null
      onError(err instanceof Error ? err.message : 'Recording could not start.')
    }
  }, [pipeline, getShot, save, fail, onError])

  const stop = useCallback(() => {
    session.current?.stop().then(save, fail)
  }, [save, fail])

  useEffect(
    () => () => {
      session.current?.stop().catch(() => undefined)
    },
    [],
  )

  return { since, start, stop }
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
    const blob = encodeGif(developed, order, delay)
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
