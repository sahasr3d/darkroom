import type { AccessoryId } from '../cameras/types'
import { EV_STOPS, formatEv, formatShutter, HANDHELD_LIMIT, ISO_STOPS, manualExposureEv, nearestStopIndex, SHUTTER_STOPS, WB_PRESETS } from '../engine/exposure'
import type { HardwareApplied } from '../engine/hardware'
import type { Rig } from '../engine/look'
import { ControlGroupBox, Fader, Switch } from './controls'
import { StepDial } from './StepDial'

type Props = {
  rig: Rig
  caps: readonly AccessoryId[]
  badge: string
  hardware: HardwareApplied
  live: boolean
  onRig: (patch: Partial<Rig>) => void
}

const METER_RANGE = 3

/** Match-needle light meter: stops over (+) or under (−) the body's metered exposure. */
function LightMeter({ stops }: { stops: number }) {
  const clamped = Math.max(-METER_RANGE, Math.min(METER_RANGE, stops))
  const off = Math.abs(stops) > METER_RANGE
  const ok = Math.abs(stops) < 1 / 6
  const label = ok ? 'Metered' : `${stops > 0 ? '+' : '−'}${Math.abs(stops).toFixed(1)} EV ${stops > 0 ? 'over' : 'under'}`
  return (
    <div className="grid gap-1" role="meter" aria-label="Light meter" aria-valuemin={-METER_RANGE} aria-valuemax={METER_RANGE} aria-valuenow={Number(clamped.toFixed(2))} aria-valuetext={label}>
      <div className="flex items-baseline justify-between">
        <span className="engrave">Light meter</span>
        <span className={`font-[family-name:var(--font-osd)] text-[12px] ${ok ? 'text-amber' : off ? 'text-rec' : 'text-silver'}`}>{label}</span>
      </div>
      <div className="relative h-5 border border-line bg-[#070708]">
        {Array.from({ length: METER_RANGE * 2 + 1 }, (_, i) => (
          <span key={i} className={`absolute top-1 w-px ${i === METER_RANGE ? 'h-3 bg-amber' : 'h-2 bg-faint'}`} style={{ left: `${(i / (METER_RANGE * 2)) * 100}%` }} />
        ))}
        <span className={`absolute top-0 h-full w-0.5 -translate-x-1/2 ${off ? 'bg-rec' : 'bg-silver'}`} style={{ left: `${((clamped + METER_RANGE) / (METER_RANGE * 2)) * 100}%` }} />
      </div>
    </div>
  )
}

/** Manual exposure: EV compensation, ISO, shutter, stabilisation and white balance. */
export function ManualPanel({ rig, caps, badge, hardware, live, onRig }: Props) {
  const manualOk = caps.includes('manual')
  const manual = manualOk && rig.manual
  const nd = caps.includes('nd') ? rig.nd : 0
  const meterStops = rig.ev - nd + (manual ? manualExposureEv(rig.iso, rig.shutter) : 0)
  const slow = manual && rig.shutter > HANDHELD_LIMIT
  const shakeNote = slow ? (rig.stabilize ? 'Slow shutter: stabiliser is damping the shake.' : 'Slow shutter: expect hand-shake blur.') : undefined
  const sensorTag = live && hardware.exposure ? 'Sensor' : manual ? 'Simulated' : undefined

  return (
    <>
      <ControlGroupBox title="Exposure">
        <LightMeter stops={meterStops} />
        <StepDial label="Exposure compensation" stops={EV_STOPS} index={nearestStopIndex(EV_STOPS, rig.ev)} format={formatEv} onChange={(i) => onRig({ ev: EV_STOPS[i] })} />
        {manualOk ? (
          <>
            <Switch label="Manual ISO and shutter" checked={rig.manual} onChange={(v) => onRig({ manual: v })} />
            <StepDial label="ISO" tag={sensorTag} stops={ISO_STOPS} index={nearestStopIndex(ISO_STOPS, rig.iso)} format={(v) => String(v)} onChange={(i) => onRig({ iso: ISO_STOPS[i] })} disabled={!manual} />
            <StepDial label="Shutter speed" tag={sensorTag} stops={SHUTTER_STOPS} index={nearestStopIndex(SHUTTER_STOPS, rig.shutter)} format={formatShutter} onChange={(i) => onRig({ shutter: SHUTTER_STOPS[i] })} disabled={!manual} note={shakeNote} />
            <Switch label="Stabilisation" checked={rig.stabilize} onChange={(v) => onRig({ stabilize: v })} />
          </>
        ) : (
          <p className="text-[11px] text-dim">The {badge} sets ISO and shutter itself.</p>
        )}
      </ControlGroupBox>

      <ControlGroupBox title="White balance">
        {manualOk ? (
          <>
            <div role="radiogroup" aria-label="White balance presets" className="grid grid-cols-3 gap-1">
              {WB_PRESETS.map((p) => (
                <button key={p.label} type="button" role="radio" aria-checked={rig.kelvin === p.kelvin} className="key min-h-[30px] px-1 text-[11px]" onClick={() => onRig({ kelvin: p.kelvin })}>
                  {p.label}
                </button>
              ))}
            </div>
            <Fader label={`Colour temperature${live && hardware.whiteBalance ? ' (sensor)' : ''}`} value={rig.kelvin} min={2500} max={9000} step={100} unit="K" resetTo={5500} onChange={(v) => onRig({ kelvin: v })} />
            <Fader label="Tint (green ↔ magenta)" value={Math.round(rig.tint * 100)} min={-100} max={100} step={1} resetTo={0} onChange={(v) => onRig({ tint: v / 100 })} />
          </>
        ) : (
          <p className="text-[11px] text-dim">The {badge} balances colour automatically.</p>
        )}
      </ControlGroupBox>
    </>
  )
}
