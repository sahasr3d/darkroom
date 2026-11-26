import type { CameraState } from '../engine/capture'
import { IconCamera, IconFlip, IconFreeze, IconPrints, IconRoll, IconSplit, IconStop } from './icons'

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
  /** Shots kept in the camera roll (badge on the roll key). */
  rollCount: number
  rollOpen: boolean
  onRoll: () => void
  onShutter: () => void
  onToggleSheet: () => void
  onToggleCompare: () => void
  onCamera: () => void
  onFreeze: () => void
  onFlip: () => void
}

/**
 * Shutter release flanked by two key banks: camera roll, film roll (sources) and compare on the
 * left; live camera, freeze and flip on the right. Banked keys share their hairlines, which keeps
 * three 44px keys a side inside a 375px phone.
 */
export function ShutterBar(p: Props) {
  const live = p.cameraState === 'live'
  const cameraLabel = live ? 'Stop camera' : p.cameraState === 'starting' ? 'Starting camera' : 'Live camera'
  const rollLabel = p.rollCount === 1 ? 'Camera roll: 1 shot' : `Camera roll: ${p.rollCount} shots`
  return (
    <div className="flex items-center justify-center gap-2 px-2 py-3 sm:gap-5 sm:px-3">
      <div className="key-bank flex-1 justify-end">
        <button type="button" className="key key-square relative" aria-label={rollLabel} aria-haspopup="dialog" aria-expanded={p.rollOpen} data-coach="roll" onClick={p.onRoll}>
          <IconPrints />
          {p.rollCount > 0 && (
            <span className="key-count" aria-hidden="true">
              {p.rollCount > 99 ? '99+' : p.rollCount}
            </span>
          )}
        </button>
        <button type="button" className="key key-square" aria-label="Film roll: scenes and imports" aria-pressed={p.sheetOpen} aria-expanded={p.sheetOpen} aria-controls="source-sheet" data-coach="source" onClick={p.onToggleSheet}>
          <IconRoll />
        </button>
        <button type="button" className="key key-square" aria-label="Before and after" aria-pressed={p.compare} onClick={p.onToggleCompare}>
          <IconSplit />
        </button>
      </div>

      <div className="grid justify-items-center gap-1">
        <button
          type="button"
          data-coach="shutter"
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
        <span className={`font-[family-name:var(--font-osd)] text-[12px] tabular-nums ${p.recording ? 'text-rec' : 'text-dim'}`} aria-hidden="true">
          {p.recording ? p.takeLabel : p.busy ? 'Developing' : p.countingDown ? 'Cancel' : live || p.videoMode || p.burstMode ? p.takeLabel : 'Develop'}
        </span>
      </div>

      <div className="key-bank flex-1">
        <button type="button" className="key key-square" aria-label={cameraLabel} aria-pressed={live} disabled={p.cameraState === 'starting'} data-coach="source" onClick={p.onCamera}>
          {live ? <IconStop className="text-rec" /> : <IconCamera />}
        </button>
        {live ? (
          <>
            <button type="button" className="key key-square" aria-label="Freeze this frame to edit it" onClick={p.onFreeze}>
              <IconFreeze />
            </button>
            <button type="button" className="key key-square" aria-label="Switch front and rear camera" disabled={!p.canFlip} title={p.canFlip ? undefined : 'Only one camera found'} onClick={p.onFlip}>
              <IconFlip />
            </button>
          </>
        ) : null}
      </div>
    </div>
  )
}
