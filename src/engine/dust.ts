import { createRng, randRange, type Rng } from './rng'

/** All coordinates are normalised to the image rect (0..1); sizes are in image "units" (1/1000 short edge). */
export interface Speck {
  x: number
  y: number
  r: number
  alpha: number
  light: boolean
}

export interface Hair {
  points: readonly (readonly [number, number])[]
  width: number
  alpha: number
  light: boolean
}

export interface Scratch {
  x: number
  y0: number
  y1: number
  wobble: number
  phase: number
  width: number
  alpha: number
}

export interface DustField {
  specks: readonly Speck[]
  hairs: readonly Hair[]
  scratches: readonly Scratch[]
}

function makeHair(rng: Rng): Hair {
  const x = rng()
  const y = rng()
  const len = randRange(rng, 0.02, 0.09)
  let angle = rng() * Math.PI * 2
  const points: [number, number][] = [[x, y]]
  const steps = 7
  for (let i = 1; i <= steps; i++) {
    angle += randRange(rng, -0.9, 0.9)
    const [px, py] = points[i - 1]
    points.push([px + (Math.cos(angle) * len) / steps, py + (Math.sin(angle) * len) / steps])
  }
  return { points, width: randRange(rng, 0.6, 1.4), alpha: randRange(rng, 0.35, 0.75), light: rng() > 0.35 }
}

/**
 * Deterministic dust for a given seed. `dust` and `scratches` are 0..1 densities, so the same
 * seed with a higher density only *adds* debris (earlier items keep their positions).
 */
export function generateDust(seed: number, dust: number, scratches: number): DustField {
  const specks: Speck[] = []
  const hairs: Hair[] = []
  const lines: Scratch[] = []

  const speckRng = createRng(seed ^ 0x9e3779b9)
  const speckCount = Math.round(dust * 220)
  for (let i = 0; i < speckCount; i++) {
    const big = speckRng() > 0.93
    specks.push({
      x: speckRng(),
      y: speckRng(),
      r: big ? randRange(speckRng, 2.2, 4.5) : randRange(speckRng, 0.5, 1.8),
      alpha: randRange(speckRng, 0.35, 0.9),
      light: speckRng() > 0.3,
    })
  }

  const hairRng = createRng(seed ^ 0x85ebca6b)
  const hairCount = Math.round(dust * 9)
  for (let i = 0; i < hairCount; i++) hairs.push(makeHair(hairRng))

  const scratchRng = createRng(seed ^ 0xc2b2ae35)
  const scratchCount = Math.round(scratches * 7)
  for (let i = 0; i < scratchCount; i++) {
    const full = scratchRng() > 0.45
    const y0 = full ? 0 : randRange(scratchRng, 0, 0.6)
    lines.push({
      x: randRange(scratchRng, 0.04, 0.96),
      y0,
      y1: full ? 1 : Math.min(1, y0 + randRange(scratchRng, 0.2, 0.7)),
      wobble: randRange(scratchRng, 0.0005, 0.003),
      phase: scratchRng() * Math.PI * 2,
      width: randRange(scratchRng, 0.5, 1.6),
      alpha: randRange(scratchRng, 0.18, 0.5),
    })
  }

  return { specks, hairs, scratches: lines }
}
