import { useCallback, useEffect, useRef, useState } from 'react'
import { fpsOf } from '../cameras/bodies/video'
import type { RecordingAudio } from '../engine/audio/capture'
import { download, type ExportResult } from '../engine/exporter'
import type { Pipeline, Shot } from '../engine/pipeline'
import type { RecordingResult, RecordingSession } from '../engine/recorder'
import { slug, stamp } from './naming'

/** Long edge of recorded clips: 720p-class keeps 30 fps rendering comfortable on phones. */
export const RECORD_MAX_EDGE = 1280

export interface VideoRecorder {
  /** performance.now() when recording began, or null. */
  since: number | null
  /** Start rolling; `sound` adds the microphone or the imported video's audio through the body's sound chain. */
  start: (sound: boolean) => Promise<void>
  stop: () => void
}

interface ClipMeta {
  badge: string
  fps: number
  w: number
  h: number
  extensionFor: (mime: string) => string
  audio: RecordingAudio | null
}

const errorText = (err: unknown, fallback: string): string => (err instanceof Error ? err.message : fallback)

/**
 * Records the current shot through the pipeline at the body's frame rate. `getShot` is read on
 * every frame, so grading changes made while rolling land in the clip. The recorder and the sound
 * chain are loaded on the first recording, keeping them out of the initial bundle.
 */
export function useVideoRecorder(pipeline: Pipeline | null, getShot: () => Shot | null, onStatus: (message: string) => void): VideoRecorder {
  const [since, setSince] = useState<number | null>(null)
  const session = useRef<RecordingSession | null>(null)
  const meta = useRef<ClipMeta | null>(null)
  const starting = useRef(false)

  /** Clear the session exactly once; a second caller (auto-stop racing a manual stop) finds nothing. */
  const finish = useCallback((): ClipMeta | null => {
    const m = meta.current
    meta.current = null
    session.current = null
    m?.audio?.release()
    setSince(null)
    return m
  }, [])

  const save = useCallback(
    (r: RecordingResult) => {
      const m = finish()
      if (!m) return
      const result: ExportResult = { blob: r.blob, width: m.w, height: m.h, filename: `${slug(m.badge)}-${stamp()}.${m.extensionFor(r.mimeType)}` }
      download(result)
      onStatus(`Saved ${result.filename} (${r.seconds.toFixed(1)}s, ${m.fps} fps, ${m.w}×${m.h}).`)
    },
    [onStatus, finish],
  )

  const fail = useCallback(
    (err: unknown) => {
      if (!finish()) return
      onStatus(errorText(err, 'The recording could not be saved.'))
    },
    [finish, onStatus],
  )

  const start = useCallback(
    async (sound: boolean) => {
      if (!pipeline || !getShot() || session.current || starting.current) return
      starting.current = true
      let audio: RecordingAudio | null = null
      try {
        const [rec, capture] = await Promise.all([import('../engine/recorder'), sound ? import('../engine/audio/capture') : null])
        const shot = getShot()
        if (!shot) return
        const fps = fpsOf(shot.params)
        // Layout is fixed for the whole clip: the recorder canvas cannot change size mid-stream.
        const layout = pipeline.previewLayout(shot, RECORD_MAX_EDGE, RECORD_MAX_EDGE)
        const canvas = document.createElement('canvas')
        const video = shot.source.image
        if (video instanceof HTMLVideoElement && video.src.startsWith('blob:')) video.currentTime = 0
        audio = capture ? await capture.openRecordingAudio({ image: video, bodyId: shot.body.id, fps }) : null
        const sourceId = shot.source.id
        meta.current = { badge: shot.body.badge, fps, w: layout.canvasW, h: layout.canvasH, extensionFor: rec.extensionFor, audio }
        session.current = rec.startRecording({
          canvas,
          fps,
          audioTrack: audio?.track,
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
        setSince(performance.now())
        onStatus(`Rolling at ${fps} fps${audio?.note ?? ''}. Press again to stop.`)
      } catch (err: unknown) {
        audio?.release()
        meta.current = null
        session.current = null
        onStatus(errorText(err, 'Recording could not start.'))
      } finally {
        starting.current = false
      }
    },
    [pipeline, getShot, save, fail, onStatus],
  )

  const stop = useCallback(() => {
    session.current?.stop().then(save, fail)
  }, [save, fail])

  useEffect(
    () => () => {
      const audio = meta.current?.audio
      session.current
        ?.stop()
        .catch(() => undefined)
        .finally(() => audio?.release())
    },
    [],
  )

  return { since, start, stop }
}
