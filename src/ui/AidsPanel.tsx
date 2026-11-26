import type { BlendMode, Rig } from '../engine/look'
import type { Horizon } from '../engine/useHorizon'
import { ControlGroupBox, Fader, Segmented, Switch } from './controls'
import { IconUpload } from './icons'

export type GridKind = 'off' | 'thirds' | 'cross' | 'golden'
export type TimerSeconds = 0 | 3 | 10

export interface Aids {
  grid: GridKind
  timer: TimerSeconds
  level: boolean
  dualSave: boolean
  /** Video bodies: record sound (microphone or the imported video's track) through the body's sound chain. */
  sound: boolean
}

export const DEFAULT_AIDS: Aids = { grid: 'off', timer: 0, level: false, dualSave: false, sound: true }

type Props = {
  aids: Aids
  rig: Rig
  horizon: Horizon
  multiFrame: boolean
  hasSecond: boolean
  live: boolean
  /** The mounted body records video, so the sound switch applies. */
  videoBody: boolean
  onAids: (patch: Partial<Aids>) => void
  onRig: (patch: Partial<Rig>) => void
  onFullscreen: () => void
  onLoadSecond: () => void
  onClearSecond: () => void
}

/** Shooting aids, double exposure and dual saving. */
export function AidsPanel(p: Props) {
  const { aids, rig, horizon } = p
  return (
    <>
      <ControlGroupBox title="Viewfinder">
        <Segmented
          label="Composition grid"
          value={aids.grid}
          options={[
            { value: 'off', label: 'Off' },
            { value: 'thirds', label: 'Thirds' },
            { value: 'cross', label: 'Crosshair' },
            { value: 'golden', label: 'Golden' },
          ]}
          onChange={(v) => p.onAids({ grid: v as GridKind })}
        />
        <Switch label="Horizon level" checked={aids.level} onChange={(v) => p.onAids({ level: v })} />
        {aids.level && horizon.needsPermission && (
          <button type="button" className="key justify-self-start" onClick={() => void horizon.requestPermission()}>
            Allow motion sensor
          </button>
        )}
        {aids.level && horizon.source === 'simulator' && (
          <Fader label="Tilt simulator (no motion sensor found)" value={horizon.simulated} min={-20} max={20} step={1} unit="°" resetTo={0} onChange={horizon.setSimulated} />
        )}
        <button type="button" className="key justify-self-start" onClick={p.onFullscreen}>
          Full-screen viewfinder
        </button>
      </ControlGroupBox>

      <ControlGroupBox title="Shutter">
        <Segmented
          label="Self-timer"
          value={String(aids.timer)}
          options={[
            { value: '0', label: 'Off' },
            { value: '3', label: '3s' },
            { value: '10', label: '10s' },
          ]}
          onChange={(v) => p.onAids({ timer: Number(v) as TimerSeconds })}
        />
        <Switch label="Save the original too" checked={aids.dualSave} onChange={(v) => p.onAids({ dualSave: v })} />
      </ControlGroupBox>

      {p.videoBody && (
        <ControlGroupBox title="Sound">
          <Switch label="Record sound" checked={aids.sound} onChange={(v) => p.onAids({ sound: v })} />
          <p className="text-[11px] leading-4 text-dim [text-wrap:pretty]">
            {!aids.sound
              ? 'Clips record silent.'
              : p.live
                ? 'Records the microphone through this body’s sound: tape hiss, projector clatter or camcorder hum. The browser asks for the microphone when you start rolling.'
                : 'Records an imported video’s own sound through this body’s character. Over a photo you get just its tape hiss or projector clatter, if it has any.'}
          </p>
        </ControlGroupBox>
      )}

      <ControlGroupBox title="Double exposure">
        {p.multiFrame ? (
          <p className="text-[11px] text-dim">The half-frame body already uses its second frame for the diptych.</p>
        ) : (
          <>
            <Switch label="Double exposure" checked={rig.double} onChange={(v) => p.onRig({ double: v })} />
            {rig.double && (
              <>
                <p className="text-[11px] leading-4 text-dim">
                  {p.live ? 'Press the shutter once for the first exposure, then again for the second.' : p.hasSecond ? 'Second exposure loaded.' : 'Load a second photo to expose over this one.'}
                </p>
                <Segmented
                  label="Blend"
                  value={rig.blend}
                  options={[
                    { value: 'screen', label: 'Screen' },
                    { value: 'lighten', label: 'Lighten' },
                    { value: 'overlay', label: 'Overlay' },
                  ]}
                  onChange={(v) => p.onRig({ blend: v as BlendMode })}
                />
                <Fader label="Balance (first ↔ second)" value={rig.balance} min={0} max={100} step={1} resetTo={50} onChange={(v) => p.onRig({ balance: v })} />
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="key" onClick={p.onLoadSecond}>
                    <IconUpload />
                    Load second exposure
                  </button>
                  {p.hasSecond && (
                    <button type="button" className="key" onClick={p.onClearSecond}>
                      Remove second
                    </button>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </ControlGroupBox>
    </>
  )
}
