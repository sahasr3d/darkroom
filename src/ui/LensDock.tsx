import type { AccessoryId } from '../cameras/types'
import { ND_STOPS } from '../engine/exposure'
import { FOCAL_PRESETS, GELS, type GelId, type LensId, type Rig } from '../engine/look'
import { ControlGroupBox, Segmented, Switch } from './controls'
import { StepDial } from './StepDial'

type Props = {
  rig: Rig
  caps: readonly AccessoryId[]
  badge: string
  onRig: (patch: Partial<Rig>) => void
}

const FOCAL_MIN = 13
const FOCAL_MAX = 120
/** Zoom ring position (0..1000) ↔ focal length, on a log scale like a real zoom barrel. */
export const focalFromRing = (t: number): number => Math.round(FOCAL_MIN * Math.pow(FOCAL_MAX / FOCAL_MIN, t / 1000))
export const ringFromFocal = (f: number): number => Math.round((Math.log(f / FOCAL_MIN) / Math.log(FOCAL_MAX / FOCAL_MIN)) * 1000)

const GEL_LABELS: Record<GelId, string> = { clear: 'Clear', red: 'Red', blue: 'Blue', yellow: 'Yellow', green: 'Green', magenta: 'Magenta' }
const gelCss = (id: GelId): string => {
  const [r, g, b] = GELS[id]
  const c = (v: number) => Math.round(Math.min(1, v / 1.3) * 255)
  return id === 'clear' ? 'linear-gradient(135deg,#e8e8e2,#9a9da4)' : `rgb(${c(r)},${c(g)},${c(b)})`
}

/** The accessory drawer: focal length, lens attachments, filters and flash. */
export function LensDock({ rig, caps, badge, onRig }: Props) {
  const has = (a: AccessoryId) => caps.includes(a)
  const unavailable = `Not available on the ${badge}`
  const lensOptions: { value: LensId; label: string; cap: AccessoryId | null }[] = [
    { value: 'none', label: 'Bare lens', cap: null },
    { value: 'fisheye', label: 'Fisheye', cap: 'fisheye' },
    { value: 'prism', label: 'Prism', cap: 'prism' },
    { value: 'starburst', label: 'Starburst', cap: 'starburst' },
  ]
  const allowedLenses = lensOptions.filter((o) => !o.cap || has(o.cap))

  return (
    <>
      <ControlGroupBox title="Focal length">
        {has('focal') ? (
          <>
            <div role="radiogroup" aria-label="Focal length presets" className="grid grid-cols-5 gap-1">
              {FOCAL_PRESETS.map((f) => (
                <button key={f} type="button" role="radio" aria-checked={rig.focal === f} className="key min-h-[32px] px-1 text-[11px]" onClick={() => onRig({ focal: f })}>
                  {f}mm
                </button>
              ))}
            </div>
            <div className="grid gap-1">
              <div className="flex items-baseline justify-between">
                <label htmlFor="zoom-ring" className="engrave">
                  Zoom ring (pinch or scroll on the viewfinder)
                </label>
                <span className="readout px-1.5 py-0.5 text-[15px] leading-none">{rig.focal}mm</span>
              </div>
              <input id="zoom-ring" type="range" className="fader" min={0} max={1000} step={1} value={ringFromFocal(rig.focal)} onChange={(e) => onRig({ focal: focalFromRing(Number(e.target.value)) })} />
            </div>
          </>
        ) : (
          <p className="text-[11px] text-dim">Fixed lens. {unavailable}.</p>
        )}
      </ControlGroupBox>

      <ControlGroupBox title="Lens attachment">
        <Segmented label="Mount on the lens" value={allowedLenses.some((o) => o.value === rig.lens) ? rig.lens : 'none'} options={allowedLenses} onChange={(v) => onRig({ lens: v as LensId })} />
        {rig.lens === 'prism' && (
          <Segmented
            label="Prism cut"
            value={rig.prismMode}
            options={[
              { value: 'split', label: 'Split image' },
              { value: 'kaleido', label: 'Kaleidoscope' },
            ]}
            onChange={(v) => onRig({ prismMode: v as Rig['prismMode'] })}
          />
        )}
        {rig.lens === 'starburst' && (
          <Segmented
            label="Star points"
            value={String(rig.starPoints)}
            options={[
              { value: '4', label: '4-point' },
              { value: '6', label: '6-point' },
            ]}
            onChange={(v) => onRig({ starPoints: v === '6' ? 6 : 4 })}
          />
        )}
        {allowedLenses.length < lensOptions.length && <p className="text-[11px] text-dim">Some attachments don't fit the {badge}.</p>}
      </ControlGroupBox>

      <ControlGroupBox title="Filters">
        <StepDial
          label="ND filter"
          stops={ND_STOPS}
          index={ND_STOPS.indexOf(rig.nd as (typeof ND_STOPS)[number]) < 0 ? 0 : ND_STOPS.indexOf(rig.nd as (typeof ND_STOPS)[number])}
          format={(v) => (v === 0 ? 'Off' : `ND${2 ** v}`)}
          onChange={(i) => onRig({ nd: ND_STOPS[i] })}
          disabled={!has('nd')}
          note={has('nd') ? 'Each step cuts one stop of light.' : unavailable}
        />
        {has('leak') ? <Switch label="Random light leak" checked={rig.leak} onChange={(v) => onRig({ leak: v })} /> : <p className="text-[11px] text-dim">Light leak: {unavailable.toLowerCase()}.</p>}
      </ControlGroupBox>

      <ControlGroupBox title="Flash">
        {has('flash') ? (
          <>
            <Switch label="Direct flash" checked={rig.flash} onChange={(v) => onRig({ flash: v })} />
            <div className="grid gap-1.5">
              <span className="engrave">
                Colour gel: <span className="text-silver">{GEL_LABELS[rig.gel]}</span>
              </span>
              <div role="radiogroup" aria-label="Flash gel" className="flex flex-wrap gap-2">
                {(Object.keys(GELS) as GelId[]).map((g) => (
                  <button
                    key={g}
                    type="button"
                    role="radio"
                    aria-checked={rig.gel === g}
                    aria-label={`${GEL_LABELS[g]} gel`}
                    title={GEL_LABELS[g]}
                    disabled={!rig.flash}
                    onClick={() => onRig({ gel: g })}
                    className={`h-7 w-7 border border-line-hi disabled:opacity-30 ${rig.gel === g ? 'outline outline-1 outline-offset-2 outline-amber' : ''}`}
                    style={{ background: gelCss(g) }}
                  />
                ))}
              </div>
            </div>
          </>
        ) : (
          <p className="text-[11px] text-dim">{unavailable}.</p>
        )}
      </ControlGroupBox>
    </>
  )
}
