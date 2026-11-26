import { useCallback, useMemo, useRef, useState } from 'react'
import { useFullscreen } from './app/hooks'
import type { RollEntry } from './app/roll/entry'
import { useKeeper } from './app/roll/useKeeper'
import { useRoll } from './app/roll/useRoll'
import type { ShortcutAction } from './app/shortcuts'
import { sanitizeSnapshot, snapshotOf, type Snapshot } from './app/snapshot'
import { useCoach } from './app/useCoach'
import { useCustomGrade } from './app/useCustomGrade'
import { useExposureActions } from './app/useExposureActions'
import { useRecipes } from './app/useRecipes'
import { useShortcuts } from './app/useShortcuts'
import { useShot } from './app/useShot'
import { useSources } from './app/useSources'
import { useStudioState } from './app/useStudioState'
import { bodyById, shelfGroups } from './cameras/registry'
import type { ParamValue } from './cameras/types'
import { useLiveCamera } from './engine/capture'
import { Pipeline } from './engine/pipeline'
import { clamp, createRng, newSeed } from './engine/rng'
import { useHorizon } from './engine/useHorizon'
import { AidsPanel } from './ui/AidsPanel'
import { BodyDrawer } from './ui/BodyDrawer'
import { BodyShelf } from './ui/BodyShelf'
import { CoachMarks } from './ui/CoachMarks'
import { CustomGrade } from './ui/CustomGrade'
import { IconClose } from './ui/icons'
import { LensDock } from './ui/LensDock'
import { ManualPanel } from './ui/ManualPanel'
import { RecipesPanel } from './ui/RecipesPanel'
import { RollSheet } from './ui/RollSheet'
import { SampleSheet } from './ui/SampleSheet'
import { ShortcutsDialog } from './ui/ShortcutsDialog'
import { ShutterBar } from './ui/ShutterBar'
import { SourceSheet } from './ui/SourceSheet'
import { StatusBar } from './ui/StatusBar'
import { StatusToast } from './ui/StatusToast'
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

/** Shelf order, which the number keys and [ ] follow. */
const SHELF_ORDER: readonly string[] = shelfGroups().flatMap((g) => g.bodies.map((b) => b.id))

export default function App() {
  const [{ pipeline, error: pipelineError }] = useState(createPipeline)
  const studio = useStudioState()
  const { bodyId, rig, aids, setRig, updateParams } = studio
  const [sampleOpen, setSampleOpen] = useState(false)
  const [rollOpen, setRollOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [compare, setCompare] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [status, setStatusState] = useState({ text: '', seq: 0 })
  /** Every message bumps the sequence, so the phone toast shows a repeated message again. */
  const setStatus = useCallback((text: string) => setStatusState((s) => ({ text, seq: s.seq + 1 })), [])
  const finderRef = useRef<HTMLElement>(null)

  const camera = useLiveCamera(setStatus)
  const horizon = useHorizon(aids.level)
  const fullscreen = useFullscreen(finderRef)
  const body = bodyById(bodyId)
  const params = studio.paramsById[bodyId]
  const live = camera.state === 'live'
  const multiFrame = !!body.slots
  const doubleActive = rig.double && !multiFrame
  const twoExposures = multiFrame || doubleActive
  const closeSheet = useCallback(() => setSheetOpen(false), [])
  const sources = useSources({ pipeline, camera, keepFrameA: live && twoExposures, multiFrame, onStatus: setStatus, onLoaded: closeSheet })
  const source = camera.liveSource ?? sources.still
  const pendingA = twoExposures && live ? sources.frameA : null
  const { shot, effectiveRig, hardware } = useShot({ body, params, rig, live, liveSource: camera.liveSource, source, pair: sources.pair, pendingA, multiFrame, doubleActive })

  const roll = useRoll()
  const keep = useKeeper(roll.add, studio.alsoDownload, aids.dualSave)
  const exposure = useExposureActions({
    pipeline,
    shot,
    body,
    params,
    aids,
    live,
    sourceLive: !!source?.live,
    liveFrame: sources.liveFrame,
    multiFrame,
    doubleActive,
    twoExposures,
    pendingA,
    setFrameA: sources.setFrameA,
    keep,
    onStatus: setStatus,
  })
  const { recorder } = exposure
  const recording = recorder.since !== null

  const grade = useCustomGrade(pipeline, setRig, setStatus)
  const coach = useCoach(sources.fontsReady && !!pipeline)
  const { applySnapshot } = studio
  const stopRecording = recorder.stop
  /** A recipe, link or roll entry takes over the body: a clip in progress is finished first (stop is a no-op otherwise). */
  const applyLook = useCallback(
    (snap: Snapshot) => {
      stopRecording()
      applySnapshot(snap)
    },
    [stopRecording, applySnapshot],
  )
  const recipes = useRecipes(applyLook, setStatus)

  const onBody = (id: string) => {
    if (recording) recorder.stop()
    studio.setBodyId(id)
  }
  const onParam = (key: string, value: ParamValue) => updateParams(bodyId, (prev) => ({ ...prev, [key]: value }))
  const onRandomize = () => {
    const seed = newSeed()
    updateParams(bodyId, (prev) => ({ ...body.randomize(prev, createRng(seed)), seed: seed % 9973 }))
    setStatus(`New ${body.badge} variation.`)
  }
  const onAction = (key: string) => {
    if (key === 'app:pairImport') {
      sources.pairInputRef.current?.click()
      return
    }
    if (key === 'app:pairClear') {
      sources.setPair(null)
      setStatus('Both halves now pan across the same photo.')
      return
    }
    const act = body.onAction
    if (act) updateParams(bodyId, (prev) => act(key, prev, createRng(newSeed())))
  }
  const onCamera = () => (live ? camera.stop() : void camera.start(camera.facing))

  const onRedevelop = async (entry: RollEntry) => {
    const snap = sanitizeSnapshot(entry.bodyId, entry.params, entry.rig)
    if (!entry.original || !snap) {
      setStatus('This shot has no original to develop again.')
      return
    }
    const name = entry.filename.replace(/\.[a-z0-9]+$/i, '-original.jpg')
    if (!(await sources.onFile(new File([entry.original], name, { type: entry.original.type || 'image/jpeg' })))) return
    applyLook(snap)
    setStatus(`Re-developing ${entry.filename} on the ${bodyById(snap.bodyId).badge}. Pick another camera to compare.`)
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

  const shutterDisabled = !shot || !pipeline || (exposure.busy !== null && !recording)
  const stepBody = (delta: number) => onBody(SHELF_ORDER[(SHELF_ORDER.indexOf(bodyId) + delta + SHELF_ORDER.length) % SHELF_ORDER.length])
  useShortcuts((a: ShortcutAction) => {
    if (a.type === 'shutter') {
      if (shutterDisabled) return false
      exposure.onShutter()
    } else if (a.type === 'camera') onCamera()
    else if (a.type === 'sources') setSheetOpen((o) => !o)
    else if (a.type === 'roll') setRollOpen(true)
    else if (a.type === 'compare') setCompare((c) => !c)
    else if (a.type === 'prevBody' || a.type === 'nextBody') stepBody(a.type === 'nextBody' ? 1 : -1)
    else if (a.type === 'body') {
      if (!SHELF_ORDER[a.index]) return false
      onBody(SHELF_ORDER[a.index])
    } else setHelpOpen(true)
  })

  const outputSize = useMemo(() => {
    if (!pipeline || !shot) return ''
    const l = pipeline.exportLayout(shot)
    return `${l.canvasW}×${l.canvasH} px`
  }, [pipeline, shot])
  const closeSample = useCallback(() => setSampleOpen(false), [])
  const closeRoll = useCallback(() => setRollOpen(false), [])
  const closeHelp = useCallback(() => setHelpOpen(false), [])

  const shutterBar = (
    <ShutterBar
      cameraState={camera.state}
      canFlip={camera.canFlip}
      compare={compare}
      sheetOpen={sheetOpen}
      busy={exposure.busy !== null}
      firing={exposure.exposureKey > 0 && exposure.busy === 'png'}
      disabled={!shot || !pipeline}
      takeLabel={exposure.takeLabel}
      countingDown={exposure.countdown !== null}
      recording={recording}
      videoMode={body.medium === 'video'}
      burstMode={!!body.burst}
      rollCount={roll.entries.length}
      rollOpen={rollOpen}
      onRoll={() => setRollOpen(true)}
      onShutter={exposure.onShutter}
      onToggleSheet={() => setSheetOpen((o) => !o)}
      onToggleCompare={() => setCompare((c) => !c)}
      onCamera={onCamera}
      onFreeze={sources.onFreeze}
      onFlip={() => void camera.flip()}
    />
  )

  return (
    <div className="studio" data-drawer={drawerOpen ? 'open' : 'closed'}>
      <div className="a-status">
        <StatusBar body={body} rig={effectiveRig} sourceLabel={source?.label ?? 'No source'} live={live} shots={exposure.shots} status={status.text} />
      </div>

      <div className="a-shelf min-h-0 lg:hairline-t lg:border-r lg:border-line max-lg:hairline-t">
        <BodyShelf value={bodyId} onChange={onBody} />
      </div>

      <main ref={finderRef} className={`a-finder flex min-h-0 flex-col bg-body ${fullscreen.fallback ? 'fixed inset-0 z-30' : 'relative'}`}>
        <div className="min-h-0 flex-1">
          <Viewfinder
            pipeline={sources.fontsReady ? pipeline : null}
            error={pipelineError}
            shot={shot}
            compare={compare}
            exposureKey={exposure.exposureKey}
            onFile={(f) => void sources.onFile(f)}
            grid={aids.grid}
            roll={horizon.roll}
            countdown={exposure.countdown}
            badge={exposure.finderBadge}
            onFocus={onFocus}
            onZoom={onZoom}
            canZoom={canZoom}
            recordingSince={recorder.since}
          />
        </div>
        <StatusToast message={status.text} seq={status.seq} />
        {fullscreen.active && (
          <div className="relative">
            {shutterBar}
            <button type="button" className="key key-icon absolute right-3 top-1/2 -translate-y-1/2" aria-label="Leave full screen" onClick={fullscreen.toggle}>
              <IconClose />
            </button>
          </div>
        )}
        {sheetOpen && <SourceSheet activeSourceId={source?.id ?? null} onScene={sources.onScene} onFile={(f) => void sources.onFile(f)} onClose={closeSheet} />}
      </main>

      <div className="a-controls">{!fullscreen.active && shutterBar}</div>

      <div className="a-drawer min-h-0">
        <BodyDrawer
          body={body}
          params={params}
          open={drawerOpen}
          outputSize={outputSize}
          busy={exposure.busy}
          canExport={!!shot && !!pipeline}
          tab={studio.tab}
          onTab={studio.setTab}
          onSample={() => setSampleOpen(true)}
          onToggle={() => {
            setDrawerOpen((o) => !o)
            if (!drawerOpen) window.setTimeout(() => document.querySelector('.a-drawer')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
          }}
          onParam={onParam}
          onRandomize={onRandomize}
          onAction={onAction}
          onPng={() => shot && void exposure.runExport('png', shot)}
          onStory={() => shot && void exposure.runExport('story', shot)}
          recipes={<RecipesPanel recipes={recipes} badge={body.badge} onSave={(name) => recipes.save(name, snapshotOf({ body, params, rig }))} />}
          panels={{
            lens: (
              <LensDock rig={rig} caps={body.accessories} badge={body.badge} onRig={setRig}>
                <CustomGrade grade={grade.grade} strength={rig.lutStrength} error={grade.error} loading={grade.loading} onFile={(f) => void grade.load(f)} onRemove={grade.remove} onStrength={(v) => setRig({ lutStrength: v })} />
              </LensDock>
            ),
            manual: <ManualPanel rig={rig} caps={body.accessories} badge={body.badge} hardware={hardware} live={live} onRig={setRig} />,
            aids: (
              <AidsPanel
                aids={aids}
                rig={rig}
                horizon={horizon}
                multiFrame={multiFrame}
                hasSecond={!!sources.pair}
                live={live}
                videoBody={body.medium === 'video'}
                alsoDownload={studio.alsoDownload}
                onAlsoDownload={studio.setAlsoDownload}
                onShortcuts={() => setHelpOpen(true)}
                onTour={() => coach.dispatch('restart')}
                onAids={studio.setAids}
                onRig={setRig}
                onFullscreen={fullscreen.toggle}
                onLoadSecond={() => sources.pairInputRef.current?.click()}
                onClearSecond={() => sources.setPair(null)}
              />
            ),
          }}
        />
      </div>

      <input
        ref={sources.pairInputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void sources.onPairFile(f)
          e.target.value = ''
        }}
      />
      {sampleOpen && pipeline && <SampleSheet pipeline={pipeline} body={body} onClose={closeSample} />}
      {rollOpen && <RollSheet roll={roll} alsoDownload={studio.alsoDownload} onAlsoDownload={studio.setAlsoDownload} onRedevelop={onRedevelop} onStatus={setStatus} onClose={closeRoll} />}
      {helpOpen && <ShortcutsDialog onClose={closeHelp} />}
      <CoachMarks state={coach.state} onEvent={coach.dispatch} />
    </div>
  )
}
