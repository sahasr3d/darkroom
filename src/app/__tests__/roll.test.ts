import { describe, expect, test } from 'vitest'
import { DEFAULT_RIG } from '../../engine/look'
import { byNewest, formatBytes, fromRollRecord, isQuotaError, rollBytes, toRollRecord, type RollEntry } from '../roll/entry'
import { keepSummary, listNames } from '../roll/keep'
import { persistRig } from '../snapshot'

const entry = (over: Partial<RollEntry> = {}): RollEntry => ({
  id: 'a1',
  createdAt: 1_700_000_000_000,
  kind: 'photo',
  blob: new Blob([new Uint8Array(100)], { type: 'image/png' }),
  thumb: new Blob([new Uint8Array(10)], { type: 'image/jpeg' }),
  original: new Blob([new Uint8Array(50)], { type: 'image/jpeg' }),
  filename: 'fxn-r-20261126-101500.png',
  width: 1200,
  height: 800,
  bodyId: 'fxn-r',
  params: { intensity: 85, border: true, dateText: "'98 08 24" },
  rig: persistRig(DEFAULT_RIG),
  ...over,
})

describe('roll entry records', () => {
  test('round-trip through the stored record', () => {
    const e = entry()
    expect(fromRollRecord(toRollRecord(e))).toEqual(e)
  })

  test('the record holds only known fields', () => {
    const record = toRollRecord({ ...entry(), extra: 'x' } as RollEntry)
    expect(Object.keys(record).sort()).toEqual(['blob', 'bodyId', 'createdAt', 'filename', 'height', 'id', 'kind', 'original', 'params', 'rig', 'thumb', 'width'])
  })

  test.each([
    ['not an object', 'nope'],
    ['missing blob', { ...toRollRecord(entry()), blob: 'data' }],
    ['unknown kind', { ...toRollRecord(entry()), kind: 'hologram' }],
    ['bad size', { ...toRollRecord(entry()), width: -3 }],
    ['empty id', { ...toRollRecord(entry()), id: '' }],
    ['nested params', { ...toRollRecord(entry()), params: { a: { b: 1 } } }],
  ])('rejects a damaged record: %s', (_label, raw) => {
    expect(fromRollRecord(raw)).toBeNull()
  })

  test('a missing thumbnail is tolerated; originals belong to photos only', () => {
    const gif = fromRollRecord({ ...toRollRecord(entry({ kind: 'gif' })), thumb: undefined })
    expect(gif?.thumb).toBeNull()
    expect(gif?.original).toBeNull()
  })

  test('a malformed rig is repaired to stock values', () => {
    const e = fromRollRecord({ ...toRollRecord(entry()), rig: { focal: 'wide' } })
    expect(e?.rig.focal).toBe(DEFAULT_RIG.focal)
  })
})

describe('roll helpers', () => {
  test('sorts newest first', () => {
    const list = [entry({ id: 'old', createdAt: 1 }), entry({ id: 'new', createdAt: 3 }), entry({ id: 'mid', createdAt: 2 })]
    expect([...list].sort(byNewest).map((e) => e.id)).toEqual(['new', 'mid', 'old'])
  })

  test('counts every stored byte', () => {
    expect(rollBytes([entry(), entry({ thumb: null, original: null })])).toBe(160 + 100)
  })

  test('formats sizes', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2 KB')
    expect(formatBytes(5.25 * 1024 ** 2)).toBe('5.3 MB')
    expect(formatBytes(3 * 1024 ** 3)).toBe('3.00 GB')
  })

  test('recognizes quota failures across browsers', () => {
    expect(isQuotaError(new DOMException('full', 'QuotaExceededError'))).toBe(true)
    expect(isQuotaError({ name: 'NS_ERROR_DOM_QUOTA_REACHED' })).toBe(true)
    expect(isQuotaError(new DOMException('nope', 'NotFoundError'))).toBe(false)
    expect(isQuotaError(new Error('boom'))).toBe(false)
    expect(isQuotaError(null)).toBe(false)
  })
})

describe('keep summaries', () => {
  test('lists names naturally', () => {
    expect(listNames(['a'])).toBe('a')
    expect(listNames(['a', 'b', 'c'])).toBe('a, b and c')
  })

  test('kept only, kept and downloaded, failed', () => {
    expect(keepSummary([{ filename: 'a.png', kept: true, downloaded: false, originalDownloaded: false }], null)).toBe('Kept a.png in the roll.')
    expect(keepSummary([{ filename: 'a.png', kept: true, downloaded: true, originalDownloaded: true }], null)).toBe('Saved a.png with the original to the roll and downloads.')
    expect(keepSummary([{ filename: 'a.gif', kept: false, downloaded: true, originalDownloaded: false }], 'The roll is full.')).toBe('The roll is full. Downloaded a.gif instead.')
  })
})
