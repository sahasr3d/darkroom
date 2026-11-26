import { describe, expect, test } from 'vitest'
import { DEFAULT_RIG, lutTarget, mixLook } from '../look'
import { identityLut, LUT_MAX_SIZE, LutParseError, lutNameFromFile, parseCube, toRgba } from '../lut'

type Rgb3 = [number, number, number]

/** A cube in .cube order (red fastest) where every lattice point is f(r, g, b). */
function cubeText(size: number, f: (r: number, g: number, b: number) => Rgb3, header = ''): string {
  const rows: string[] = []
  const s = size - 1
  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) rows.push(f(r / s, g / s, b / s).map((v) => v.toFixed(6)).join(' '))
    }
  }
  return `${header}LUT_3D_SIZE ${size}\n${rows.join('\n')}\n`
}

const identityRows = (r: number, g: number, b: number): Rgb3 => [r, g, b]

describe('parseCube', () => {
  test('reads title, size and data in red-fastest order', () => {
    const lut = parseCube(cubeText(2, identityRows, 'TITLE "Kodak-ish"\n# a comment\n'))
    expect(lut.title).toBe('Kodak-ish')
    expect(lut.size).toBe(2)
    expect(lut.data.length).toBe(2 ** 3 * 3)
    // Second row is r = 1, g = 0, b = 0; fifth row is r = 0, g = 0, b = 1.
    expect(Array.from(lut.data.slice(3, 6))).toEqual([1, 0, 0])
    expect(Array.from(lut.data.slice(12, 15))).toEqual([0, 0, 1])
    expect(lut.domainMin).toEqual([0, 0, 0])
    expect(lut.domainMax).toEqual([1, 1, 1])
  })

  test('handles CRLF line endings, inline comments, DOMAIN_MIN/MAX and unknown keywords', () => {
    const text = cubeText(2, () => [0.5, 0.5, 0.5], 'DOMAIN_MIN 0 0 0\nDOMAIN_MAX 2 2 2 # HDR\nLUT_IN_VIDEO_RANGE\n').replace(/\n/g, '\r\n')
    const lut = parseCube(text)
    expect(lut.domainMax).toEqual([2, 2, 2])
    expect(lut.data[0]).toBeCloseTo(0.5)
  })

  test('accepts Resolve LUT_3D_INPUT_RANGE as the domain', () => {
    const lut = parseCube(cubeText(2, identityRows, 'LUT_3D_INPUT_RANGE -0.25 1.25\n'))
    expect(lut.domainMin).toEqual([-0.25, -0.25, -0.25])
    expect(lut.domainMax).toEqual([1.25, 1.25, 1.25])
  })

  test('falls back to the given title when the file has none', () => {
    expect(parseCube(cubeText(2, identityRows), 'teal-orange').title).toBe('teal-orange')
  })

  test('accepts sizes up to the limit and rejects beyond it', () => {
    expect(() => parseCube(`LUT_3D_SIZE ${LUT_MAX_SIZE + 1}\n`)).toThrow(/out of range/)
    expect(parseCube(cubeText(3, (r, g, b) => [b, g, r])).size).toBe(3)
  })

  test.each([
    ['1D LUTs', 'LUT_1D_SIZE 1024\n0 0 0\n', /1D LUT/],
    ['no size', '# empty\n', /No LUT_3D_SIZE/],
    ['data before size', '0 0 0\nLUT_3D_SIZE 2\n', /before LUT_3D_SIZE/],
    ['truncated data', 'LUT_3D_SIZE 2\n0 0 0\n1 0 0\n', /2 of 8/],
    ['too many rows', `${cubeText(2, () => [0, 0, 0])}0 0 0\n`, /Too many colour rows/],
    ['non-numeric rows', 'LUT_3D_SIZE 2\n0 0 zero\n', /needs 3 numbers/],
    ['short rows', 'LUT_3D_SIZE 2\n0 0\n', /needs 3 numbers/],
    ['a size below 2', 'LUT_3D_SIZE 1\n', /out of range/],
    ['a fractional size', 'LUT_3D_SIZE 2.5\n', /out of range/],
    ['an inverted domain', cubeText(2, () => [0, 0, 0], 'DOMAIN_MIN 1 0 0\nDOMAIN_MAX 0 1 1\n'), /DOMAIN_MIN must be below/],
    ['garbage', 'LUT_3D_SIZE 2\n@@@\n', /valid .cube syntax/],
  ])('rejects %s with a clear message', (_name, text, message) => {
    expect(() => parseCube(text)).toThrow(LutParseError)
    expect(() => parseCube(text)).toThrow(message)
  })
})

describe('identity and texture data', () => {
  test('identity cube maps every lattice point to itself', () => {
    const id = identityLut(3)
    const parsed = parseCube(cubeText(3, identityRows))
    expect(id.size).toBe(3)
    Array.from(id.data).forEach((v, i) => expect(v).toBeCloseTo(parsed.data[i], 5))
  })
  test('RGBA expansion keeps colours and sets alpha to 1', () => {
    const rgba = toRgba(identityLut(2))
    expect(rgba.length).toBe(8 * 4)
    expect(Array.from(rgba.slice(4, 8))).toEqual([1, 0, 0, 1])
    expect(Array.from(rgba.slice(28, 32))).toEqual([1, 1, 1, 1])
  })
  test('filename fallback strips the extension', () => {
    expect(lutNameFromFile('Teal Orange.cube')).toBe('Teal Orange')
    expect(lutNameFromFile('.cube')).toBe('Custom grade')
  })
})

describe('grade strength in the look', () => {
  test('no grade loaded means no LUT sampling', () => {
    expect(lutTarget(DEFAULT_RIG).lutMix).toBe(0)
  })
  test('strength maps 0..100 to 0..1 and clamps', () => {
    expect(lutTarget({ lutId: 'x', lutStrength: 60 }).lutMix).toBeCloseTo(0.6)
    expect(lutTarget({ lutId: 'x', lutStrength: 140 }).lutMix).toBe(1)
  })
  test('scales with body intensity like other strengths', () => {
    expect(mixLook(lutTarget({ lutId: 'x', lutStrength: 100 }), 0.5).lutMix).toBeCloseTo(0.5)
  })
})
