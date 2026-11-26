/**
 * Adobe / DaVinci Resolve `.cube` 3D LUT parsing. Pure: text in, typed data out.
 *
 * Format: optional `TITLE "…"`, `LUT_3D_SIZE n`, `DOMAIN_MIN r g b`, `DOMAIN_MAX r g b`
 * (or Resolve's `LUT_3D_INPUT_RANGE lo hi`), `#` comments, then n³ lines of `r g b` with red
 * changing fastest — the same order a TEXTURE_3D expects (x = red, y = green, z = blue).
 */

export const LUT_MIN_SIZE = 2
export const LUT_MAX_SIZE = 65

export type Rgb = readonly [number, number, number]

export interface CubeLut {
  title: string
  size: number
  domainMin: Rgb
  domainMax: Rgb
  /** size³ RGB triplets, red fastest. */
  data: Float32Array<ArrayBuffer>
}

export class LutParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LutParseError'
  }
}

const numbersOf = (parts: readonly string[], count: number, line: number, what: string): number[] => {
  const values = parts.slice(0, count).map(Number)
  if (parts.length < count || values.some((v) => !Number.isFinite(v))) {
    throw new LutParseError(`Line ${line}: ${what} needs ${count} numbers.`)
  }
  return values
}

const triple = (v: readonly number[]): Rgb => [v[0], v[1], v[2]]

/** Parse a .cube file. Throws LutParseError with a message fit for the status line. */
export function parseCube(text: string, fallbackTitle = 'Custom grade'): CubeLut {
  let title = ''
  let size = 0
  let domainMin: Rgb = [0, 0, 0]
  let domainMax: Rgb = [1, 1, 1]
  let data: Float32Array<ArrayBuffer> | null = null
  let count = 0

  const lines = text.split(/\r\n|\r|\n/)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/#.*$/, '').trim()
    if (!line) continue
    const lineNo = i + 1
    const [keyword, ...rest] = line.split(/\s+/)
    const key = keyword.toUpperCase()

    if (key === 'TITLE') {
      title = line.slice(keyword.length).trim().replace(/^"(.*)"$/, '$1')
    } else if (key === 'LUT_1D_SIZE') {
      throw new LutParseError('This is a 1D LUT. Load a 3D .cube file (one with LUT_3D_SIZE).')
    } else if (key === 'LUT_3D_SIZE') {
      size = numbersOf(rest, 1, lineNo, 'LUT_3D_SIZE')[0]
      if (!Number.isInteger(size) || size < LUT_MIN_SIZE || size > LUT_MAX_SIZE) {
        throw new LutParseError(`LUT_3D_SIZE ${rest[0]} is out of range. Use a cube from ${LUT_MIN_SIZE} to ${LUT_MAX_SIZE} points per side.`)
      }
      data = new Float32Array(size * size * size * 3)
    } else if (key === 'DOMAIN_MIN') {
      domainMin = triple(numbersOf(rest, 3, lineNo, 'DOMAIN_MIN'))
    } else if (key === 'DOMAIN_MAX') {
      domainMax = triple(numbersOf(rest, 3, lineNo, 'DOMAIN_MAX'))
    } else if (key === 'LUT_3D_INPUT_RANGE') {
      const [lo, hi] = numbersOf(rest, 2, lineNo, 'LUT_3D_INPUT_RANGE')
      domainMin = [lo, lo, lo]
      domainMax = [hi, hi, hi]
    } else if (/^[-+.\d]/.test(keyword)) {
      if (!data) throw new LutParseError(`Line ${lineNo}: colour data before LUT_3D_SIZE. This doesn't look like a 3D .cube file.`)
      if (count >= size * size * size) throw new LutParseError(`Too many colour rows: LUT_3D_SIZE ${size} expects ${size ** 3}.`)
      const rgb = numbersOf([keyword, ...rest], 3, lineNo, 'A colour row')
      data.set(rgb, count * 3)
      count += 1
    } else if (/^[A-Z][A-Z0-9_]*$/.test(key)) {
      // Unknown keyword (e.g. LUT_IN_VIDEO_RANGE): the format allows vendors to add their own.
      continue
    } else {
      throw new LutParseError(`Line ${lineNo}: “${line.slice(0, 40)}” isn't valid .cube syntax.`)
    }
  }

  if (!data) throw new LutParseError('No LUT_3D_SIZE found. Load a 3D .cube file.')
  if (count !== size ** 3) throw new LutParseError(`The file ends after ${count} of ${size ** 3} colour rows. It may be truncated.`)
  if (domainMin.some((lo, c) => lo >= domainMax[c])) throw new LutParseError('DOMAIN_MIN must be below DOMAIN_MAX on every channel.')
  return { title: title || fallbackTitle, size, domainMin, domainMax, data }
}

/** The do-nothing cube: output equals input. Bound whenever no grade is loaded. */
export function identityLut(size = LUT_MIN_SIZE): CubeLut {
  const data = new Float32Array(size ** 3 * 3)
  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        const i = (r + g * size + b * size * size) * 3
        data[i] = r / (size - 1)
        data[i + 1] = g / (size - 1)
        data[i + 2] = b / (size - 1)
      }
    }
  }
  return { title: 'Identity', size, domainMin: [0, 0, 0], domainMax: [1, 1, 1], data }
}

/** RGB → RGBA (alpha 1) for a filterable RGBA16F texture upload. */
export function toRgba(lut: CubeLut): Float32Array<ArrayBuffer> {
  const n = lut.size ** 3
  const out = new Float32Array(n * 4)
  for (let i = 0; i < n; i++) {
    out[i * 4] = lut.data[i * 3]
    out[i * 4 + 1] = lut.data[i * 3 + 1]
    out[i * 4 + 2] = lut.data[i * 3 + 2]
    out[i * 4 + 3] = 1
  }
  return out
}

/** Filename without its extension, for LUTs that carry no TITLE. */
export const lutNameFromFile = (filename: string): string => filename.replace(/\.[^.]+$/, '') || 'Custom grade'
