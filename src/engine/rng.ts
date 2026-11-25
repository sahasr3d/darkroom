/** Mulberry32 — small, fast, deterministic PRNG so every "variation" is reproducible from its seed. */
export type Rng = () => number

export function createRng(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const randRange = (rng: Rng, min: number, max: number): number => min + (max - min) * rng()

export const randInt = (rng: Rng, min: number, max: number): number => Math.floor(randRange(rng, min, max + 1))

export function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length) % items.length]
}

export const newSeed = (): number => Math.floor(Math.random() * 0xffffffff)

export const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v))

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t
