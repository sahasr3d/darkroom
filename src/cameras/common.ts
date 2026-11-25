import type { Mat3 } from '../engine/look'
import { formatLedDate, validateLedText, type LedFormat } from '../engine/overlays/ledDate'
import { randInt, type Rng } from '../engine/rng'
import { bool, num, str, type Control, type ControlGroup, type FrameSpec, type ParamValue, type Params } from './types'

/** The quartz date-back every film compact shares: toggle, text, format, LED colour. */
export const DATE_BACK_GROUP: ControlGroup = {
  title: 'Date back',
  controls: [
    { kind: 'toggle', key: 'dateStamp', label: 'Imprint date' },
    { kind: 'text', key: 'dateText', label: 'Imprint', maxLength: 12, placeholder: "'98 08 24", validate: validateLedText },
    {
      kind: 'select',
      key: 'dateFormat',
      label: 'Order',
      options: [
        { value: 'ymd', label: "'yy mm dd" },
        { value: 'mdy', label: "mm dd 'yy" },
        { value: 'dmy', label: "dd mm 'yy" },
      ],
    },
    {
      kind: 'select',
      key: 'dateColor',
      label: 'LED',
      options: [
        { value: 'orange', label: 'Amber' },
        { value: 'red', label: 'Red' },
      ],
    },
    { kind: 'action', key: 'dateToday', label: "Use today's date" },
  ],
}

export const dateBackDefaults = (on: boolean, text = "'98 08 24"): Params => ({
  dateStamp: on,
  dateText: text,
  dateFormat: 'ymd',
  dateColor: 'orange',
})

/** Shared action handler; returns null when the key is not a date-back action. */
export function dateBackAction(key: string, p: Params): Params | null {
  if (key !== 'dateToday') return null
  const fmt = (['ymd', 'mdy', 'dmy'].includes(str(p, 'dateFormat')) ? str(p, 'dateFormat') : 'ymd') as LedFormat
  return { ...p, dateText: formatLedDate(new Date(), fmt) }
}

// ---------------------------------------------------------------------------
// Shared body-building helpers

/** Re-roll the given numeric params within [min, max] (integers). */
export function jitter(p: Params, rng: Rng, ranges: readonly (readonly [string, number, number])[]): Params {
  const next: Record<string, ParamValue> = { ...p }
  for (const [key, min, max] of ranges) next[key] = randInt(rng, min, max)
  return next
}

/** Scale a matrix's deviation from identity by k (0 → identity, 1 → full matrix). */
export const scaleMatrix = (m: Mat3, k: number): Mat3 => m.map((v, i) => (i % 4 === 0 ? 1 + (v - 1) * k : v * k)) as unknown as Mat3

/** Optional white print border shared by the 35mm bodies. */
export const printFrame = (p: Params): FrameSpec => (bool(p, 'border') ? { kind: 'print', paper: '#F3EFE4', border: 0.045 } : { kind: 'none' })

export const PRINT_BORDER_TOGGLE: Control = { kind: 'toggle', key: 'border', label: 'White print border' }

export const knob = (key: string, label: string, min = 0, max = 100): Control => ({ kind: 'range', key, label, min, max, step: 1 })

/** 0..100 param → 0..1. */
export const unit = (p: Params, key: string): number => num(p, key) / 100
