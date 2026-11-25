import type { CameraState } from '../engine/capture'
import { IconCamera, IconFlip, IconFreeze, IconRoll, IconSplit, IconStop } from './icons'

type Props = {
  cameraState: CameraState
  canFlip: boolean
  compare: boolean
  sheetOpen: boolean
  busy: boolean
  firing: boolean
  disabled: boolean
  /** Caption under the shutter while live (e.g. "Frame B" on the half-frame body). */
  takeLabel: string
  /** Self-timer running: the shutter now cancels it. */
  countingDown: boolean
  /** Video bodies: the shutter is a record button. */
  videoMode: boolean
  recording: boolean
  /** Multi-shot bodies: the caption names the burst even on stills. */
  burstMode: boolean
  onShutter: () => void
  onToggleSheet: () => void
  onToggleCompare: () => void
  onCamera: () => void
  onFreeze: () => void
  onFlip: () => void
}

/** Shutter release flanked by the roll (sources), compare, live-camera and flip keys. */
export function ShutterBar(p: Props) {
  const live = p.cameraState === 'live'
  const cameraLabel = live ? 'Stop camera' : p.cameraState === 'starting' ? 'Starting camera' : 'Live camera'
  return (
    <div className="flex items-center justify-center gap-3 px-3 py-3 sm:gap-5">
      <div className="flex flex-1 justify-end gap-2">
        <button type="button" className="key h-11 w-11 p-0" aria-label="Film roll: scenes and imports" aria-pressed={p.sheetOpen} aria-expanded={p.sheetOpen} aria-controls="source-sheet" onClick={p.onToggleSheet}>
          <IconRoll />
        </button>
        <button type="button" className="key h-11 w-11 p-0" aria-label="Before and after" aria-pressed={p.compare} onClick={p.onToggleCompare}>
          <IconSplit />
        </button>
      </div>

      <div className="grid justify-items-center gap-1">
        <button
          type="button"
          className="shutter"
          data-firing={p.firing}
          disabled={p.disabled || (p.busy && !p.recording)}
          onClick={p.onShutter}
          aria-label={p.videoMode ? (p.recording ? 'Stop recording and save the clip' : 'Start recording') : live ? 'Take and save photo' : 'Develop and save photo'}
          aria-pressed={p.videoMode ? p.recording : undefined}
        >
          <span className={`shutter-cap ${p.videoMode ? '!bg-[radial-gradient(circle_at_38%_32%,#ff8a7f,#d42a1f_55%,#7a130c)]' : ''}`} />
          {p.videoMode && p.recording && <span className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 bg-[#f2efe8]" aria-hidden="true" />}
          {!p.videoMode && live && <span className="absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-rec shadow-[0_0_8px_var(--color-rec)]" aria-hidden="true" />}
        </button>
        <span className={`font-[family-name:var(--font-osd)] text-[11px] ${p.recording ? 'text-rec' : 'text-dim'}`} aria-hidden="true">
          {p.recording ? p.takeLabel : p.busy ? 'Developing' : p.countingDown ? 'Cancel' : live || p.videoMode || p.burstMode ? p.takeLabel : 'Develop'}
        </span>
      </div>

      <div className="flex flex-1 gap-2">
        <button type="button" className="key h-11 w-11 p-0" aria-label={cameraLabel} aria-pressed={live} disabled={p.cameraState === 'starting'} onClick={p.onCamera}>
          {live ? <IconStop className="text-rec" /> : <IconCamera />}
        </button>
        {live ? (
          <>
            <button type="button" className="key h-11 w-11 p-0" aria-label="Freeze this frame to edit it" onClick={p.onFreeze}>
              <IconFreeze />
            </button>
            <button type="button" className="key h-11 w-11 p-0" aria-label="Switch front and rear camera" disabled={!p.canFlip} title={p.canFlip ? undefined : 'Only one camera found'} onClick={p.onFlip}>
              <IconFlip />
            </button>
          </>
        ) : null}
      </div>
    </div>
  )
}
