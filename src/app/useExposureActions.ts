import { useCallback, useEffect, useRef, useState } from 'react'
import { fpsOf } from '../cameras/bodies/video'
import type { CameraBody, Params } from '../cameras/types'
import { exportOriginal, exportPng, exportStory } from '../engine/exporter'
import { formatCounter } from '../engine/overlays/video'
import type { Pipeline, Shot, SourceImage } from '../engine/pipeline'
import { playShutter } from '../engine/shutterSound'
import type { Aids } from './aids'
import { useSelfTimer } from './hooks'
import type { Keep } from './roll/keep'
import { snapshotOf } from './snapshot'
import { errorText } from './useSources'
import { useVideoRecorder, type VideoRecorder } from './useVideoRecorder'

export type Busy = 'png' | 'story' | null

interface Options {
  pipeline: Pipeline | null
  shot: Shot | null
  body: CameraBody
  params: Params
  aids: Aids
  live: boolean
  /** The source is moving (live camera or imported video): bursts grab frames from it. */
  sourceLive: boolean
  liveFrame: () => SourceImage | null
  multiFrame: boolean
  doubleActive: boolean
  twoExposures: boolean
  pendingA: SourceImage | null
  setFrameA: (frame: SourceImage | null) => void
  keep: Keep
  onStatus: (message: string) => void
}

export interface ExposureActions {
  busy: Busy
  shots: number
  exposureKey: number
  recorder: VideoRecorder
  countdown: number | null
  onShutter: () => void
  runExport: (kind: 'png' | 'story', target: Shot) => Promise<void>
  takeLabel: string
  finderBadge: string | null
}

/** Everything a press of the shutter (or an export key) does, and the labels that describe it. */
export function useExposureActions(o: Options): ExposureActions {
  const { pipeline, shot, body, keep, onStatus } = o
  const [busy, setBusy] = useState<Busy>(null)
  const [shots, setShots] = useState(0)
  const [exposureKey, setExposureKey] = useState(0)

  // Video recording reads the latest shot every frame, so grading tweaks while rolling land in the clip.
  const shotRef = useRef<Shot | null>(null)
  useEffect(() => {
    shotRef.current = shot
  }, [shot])
  const getShot = useCallback(() => shotRef.current, [])
  const recorder = useVideoRecorder(pipeline, getShot, onStatus, keep)
  const [recElapsed, setRecElapsed] = useState(0)
  useEffect(() => {
    const since = recorder.since
    if (since === null) return
    const id = window.setInterval(() => setRecElapsed((performance.now() - since) / 1000), 250)
    return () => {
      window.clearInterval(id)
      setRecElapsed(0)
    }
  }, [recorder.since])

  const runExport = async (kind: 'png' | 'story', target: Shot) => {
    if (!pipeline) return
    setBusy(kind)
    await new Promise((r) => setTimeout(r, 16))
    try {
      const result = kind === 'png' ? await exportPng(pipeline, target) : await exportStory(pipeline, target)
      const original = await exportOriginal(target)
      const summary = await keep([{ kind: 'photo', ...result, snapshot: snapshotOf(target), original }])
      onStatus(`${summary} ${result.width}×${result.height}.`)
      if (kind === 'png') setShots((n) => n + 1)
    } catch (err: unknown) {
      onStatus(errorText(err))
    } finally {
      setBusy(null)
    }
  }

  const fireBurst = (target: Shot) => {
    if (!pipeline) return
    const grab = o.sourceLive ? o.liveFrame : null
    playShutter(body.shutter)
    navigator.vibrate?.([20, 40, 20])
    setExposureKey((k) => k + 1)
    setBusy('png')
    onStatus(body.burst?.kind === 'wiggle' ? 'Firing four lenses…' : 'Firing sixteen frames…')
    // The burst machinery (GIF worker, loop recorder) loads on the first press.
    import('./motion')
      .then(({ runBurst }) => runBurst(pipeline, target, grab, keep))
      .then((msg) => {
        onStatus(msg)
        setShots((n) => n + 1)
      })
      .catch((err: unknown) => onStatus(errorText(err)))
      .finally(() => setBusy(null))
  }

  /** The exposure itself, after any self-timer. */
  const fire = () => {
    if (!shot || !pipeline) return
    if (body.medium === 'video') {
      if (recorder.since !== null) {
        recorder.stop()
        return
      }
      playShutter('digital')
      void recorder.start(o.aids.sound)
      return
    }
    if (body.burst) {
      fireBurst(shot)
      return
    }
    const frame = o.live ? o.liveFrame() : null
    playShutter(body.shutter)
    navigator.vibrate?.(25)
    setExposureKey((k) => k + 1)
    if (o.twoExposures && frame) {
      if (!o.pendingA) {
        o.setFrameA(frame)
        onStatus(o.multiFrame ? 'Frame A exposed. Press the shutter again for frame B.' : 'First exposure made. Press the shutter again to expose over it.')
        return
      }
      o.setFrameA(null)
      const target = o.multiFrame ? { ...shot, source: o.pendingA, pair: frame } : { ...shot, source: frame, pair: o.pendingA }
      void runExport('png', target)
      return
    }
    if (o.doubleActive && !shot.pair) onStatus('Load a second exposure (Aids tab) to blend, or shoot live.')
    void runExport('png', frame ? { ...shot, source: frame } : shot)
  }
  const timer = useSelfTimer(fire)
  const onShutter = () => {
    if (recorder.since !== null) {
      recorder.stop()
      return
    }
    if (timer.countdown !== null) {
      timer.cancel()
      onStatus('Self-timer cancelled.')
      return
    }
    if (o.aids.timer > 0) timer.start(o.aids.timer)
    else fire()
  }

  const { multiFrame, doubleActive, pendingA } = o
  const recording = recorder.since !== null
  const takeLabel =
    body.medium === 'video'
      ? recording
        ? `Stop ${formatCounter(recElapsed)}`
        : `Record ${fpsOf(o.params)}fps`
      : body.burst
        ? body.burst.kind === 'wiggle'
          ? '4-lens burst'
          : '16-frame burst'
        : multiFrame
          ? pendingA
            ? 'Frame B'
            : 'Frame A'
          : doubleActive
            ? pendingA
              ? 'Exposure 2'
              : 'Exposure 1'
            : 'Take'
  const finderBadge = pendingA ? (multiFrame ? 'Frame B: live' : 'Exposure 2 of 2') : doubleActive && shot?.pair ? 'Double exposure' : null

  return { busy, shots, exposureKey, recorder, countdown: timer.countdown, onShutter, runExport, takeLabel, finderBadge }
}
