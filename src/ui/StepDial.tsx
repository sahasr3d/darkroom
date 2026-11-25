import { useId, useRef, type KeyboardEvent, type PointerEvent, type WheelEvent } from 'react'

type Props = {
  label: string
  /** Stop values, in order. */
  stops: readonly number[]
  index: number
  format: (value: number) => string
  onChange: (index: number) => void
  disabled?: boolean
  /** Small amber tag beside the label, e.g. "Sensor" when hardware applies it. */
  tag?: string
  note?: string
}

/** Pixels of horizontal drag per detent. */
const DRAG_STEP_PX = 22

/**
 * A detented dial strip for stopped values (EV, ISO, shutter, ND, focal length).
 * One stop per click, drag, wheel notch or arrow key, like a knurled wheel under the thumb.
 */
export function StepDial({ label, stops, index, format, onChange, disabled, tag, note }: Props) {
  const id = useId()
  const drag = useRef<{ x: number; start: number } | null>(null)
  const clampIndex = (i: number) => Math.max(0, Math.min(stops.length - 1, i))
  const step = (delta: number) => {
    const next = clampIndex(index + delta)
    if (next !== index) onChange(next)
  }

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const map: Record<string, number> = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 3, PageDown: -3 }
    if (e.key === 'Home') onChange(0)
    else if (e.key === 'End') onChange(stops.length - 1)
    else if (e.key in map) step(map[e.key])
    else return
    e.preventDefault()
  }
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (disabled) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, start: index }
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return
    const next = clampIndex(drag.current.start + Math.round((e.clientX - drag.current.x) / DRAG_STEP_PX))
    if (next !== index) onChange(next)
  }
  const onWheel = (e: WheelEvent<HTMLDivElement>) => {
    if (disabled || Math.abs(e.deltaY) + Math.abs(e.deltaX) < 4) return
    step((e.deltaX || e.deltaY) > 0 ? 1 : -1)
  }

  const pos = (i: number) => `calc(8px + (100% - 16px) * ${stops.length > 1 ? i / (stops.length - 1) : 0.5})`
  return (
    <div className={`grid gap-1 ${disabled ? 'opacity-40' : ''}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span id={id} className="engrave">
          {label}
          {tag && <span className="ml-2 font-[family-name:var(--font-osd)] text-[10px] text-amber">{tag}</span>}
        </span>
        <span className="readout min-w-[64px] px-1.5 py-0.5 text-right text-[15px] leading-none">{format(stops[index])}</span>
      </div>
      <div className="flex items-stretch gap-1">
        <button type="button" className="key h-8 w-8 shrink-0 p-0 text-[14px]" aria-label={`Lower ${label}`} disabled={disabled || index === 0} onClick={() => step(-1)}>
          ‹
        </button>
        <div
          role="slider"
          tabIndex={disabled ? -1 : 0}
          aria-labelledby={id}
          aria-valuemin={0}
          aria-valuemax={stops.length - 1}
          aria-valuenow={index}
          aria-valuetext={format(stops[index])}
          aria-disabled={disabled || undefined}
          onKeyDown={onKey}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
          onWheel={onWheel}
          className="relative h-8 flex-1 cursor-ew-resize touch-none border border-line bg-[#070708]"
        >
          <div className="absolute inset-x-2 top-1/2 h-px -translate-y-1/2 bg-line-hi" />
          {stops.map((_, i) => (
            <span key={i} className={`absolute top-1/2 w-px -translate-y-1/2 ${i === index ? 'h-5 bg-amber shadow-[0_0_6px_var(--color-amber)]' : 'h-2.5 bg-faint'}`} style={{ left: pos(i) }} />
          ))}
          <span className="pointer-events-none absolute -bottom-px h-[3px] w-3 -translate-x-1/2 bg-amber" style={{ left: pos(index) }} />
        </div>
        <button type="button" className="key h-8 w-8 shrink-0 p-0 text-[14px]" aria-label={`Raise ${label}`} disabled={disabled || index === stops.length - 1} onClick={() => step(1)}>
          ›
        </button>
      </div>
      {note && <span className="text-[11px] text-dim">{note}</span>}
    </div>
  )
}
