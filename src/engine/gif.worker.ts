/// <reference lib="webworker" />
import { encodeGifBytes, type RgbaFrame } from './gifEncode'

/**
 * GIF encoding off the main thread: palette quantisation for sixteen 640px frames takes long
 * enough to freeze the viewfinder. Frames arrive as transferred buffers; the GIF goes back the same way.
 */
export interface GifJob {
  frames: RgbaFrame[]
  order: number[]
  delayMs: number
}

export type GifReply = { ok: true; bytes: Uint8Array<ArrayBuffer> } | { ok: false; message: string }

const scope = self as unknown as DedicatedWorkerGlobalScope

scope.onmessage = (e: MessageEvent<GifJob>) => {
  try {
    const bytes = encodeGifBytes(e.data.frames, e.data.order, e.data.delayMs)
    const reply: GifReply = { ok: true, bytes }
    scope.postMessage(reply, [bytes.buffer])
  } catch (err: unknown) {
    const reply: GifReply = { ok: false, message: err instanceof Error ? err.message : 'The GIF could not be encoded.' }
    scope.postMessage(reply)
  }
}
