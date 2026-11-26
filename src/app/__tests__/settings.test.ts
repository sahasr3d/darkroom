import { describe, expect, test } from 'vitest'
import { bodyById } from '../../cameras/registry'
import { DEFAULT_RIG } from '../../engine/look'
import { DEFAULT_AIDS } from '../aids'
import { defaultSettings, migrateSettings, parseSettings, serializeSettings, SETTINGS_VERSION } from '../settings'
import { diffRig, persistRig, sanitizeParams, sanitizeRig } from '../snapshot'

const fallback = defaultSettings(true)
const stored = (fields: Record<string, unknown>): string => JSON.stringify({ v: SETTINGS_VERSION, ...fields })

describe('settings parsing', () => {
  test('nothing stored, bad JSON or a foreign shape all give the defaults', () => {
    expect(parseSettings(null, fallback)).toBe(fallback)
    expect(parseSettings('{not json', fallback)).toBe(fallback)
    expect(parseSettings('[1,2,3]', fallback)).toBe(fallback)
    expect(parseSettings('"hello"', fallback)).toBe(fallback)
  })

  test('round-trips every remembered field', () => {
    const fxn = bodyById('fxn-r')
    const s = {
      ...fallback,
      bodyId: 'fxn-r',
      paramsById: { ...fallback.paramsById, 'fxn-r': { ...fxn.defaults, warmth: 90, border: true } },
      rig: { ...fallback.rig, focal: 50, gel: 'red' as const, ev: -1 },
      aids: { ...DEFAULT_AIDS, grid: 'thirds' as const, timer: 3 as const },
      tab: 'manual' as const,
      alsoDownload: false,
    }
    expect(parseSettings(serializeSettings(s), fallback)).toEqual(s)
  })

  test('only changed bodies are written', () => {
    const fxn = bodyById('fxn-r')
    const text = serializeSettings({ ...fallback, paramsById: { ...fallback.paramsById, 'fxn-r': { ...fxn.defaults, warmth: 10 } } })
    expect(JSON.parse(text).changed).toEqual({ 'fxn-r': { warmth: 10 } })
  })

  test('an unknown body id falls back to the default body', () => {
    expect(parseSettings(stored({ bodyId: 'no-such-camera' }), fallback).bodyId).toBe(fallback.bodyId)
  })

  test('malformed fields fall back one by one', () => {
    const s = parseSettings(stored({ bodyId: 'fxn-r', aids: { grid: 'spiral', timer: 7, level: 'yes', sound: false }, tab: 'secret', alsoDownload: 'no' }), fallback)
    expect(s.aids).toEqual({ ...DEFAULT_AIDS, sound: false })
    expect(s.tab).toBe('body')
    expect(s.alsoDownload).toBe(true)
  })

  test('transient rig fields are never restored', () => {
    const s = parseSettings(stored({ rig: { focus: [0.2, 0.3], double: true, hwExposure: true, lutId: 'x', focal: 35 } }), fallback)
    expect(s.rig).not.toHaveProperty('focus')
    expect(s.rig).not.toHaveProperty('double')
    expect(s.rig).not.toHaveProperty('lutId')
    expect(s.rig.focal).toBe(35)
  })
})

describe('settings migration', () => {
  test('accepts the current version', () => {
    expect(migrateSettings({ v: SETTINGS_VERSION, bodyId: 'fxn-r' })).toEqual({ v: SETTINGS_VERSION, bodyId: 'fxn-r' })
  })

  test('rejects records without a version or from an unknown one', () => {
    expect(migrateSettings({ bodyId: 'fxn-r' })).toBeNull()
    expect(migrateSettings({ v: SETTINGS_VERSION + 1 })).toBeNull()
    expect(migrateSettings({ v: '1' })).toBeNull()
    expect(parseSettings(JSON.stringify({ v: 99, bodyId: 'golf' }), fallback)).toBe(fallback)
  })
})

describe('snapshot sanitizers', () => {
  test('params keep declared keys only, clamp ranges and reject bad options', () => {
    const fxn = bodyById('fxn-r')
    const p = sanitizeParams(fxn, { warmth: 400, grain: -5, border: 'yes', dateFormat: 'zzz', evil: '<script>', intensity: Number.NaN, seed: 42 })
    expect(p.warmth).toBe(100)
    expect(p.grain).toBe(0)
    expect(p.border).toBe(fxn.defaults.border)
    expect(p.dateFormat).toBe(fxn.defaults.dateFormat)
    expect(p.intensity).toBe(fxn.defaults.intensity)
    expect(p).not.toHaveProperty('evil')
    expect(p.seed).toBe(42)
  })

  test('text params must pass the control validator', () => {
    const fxn = bodyById('fxn-r')
    expect(sanitizeParams(fxn, { dateText: 'x'.repeat(500) }).dateText).toBe(fxn.defaults.dateText)
  })

  test('rig values are type-checked and clamped', () => {
    const r = sanitizeRig({ focal: 9999, lens: 'laser', ev: -12, gel: 'blue', nd: 7, kelvin: '5000' })
    expect(r.focal).toBe(120)
    expect(r.lens).toBe(DEFAULT_RIG.lens)
    expect(r.ev).toBe(-3)
    expect(r.gel).toBe('blue')
    expect(r.nd).toBe(DEFAULT_RIG.nd)
    expect(r.kelvin).toBe(DEFAULT_RIG.kelvin)
  })

  test('the stock rig has no differences', () => {
    expect(diffRig(persistRig(DEFAULT_RIG))).toEqual({})
    expect(diffRig({ ...persistRig(DEFAULT_RIG), flash: true })).toEqual({ flash: true })
  })
})
