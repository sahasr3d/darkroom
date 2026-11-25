import type { CameraBody } from '../cameras/types'
import { formatEv, formatShutter } from '../engine/exposure'
import { gateRig, type Rig } from '../engine/look'

type Props = {
  body: CameraBody
  rig: Rig
  sourceLabel: string
  live: boolean
  shots: number
  status: string
}

/** Top plate: power/live LED, body badge, film format, rig telemetry and the frame counter. */
export function StatusBar({ body, rig, sourceLabel, live, shots, status }: Props) {
  const r = gateRig(rig, body.accessories, !!body.slots)
  const exposure = r.manual ? `ISO${r.iso} ${formatShutter(r.shutter)}` : 'Auto'
  const lens = r.lens === 'none' ? '' : ` ${r.lens}`
  return (
    <header className="hairline-b flex items-center gap-3 px-3 py-2 lg:px-4">
      <span className={`led ${live ? 'led-red' : 'led-amber'}`} aria-hidden="true" />
      <h1 className="badge truncate text-[14px]">{body.badge}</h1>
      <span className="truncate font-[family-name:var(--font-osd)] text-[12px] text-dim max-sm:hidden">{body.format}</span>
      <span className="ml-auto flex min-w-0 items-center gap-3 font-[family-name:var(--font-osd)] text-[12px]">
        <span className="truncate text-dim max-md:hidden" role="status" aria-live="polite">
          {status}
        </span>
        <span className="text-dim max-sm:hidden" title="Source">
          {sourceLabel}
        </span>
        <span className="readout whitespace-nowrap px-1.5 py-0.5" title="Focal length, lens, exposure, compensation, white balance">
          {r.focal}mm{lens} <span className="max-sm:hidden">{exposure} </span>
          {formatEv(r.ev)} <span className="max-sm:hidden">{r.kelvin}K</span>
        </span>
        <span className="readout px-1.5 py-0.5" aria-label={`${shots} frames exposed`}>
          {String(shots).padStart(2, '0')}
        </span>
      </span>
    </header>
  )
}
