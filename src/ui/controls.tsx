import { useId, useState, type KeyboardEvent, type ReactNode } from 'react'
import type { Option } from '../cameras/types'

type FaderProps = {
  label: string
  value: number
  min: number
  max: number
  step: number
  unit?: string
  resetTo: number
  size?: 'regular' | 'master'
  onChange: (value: number) => void
}

/** Linear fader with an amber readout. Double-click (or press 0) returns it to rest. */
export function Fader({ label, value, min, max, step, unit, resetTo, size = 'regular', onChange }: FaderProps) {
  const id = useId()
  const shown = min < 0 && value > 0 ? `+${value}${unit ?? ''}` : `${value}${unit ?? ''}`
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== '0') return
    e.preventDefault()
    onChange(resetTo)
  }
  return (
    <div className="grid gap-1">
      <div className="flex items-end justify-between gap-3">
        <label htmlFor={id} className={size === 'master' ? 'text-[13px] text-silver' : 'engrave'}>
          {label}
        </label>
        <output htmlFor={id} className={`readout px-1.5 text-right leading-none ${size === 'master' ? 'min-w-[58px] py-1 text-[20px]' : 'min-w-[48px] py-0.5 text-[15px]'}`}>
          {shown}
        </output>
      </div>
      <input id={id} type="range" className="fader" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} onDoubleClick={() => onChange(resetTo)} onKeyDown={onKey} />
      <div className="ticks" aria-hidden="true" />
    </div>
  )
}

type SegmentedProps = {
  label: string
  value: string
  options: readonly Option[]
  onChange: (value: string) => void
}

/** Latched radio keys with arrow-key roving focus. */
export function Segmented({ label, value, options, onChange }: SegmentedProps) {
  const labelId = useId()
  const move = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = options.findIndex((o) => o.value === value)
    const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!delta) return
    e.preventDefault()
    const next = options[(i + delta + options.length) % options.length]
    onChange(next.value)
    e.currentTarget.querySelector<HTMLButtonElement>(`[data-value="${CSS.escape(next.value)}"]`)?.focus()
  }
  const cols = options.length > 3 ? 2 : options.length
  return (
    <div className="grid gap-1.5">
      <span id={labelId} className="engrave">
        {label}
      </span>
      <div role="radiogroup" aria-labelledby={labelId} className="grid gap-1" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }} onKeyDown={move}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            data-value={o.value}
            aria-checked={o.value === value}
            tabIndex={o.value === value ? 0 : -1}
            className="key min-h-[32px] px-2 text-[11px] leading-tight"
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

type SwitchProps = {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}

/** Toggle with an LED that lights amber when on. */
export function Switch({ label, checked, onChange }: SwitchProps) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="group flex min-h-[34px] w-full items-center justify-between gap-3 text-left">
      <span className="engrave group-hover:text-silver">{label}</span>
      <span aria-hidden="true" className="flex items-center gap-2">
        <span className={`led ${checked ? 'led-amber' : ''}`} />
        <span className="relative h-[18px] w-[34px] border border-line-hi bg-[#070708]">
          <span className={`absolute top-[2px] h-[12px] w-[14px] bg-gradient-to-b from-[#e4e2dc] to-[#8d9097] transition-[left] duration-150 motion-reduce:transition-none ${checked ? 'left-[16px]' : 'left-[2px]'}`} />
        </span>
      </span>
    </button>
  )
}

type ReadoutTextProps = {
  label: string
  value: string
  maxLength: number
  placeholder?: string
  validate?: (value: string) => string | null
  onChange: (value: string) => void
}

/**
 * Amber readout text entry. Invalid drafts stay local and are only committed once they
 * validate, so a half-typed timestamp never reaches the render.
 */
export function ReadoutText({ label, value, maxLength, placeholder, validate, onChange }: ReadoutTextProps) {
  const id = useId()
  const errId = useId()
  const [draft, setDraft] = useState(value)
  const [synced, setSynced] = useState(value)
  if (value !== synced) {
    setSynced(value)
    setDraft(value)
  }
  const error = validate ? validate(draft) : null
  return (
    <div className="grid gap-1">
      <label htmlFor={id} className="engrave">
        {label}
      </label>
      <input
        id={id}
        className="readout readout-input"
        value={draft}
        maxLength={maxLength}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errId : undefined}
        onChange={(e) => {
          const next = e.target.value
          setDraft(next)
          if (!validate || validate(next) === null) {
            setSynced(next)
            onChange(next)
          }
        }}
      />
      {error && (
        <span id={errId} className="text-[11px] text-rec">
          {error}
        </span>
      )}
    </div>
  )
}

type SwatchesProps = {
  label: string
  value: string
  options: readonly Option[]
  onChange: (value: string) => void
}

export function Swatches({ label, value, options, onChange }: SwatchesProps) {
  const labelId = useId()
  const current = options.find((o) => o.value === value)
  return (
    <div className="grid gap-1.5">
      <span id={labelId} className="engrave">
        {label}: <span className="text-silver">{current?.label}</span>
      </span>
      <div role="radiogroup" aria-labelledby={labelId} className="flex gap-2">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            aria-label={o.label}
            title={o.label}
            onClick={() => onChange(o.value)}
            className={`h-7 w-7 border border-line-hi ${o.value === value ? 'outline outline-1 outline-offset-2 outline-amber' : ''}`}
            style={{ background: o.value }}
          />
        ))}
      </div>
    </div>
  )
}

type GroupProps = {
  title: string
  children: ReactNode
}

export function ControlGroupBox({ title, children }: GroupProps) {
  return (
    <fieldset className="hairline-t grid gap-3 px-4 pb-4 pt-3">
      <legend className="sr-only">{title}</legend>
      <div aria-hidden="true" className="text-[12px] text-silver">
        {title}
      </div>
      {children}
    </fieldset>
  )
}
