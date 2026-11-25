import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFullscreen, useHardwareSync, useSelfTimer } from './app/hooks'
import { runBurst, useVideoRecorder } from './app/motion'
import { fpsOf } from './cameras/bodies/video'
import { formatCounter } from './engine/overlays/video'
import { bodyById, initialParams } from './cameras/registry'
import type { ParamValue, Params } from './cameras/types'
import { captureFrame, useLiveCamera } from './engine/capture'
import { download, exportOriginal, exportPng, exportStory } from './engine/exporter'
import { sensorPoint } from './engine/hardware'
import { cropRect } from './engine/layout'
import { DEFAULT_RIG, focalToOptics, gateRig, type Rig } from './engine/look'
import { Pipeline, slotsOf, type Shot, type SourceImage } from './engine/pipeline'
import { clamp, createRng, newSeed } from './engine/rng'
import type { SceneId } from './engine/scenes'
import { playShutter } from './engine/shutterSound'
import { fileSource, isVideoFile, releaseVideoSource, sceneSource, videoFileSource } from './engine/sources'
import { useHorizon } from './engine/useHorizon'
import { AidsPanel, DEFAULT_AIDS, type Aids } from './ui/AidsPanel'
import { BodyDrawer, type DrawerTab } from './ui/BodyDrawer'
import { BodyShelf } from './ui/BodyShelf'
import { IconClose } from './ui/icons'
import { LensDock } from './ui/LensDock'
import { ManualPanel } from './ui/ManualPanel'
import { SampleSheet } from './ui/SampleSheet'
import { ShutterBar } from './ui/ShutterBar'
import { SourceSheet } from './ui/SourceSheet'
import { StatusBar } from './ui/StatusBar'
import { Viewfinder } from './ui/Viewfinder'

type PipelineState = { pipeline: Pipeline | null; error: string | null }

function createPipeline(): PipelineState {
  try {
    return { pipeline: new Pipeline(), error: null }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'unknown error'
    return { pipeline: null, error: `The GPU pipeline could not start (${msg}). Use a current Chrome, Edge, Firefox or Safari with hardware acceleration on.` }
  }
}

const errorText = (err: unknown): string => (err instanceof Error ? err.message : 'Something went wrong.')
const FONT_FACES = ["16px 'JetBrains Mono'", "700 16px 'Space Mono'", "16px 'Share Tech Mono'", "16px 'Caveat'", "16px 'Permanent Marker'"]

export default function App() {
  const [{ pipeline, error: pipelineError }] = useState(createPipeline)
  const [bodyId, setBodyId] = useState('fxn-r')
  const [paramsById, setParamsById] = useState(initialParams)
  const [rig, setRigState] = useState<Rig>(DEFAULT_RIG)
  const [aids, setAidsState] = useState<Aids>(DEFAULT_AIDS)
  const [tab, setTab] = useState<DrawerTab>('body')
  const [still, setStill] = useState<SourceImage | null>(null)
  /** Second image: half-frame frame B, or the second exposure of a double exposure. */
  const [pair, setPair] = useState<SourceImage | null>(null)
  /** First exposure frozen while a live two-exposure shot is half done. */
  const [frameA, setFrameA] = useState<SourceImage | null>(null)
  const [sampleOpen, setSampleOpen] = useState(false)
  const [compare, setCompare] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [busy, setBusy] = useState<'png' | 'story' | null>(null)
  const [status, setStatus] = useState('')
  const [shots, setShots] = useState(0)
  const [exposureKey, setExposureKey] = useState(0)
  const [fontsReady, setFontsReady] = useState(false)
  const uploadSeq = useRef(0)
  const pairSeq = useRef(0)
  const pairInputRef = useRef<HTMLInputElement>(null)
  const finderRef = useRef<HTMLElement>(null)

  const camera = useLiveCamera(setStatus)
  const horizon = useHorizon(aids.level)
  const fullscreen = useFullscreen(finderRef)
  const body = bodyById(bodyId)
  const params = paramsById[bodyId]

  // Hardware focus wants sensor coordinates: undo the body's crop, the zoom and selfie mirroring.
  const liveSrc = camera.liveSource
  const sensorFocus = useMemo(() => {
    if (!rig.focus || !liveSrc) return null
    const slot = slotsOf(body, params)[0]
    const align = liveSrc.mirrored ? 1 - slot.align : slot.align
    const crop = cropRect(liveSrc.width, liveSrc.height, slot.aspect, align)
    const zoom = focalToOptics(gateRig(rig, body.accessories, !!body.slots).focal).zoom
    return sensorPoint(rig.focus, crop, zoom, !!liveSrc.mirrored)
  }, [rig, liveSrc, body, params])
  const hardwareRig = useMemo<Rig>(() => ({ ...rig, focus: sensorFocus }), [rig, sensorFocus])
  const hardware = useHardwareSync(liveSrc, hardwareRig)
  const live = camera.state === 'live'
  const source = camera.liveSource ?? still
  const multiFrame = !!body.slots
  const doubleActive = rig.double && !multiFrame
  const twoExposures = multiFrame || doubleActive
  const pendingA = twoExposures && live ? frameA : null

  // Half-frame: A frozen, B live. Double exposure: live (or still) over the first exposure.
  const shotSource = multiFrame ? (pendingA ?? source) : source
  const shotPair = multiFrame ? (pendingA ? camera.liveSource : pair) : doubleActive ? (pendingA ?? pair) : null
  const effectiveRig = useMemo<Rig>(
    () => ({ ...rig, hwExposure: live && hardware.exposure, kelvin: live && hardware.whiteBalance ? 5500 : rig.kelvin }),
    [rig, live, hardware.exposure, hardware.whiteBalance],
  )
  const shot = useMemo<Shot | null>(
    () => (shotSource ? { body, params, rig: effectiveRig, source: shotSource, pair: shotPair } : null),
    [body, params, effectiveRig, shotSource, shotPair],
  )

  // Video recording reads the latest shot every frame, so grading tweaks while rolling land in the clip.
  const shotRef = useRef<Shot | null>(null)
  useEffect(() => {
    shotRef.current = shot
  }, [shot])
  const getShot = useCallback(() => shotRef.current, [])
  const recorder = useVideoRecorder(pipeline, getShot, setStatus, setStatus)
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
  const onBody = (id: string) => {
    if (recorder.since !== null) recorder.stop()
    setBodyId(id)
  }

  // A half-done two-exposure shot only survives while the camera stays live on such a setup.
  useEffect(() => {
    if (!live || !twoExposures) setFrameA(null)
  }, [live, twoExposures])

  useEffect(() => {
    let alive = true
    Promise.all(FONT_FACES.map((f) => document.fonts.load(f)))
      .catch(() => undefined)
      .then(() => {
        if (!alive) return
        setFontsReady(true)
        setStill((s) => s ?? sceneSource('golden'))
      })
    return () => {
      alive = false
    }
  }, [])

  // Decoded uploads hold large ImageBitmaps; free each one as soon as it is replaced.
  useEffect(() => {
    const replaced = still
    return () => {
      if (replaced?.image instanceof ImageBitmap) replaced.image.close()
      releaseVideoSource(replaced)
    }
  }, [still])
  useEffect(() => {
    const image = pair?.image
    return () => {
      if (image instanceof ImageBitmap) image.close()
    }
  }, [pair])

  const setRig = useCallback((patch: Partial<Rig>) => setRigState((r) => ({ ...r, ...patch })), [])
  const setAids = useCallback((patch: Partial<Aids>) => setAidsState((a) => ({ ...a, ...patch })), [])

  /** Always derive from the latest stored params so rapid edits never overwrite each other. */
  const updateParams = useCallback((id: string, update: (prev: Params) => Params) => setParamsById((all) => ({ ...all, [id]: update(all[id]) })), [])
  const onParam = (key: string, value: ParamValue) => updateParams(bodyId, (prev) => ({ ...prev, [key]: value }))
  const onRandomize = () => {
    const seed = newSeed()
    updateParams(bodyId, (prev) => ({ ...body.randomize(prev, createRng(seed)), seed: seed % 9973 }))
    setStatus(`New ${body.badge} variation.`)
  }
  const onAction = (key: string) => {
    if (key === 'app:pairImport') {
      pairInputRef.current?.click()
      return
    }
    if (key === 'app:pairClear') {
      setPair(null)
      setStatus('Both halves now pan across the same photo.')
      return
    }
    const act = body.onAction
    if (act) updateParams(bodyId, (prev) => act(key, prev, createRng(newSeed())))
  }

  const onScene = (id: SceneId) => {
    camera.stop()
    setStill(sceneSource(id))
    setSheetOpen(false)
  }
  const onFile = async (file: File) => {
    if (!pipeline) return
    const seq = ++uploadSeq.current
    try {
      const video = isVideoFile(file)
      const src = video ? await videoFileSource(file) : await fileSource(file, pipeline.maxSize)
      if (seq !== uploadSeq.current) {
        if (src.image instanceof ImageBitmap) src.image.close()
        releaseVideoSource(src)
        return
      }
      camera.stop()
      setStill(src)
      setSheetOpen(false)
      setStatus(`Loaded ${src.label} (${src.width}×${src.height}${video ? ', video' : ''}).`)
    } catch (err: unknown) {
      setStatus(errorText(err))
    }
  }
  const onPairFile = async (file: File) => {
    if (!pipeline) return
    const seq = ++pairSeq.current
    try {
      const src = await fileSource(file, pipeline.maxSize)
      if (seq !== pairSeq.current) {
        if (src.image instanceof ImageBitmap) src.image.close()
        return
      }
      setPair(src)
      setStatus(multiFrame ? `Frame B: ${src.label}.` : `Second exposure: ${src.label}.`)
    } catch (err: unknown) {
      setStatus(errorText(err))
    }
  }

  const onCamera = () => (live ? camera.stop() : void camera.start(camera.facing))
  /** Grab the current frame of whatever is moving: the live camera or an imported video. */
  const liveFrame = (): SourceImage | null => {
    const src = camera.liveSource ?? (still?.live ? still : null)
    return src && src.image instanceof HTMLVideoElement ? captureFrame(src.image, !!src.mirrored) : null
  }
  const onFreeze = () => {
    const frame = liveFrame()
    if (!frame) return
    camera.stop()
    setStill(frame)
    setStatus('Frame held. Grade it, then develop.')
  }

  const canZoom = body.accessories.includes('focal')
  /** Fractional focal length carried between pinch/wheel steps, so slow gestures still add up. */
  const focalFloat = useRef(rig.focal)
  const onZoom = useCallback(
    (factor: number) => {
      if (!canZoom) return
      const base = Math.round(focalFloat.current) === rig.focal ? focalFloat.current : rig.focal
      const next = clamp(base * factor, 13, 120)
      focalFloat.current = next
      const rounded = Math.round(next)
      if (rounded !== rig.focal) setRig({ focal: rounded })
    },
    [canZoom, rig.focal, setRig],
  )
  const onFocus = useCallback((point: readonly [number, number] | null) => setRig({ focus: point }), [setRig])

  const runExport = async (kind: 'png' | 'story', target: Shot) => {
    if (!pipeline) return
    setBusy(kind)
    await new Promise((r) => setTimeout(r, 16))
    try {
      const result = kind === 'png' ? await exportPng(pipeline, target) : await exportStory(pipeline, target)
      download(result)
      let saved = `Saved ${result.filename} (${result.width}×${result.height})`
      if (kind === 'png' && aids.dualSave) {
        const original = await exportOriginal(target)
        download(original)
        saved += ' and the original'
      }
      setStatus(`${saved}.`)
      if (kind === 'png') setShots((n) => n + 1)
    } catch (err: unknown) {
      setStatus(errorText(err))
    } finally {
      setBusy(null)
    }
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
      recorder.start()
      setStatus(`Rolling at ${fpsOf(params)} fps. Press again to stop.`)
      return
    }
    if (body.burst) {
      const grab = source?.live ? liveFrame : null
      playShutter(body.shutter)
      navigator.vibrate?.([20, 40, 20])
      setExposureKey((k) => k + 1)
      setBusy('png')
      setStatus(body.burst.kind === 'wiggle' ? 'Firing four lenses…' : 'Firing sixteen frames…')
      runBurst(pipeline, shot, grab)
        .then((msg) => {
          setStatus(msg)
          setShots((n) => n + 1)
        })
        .catch((err: unknown) => setStatus(errorText(err)))
        .finally(() => setBusy(null))
      return
    }
    const frame = live ? liveFrame() : null
    playShutter(body.shutter)
    navigator.vibrate?.(25)
    setExposureKey((k) => k + 1)
    if (twoExposures && frame) {
      if (!pendingA) {
        setFrameA(frame)
        setStatus(multiFrame ? 'Frame A exposed. Press the shutter again for frame B.' : 'First exposure made. Press the shutter again to expose over it.')
        return
      }
      setFrameA(null)
      const target = multiFrame ? { ...shot, source: pendingA, pair: frame } : { ...shot, source: frame, pair: pendingA }
      void runExport('png', target)
      return
    }
    if (doubleActive && !shot.pair) setStatus('Load a second exposure (Aids tab) to blend, or shoot live.')
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
      setStatus('Self-timer cancelled.')
      return
    }
    if (aids.timer > 0) timer.start(aids.timer)
    else fire()
  }

  const outputSize = useMemo(() => {
    if (!pipeline || !shot) return ''
    const l = pipeline.exportLayout(shot)
    return `${l.canvasW}×${l.canvasH} px`
  }, [pipeline, shot])

  const closeSheet = useCallback(() => setSheetOpen(false), [])
  const closeSample = useCallback(() => setSampleOpen(false), [])

  const takeLabel = body.medium === 'video'
    ? recorder.since !== null
      ? `Stop ${formatCounter(recElapsed)}`
      : `Record ${fpsOf(params)}fps`
    : body.burst
      ? body.burst.kind === 'wiggle'
        ? '4-lens burst'
        : '16-frame burst'
      : multiFrame ? (pendingA ? 'Frame B' : 'Frame A') : doubleActive ? (pendingA ? 'Exposure 2' : 'Exposure 1') : 'Take'
  const finderBadge = pendingA ? (multiFrame ? 'Frame B: live' : 'Exposure 2 of 2') : doubleActive && shot?.pair ? 'Double exposure' : null

  const shutterBar = (
    <ShutterBar
      cameraState={camera.state}
      canFlip={camera.canFlip}
      compare={compare}
      sheetOpen={sheetOpen}
      busy={busy !== null}
      firing={exposureKey > 0 && busy === 'png'}
      disabled={!shot || !pipeline}
      takeLabel={takeLabel}
      countingDown={timer.countdown !== null}
      recording={recorder.since !== null}
      videoMode={body.medium === 'video'}
      burstMode={!!body.burst}
      onShutter={onShutter}
      onToggleSheet={() => setSheetOpen((o) => !o)}
      onToggleCompare={() => setCompare((c) => !c)}
      onCamera={onCamera}
      onFreeze={onFreeze}
      onFlip={() => void camera.flip()}
    />
  )

  return (
    <div className="studio" data-drawer={drawerOpen ? 'open' : 'closed'}>
      <div className="a-status">
        <StatusBar body={body} rig={effectiveRig} sourceLabel={source?.label ?? 'No source'} live={live} shots={shots} status={status} />
      </div>

      <div className="a-shelf min-h-0 lg:hairline-t lg:border-r lg:border-line max-lg:hairline-t">
        <BodyShelf value={bodyId} onChange={onBody} />
      </div>

      <main ref={finderRef} className={`a-finder flex min-h-0 flex-col bg-body ${fullscreen.fallback ? 'fixed inset-0 z-30' : 'relative'}`}>
        <div className="min-h-0 flex-1">
          <Viewfinder
            pipeline={fontsReady ? pipeline : null}
            error={pipelineError}
            shot={shot}
            compare={compare}
            exposureKey={exposureKey}
            onFile={onFile}
            grid={aids.grid}
            roll={horizon.roll}
            countdown={timer.countdown}
            badge={finderBadge}
            onFocus={onFocus}
            onZoom={onZoom}
            canZoom={canZoom}
            recordingSince={recorder.since}
          />
        </div>
        {fullscreen.active && (
          <div className="relative">
            {shutterBar}
            <button type="button" className="key absolute right-3 top-1/2 h-10 w-10 -translate-y-1/2 p-0" aria-label="Leave full screen" onClick={fullscreen.toggle}>
              <IconClose />
            </button>
          </div>
        )}
        {sheetOpen && <SourceSheet activeSourceId={source?.id ?? null} onScene={onScene} onFile={onFile} onClose={closeSheet} />}
      </main>

      <div className="a-controls">{!fullscreen.active && shutterBar}</div>

      <div className="a-drawer min-h-0">
        <BodyDrawer
          body={body}
          params={params}
          open={drawerOpen}
          outputSize={outputSize}
          busy={busy}
          canExport={!!shot && !!pipeline}
          tab={tab}
          onTab={setTab}
          onSample={() => setSampleOpen(true)}
          onToggle={() => {
            setDrawerOpen((o) => !o)
            if (!drawerOpen) window.setTimeout(() => document.querySelector('.a-drawer')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
          }}
          onParam={onParam}
          onRandomize={onRandomize}
          onAction={onAction}
          onPng={() => shot && void runExport('png', shot)}
          onStory={() => shot && void runExport('story', shot)}
          panels={{
            lens: <LensDock rig={rig} caps={body.accessories} badge={body.badge} onRig={setRig} />,
            manual: <ManualPanel rig={rig} caps={body.accessories} badge={body.badge} hardware={hardware} live={live} onRig={setRig} />,
            aids: (
              <AidsPanel
                aids={aids}
                rig={rig}
                horizon={horizon}
                multiFrame={multiFrame}
                hasSecond={!!pair}
                live={live}
                onAids={setAids}
                onRig={setRig}
                onFullscreen={fullscreen.toggle}
                onLoadSecond={() => pairInputRef.current?.click()}
                onClearSecond={() => setPair(null)}
              />
            ),
          }}
        />
      </div>

      <input
        ref={pairInputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void onPairFile(f)
          e.target.value = ''
        }}
      />
      {sampleOpen && pipeline && <SampleSheet pipeline={pipeline} body={body} onClose={closeSample} />}
    </div>
  )
}
