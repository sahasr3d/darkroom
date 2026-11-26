import { describe, expect, test } from 'vitest'
import { shortcutFor, type ShortcutContext } from '../shortcuts'

const idle: ShortcutContext = { focus: 'none', modalOpen: false, sheetOpen: false }
const key = (k: string, extra: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean; repeat: boolean }> = {}) => ({ key: k, ...extra })

describe('shortcut mapper', () => {
  test.each([
    [' ', 'shutter'],
    ['c', 'camera'],
    ['C', 'camera'],
    ['f', 'sources'],
    ['r', 'roll'],
    ['b', 'compare'],
    ['[', 'prevBody'],
    [']', 'nextBody'],
    ['?', 'help'],
  ])('%j maps to %s', (k, type) => {
    expect(shortcutFor(key(k), idle)?.type).toBe(type)
  })

  test('digits jump to the Nth body, zero does nothing', () => {
    expect(shortcutFor(key('1'), idle)).toEqual({ type: 'body', index: 0 })
    expect(shortcutFor(key('9'), idle)).toEqual({ type: 'body', index: 8 })
    expect(shortcutFor(key('0'), idle)).toBeNull()
  })

  test('unmapped keys and modifier chords are ignored', () => {
    expect(shortcutFor(key('x'), idle)).toBeNull()
    expect(shortcutFor(key('Enter'), idle)).toBeNull()
    expect(shortcutFor(key('r', { ctrlKey: true }), idle)).toBeNull()
    expect(shortcutFor(key('c', { metaKey: true }), idle)).toBeNull()
    expect(shortcutFor(key('f', { altKey: true }), idle)).toBeNull()
  })

  test('nothing fires while typing or with a modal dialog open', () => {
    for (const k of [' ', 'c', 'r', '1', '?', '[']) {
      expect(shortcutFor(key(k), { ...idle, focus: 'typing' })).toBeNull()
      expect(shortcutFor(key(k), { ...idle, modalOpen: true })).toBeNull()
    }
  })

  test('Space belongs to a keyboard-focused control or an open sheet', () => {
    expect(shortcutFor(key(' '), { ...idle, focus: 'control' })).toBeNull()
    expect(shortcutFor(key(' '), { ...idle, sheetOpen: true })).toBeNull()
    expect(shortcutFor(key('f'), { ...idle, sheetOpen: true })?.type).toBe('sources')
    expect(shortcutFor(key('r'), { ...idle, focus: 'control' })?.type).toBe('roll')
  })

  test('auto-repeat never re-fires the shutter but walks the shelf', () => {
    expect(shortcutFor(key(' ', { repeat: true }), idle)).toBeNull()
    expect(shortcutFor(key('c', { repeat: true }), idle)).toBeNull()
    expect(shortcutFor(key(']', { repeat: true }), idle)?.type).toBe('nextBody')
  })
})
