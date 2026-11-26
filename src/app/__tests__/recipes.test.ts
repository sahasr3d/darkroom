import { describe, expect, test } from 'vitest'
import { bodyById } from '../../cameras/registry'
import { DEFAULT_RIG } from '../../engine/look'
import { cleanName, decodeRecipeHash, encodeRecipeHash, HASH_PREFIX, MAX_HASH_CHARS, MAX_NAME, parseRecipes, serializeRecipes, type Recipe } from '../recipes'
import { persistRig, type Snapshot } from '../snapshot'

const golf = bodyById('golf')
const snap: Snapshot = { bodyId: 'golf', params: { ...golf.defaults, intensity: 40 }, rig: { ...persistRig(DEFAULT_RIG), focal: 50, gel: 'magenta' } }
const b64url = (text: string): string => btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

describe('recipe links', () => {
  test('round-trip a snapshot with its name', () => {
    const hash = encodeRecipeHash(snap, 'Golden hour')
    expect(hash.startsWith(HASH_PREFIX)).toBe(true)
    expect(hash).toMatch(/^#r=[A-Za-z0-9_-]+$/)
    expect(decodeRecipeHash(hash)).toEqual({ ...snap, name: 'Golden hour' })
  })

  test('only differences from stock go in the link', () => {
    const stock: Snapshot = { bodyId: 'golf', params: golf.defaults, rig: persistRig(DEFAULT_RIG) }
    const hash = encodeRecipeHash(stock)
    expect(JSON.parse(atob(hash.slice(HASH_PREFIX.length).replace(/-/g, '+').replace(/_/g, '/')))).toEqual({ v: 1, b: 'golf' })
    expect(hash.length).toBeLessThan(40)
  })

  test('names survive non-ASCII text', () => {
    expect(decodeRecipeHash(encodeRecipeHash(snap, 'Été à Kyōto 🌅'))?.name).toBe('Été à Kyōto 🌅')
  })

  test('rejects malformed input', () => {
    expect(decodeRecipeHash('')).toBeNull()
    expect(decodeRecipeHash('#x=abc')).toBeNull()
    expect(decodeRecipeHash('#r=')).toBeNull()
    expect(decodeRecipeHash('#r=@@@!!')).toBeNull()
    expect(decodeRecipeHash('#r=bm90IGpzb24')).toBeNull()
    expect(decodeRecipeHash(`#r=${b64url('{"v":1}')}`)).toBeNull()
    expect(decodeRecipeHash(`#r=${b64url('{"v":2,"b":"golf"}')}`)).toBeNull()
    expect(decodeRecipeHash(`#r=${b64url('{"v":1,"b":"no-such-camera"}')}`)).toBeNull()
    expect(decodeRecipeHash(`#r=${b64url('[1,2]')}`)).toBeNull()
  })

  test('rejects oversized payloads before decoding', () => {
    expect(decodeRecipeHash(`#r=${'A'.repeat(MAX_HASH_CHARS + 1)}`)).toBeNull()
  })

  test('hostile values are sanitized, not trusted', () => {
    const hash = `#r=${b64url(JSON.stringify({ v: 1, b: 'golf', p: { intensity: 1e9, __proto__: { x: 1 }, bogus: 'x' }, g: { focal: -40, lens: 'laser' } }))}`
    const r = decodeRecipeHash(hash)
    expect(r?.params.intensity).toBe(100)
    expect(r?.params).not.toHaveProperty('bogus')
    expect(r?.rig.focal).toBe(13)
    expect(r?.rig.lens).toBe('none')
  })
})

describe('stored recipes', () => {
  const recipe: Recipe = { ...snap, id: 'r1', name: 'Dusk', createdAt: 1 }

  test('round-trip through storage', () => {
    expect(parseRecipes(serializeRecipes([recipe]))).toEqual([recipe])
  })

  test('skip damaged entries and survive garbage', () => {
    const text = JSON.stringify({ v: 1, items: [recipe, { id: 'r2', name: '', bodyId: 'golf' }, { id: 'r3', name: 'X', bodyId: 'nope' }, 7] })
    expect(parseRecipes(text).map((r) => r.id)).toEqual(['r1'])
    expect(parseRecipes('oops')).toEqual([])
    expect(parseRecipes(JSON.stringify({ v: 9, items: [recipe] }))).toEqual([])
  })

  test('names are trimmed, collapsed and capped', () => {
    expect(cleanName('  Late   light \n ')).toBe('Late light')
    expect(cleanName('x'.repeat(100))).toHaveLength(MAX_NAME)
    expect(cleanName('   ')).toBe('')
  })
})
