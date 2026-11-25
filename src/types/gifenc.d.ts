/** Minimal typings for gifenc 1.x (https://github.com/mattdesl/gifenc), which ships none. */
declare module 'gifenc' {
  export type Palette = number[][]
  export interface WriteFrameOptions {
    palette?: Palette
    /** Frame delay in milliseconds. */
    delay?: number
    /** 0 = loop forever, -1 = play once. Only read on the first frame. */
    repeat?: number
    transparent?: boolean
    dispose?: number
  }
  export interface Encoder {
    writeFrame(index: Uint8Array, width: number, height: number, opts?: WriteFrameOptions): void
    finish(): void
    bytes(): Uint8Array
    bytesView(): Uint8Array
  }
  export function GIFEncoder(opts?: { auto?: boolean; initialCapacity?: number }): Encoder
  export function quantize(rgba: Uint8Array | Uint8ClampedArray, maxColors: number, opts?: { format?: 'rgb565' | 'rgb444' | 'rgba4444'; oneBitAlpha?: boolean | number }): Palette
  export function applyPalette(rgba: Uint8Array | Uint8ClampedArray, palette: Palette, format?: 'rgb565' | 'rgb444' | 'rgba4444'): Uint8Array
}
