/**
 * Retro video capture. Each frame is rendered through the full pipeline into a canvas on a fixed
 * clock, then pushed into a MediaRecorder via `captureStream(0)` + `requestFrame()`, so an 18 fps
 * clip contains exactly 18 distinct frames per second (that choppy home-movie cadence).
 */

const MIME_CANDIDATES = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4;codecs=avc1', 'video/mp4'] as const

/** The first container/codec this browser can record, or null if MediaRecorder can't do video. */
export function pickMimeType(isSupported: (type: string) => boolean = (t) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)): string | null {
  return MIME_CANDIDATES.find((t) => isSupported(t)) ?? null
}

export const extensionFor = (mime: string): string => (mime.startsWith('video/mp4') ? 'mp4' : 'webm')

export const MAX_RECORDING_SECONDS = 60

export interface RecordingResult {
  blob: Blob
  mimeType: string
  seconds: number
  frames: number
}

export interface RecordingSession {
  /** Seconds since the recording started. */
  elapsed: () => number
  stop: () => Promise<RecordingResult>
}

interface StartOptions {
  canvas: HTMLCanvasElement
  fps: number
  /** Render one frame into `canvas` for this moment of the clip. */
  drawFrame: (elapsedSeconds: number, frameIndex: number) => void
  maxSeconds?: number
  /** Called if the clip hits `maxSeconds` and stops itself. */
  onAutoStop?: (result: RecordingResult) => void
  /** Called if an automatic stop fails to save. */
  onAutoStopError?: (err: unknown) => void
  bitsPerSecond?: number
}

type FrameTrack = MediaStreamTrack & { requestFrame?: () => void }

export class RecordingUnsupportedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RecordingUnsupportedError'
  }
}

export function startRecording(opts: StartOptions): RecordingSession {
  const mimeType = pickMimeType()
  if (!mimeType || typeof opts.canvas.captureStream !== 'function') {
    throw new RecordingUnsupportedError('This browser cannot record video from a canvas. Try a current Chrome, Edge, Firefox or Safari.')
  }
  // Draw the first frame before capture starts so the stream never opens on a blank canvas.
  opts.drawFrame(0, 0)
  let stream = opts.canvas.captureStream(0)
  let track = stream.getVideoTracks()[0] as FrameTrack | undefined
  const manual = typeof track?.requestFrame === 'function'
  if (!manual) {
    stream.getTracks().forEach((t) => t.stop())
    stream = opts.canvas.captureStream(opts.fps)
    track = stream.getVideoTracks()[0] as FrameTrack | undefined
  }

  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: opts.bitsPerSecond ?? 8_000_000 })
  const chunks: Blob[] = []
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data)
  }
  const started = performance.now()
  let frames = 1
  const elapsed = () => (performance.now() - started) / 1000
  const maxSeconds = opts.maxSeconds ?? MAX_RECORDING_SECONDS

  let stopping: Promise<RecordingResult> | null = null
  let timer = 0
  const stop = (): Promise<RecordingResult> => {
    if (stopping) return stopping
    window.clearInterval(timer)
    const seconds = elapsed()
    stopping = new Promise<RecordingResult>((resolve, reject) => {
      const finish = () => {
        stream.getTracks().forEach((t) => t.stop())
        resolve({ blob: new Blob(chunks, { type: mimeType }), mimeType, seconds, frames })
      }
      recorder.onerror = () => reject(new Error('The recording failed while saving.'))
      if (recorder.state === 'inactive') finish()
      else {
        recorder.onstop = finish
        recorder.stop()
      }
    })
    return stopping
  }

  // Start the recorder before the frame clock, so a failure here leaks no timer or tracks.
  try {
    recorder.start(500)
  } catch (err: unknown) {
    stream.getTracks().forEach((t) => t.stop())
    throw new RecordingUnsupportedError(err instanceof Error ? `Recording could not start: ${err.message}` : 'Recording could not start.')
  }
  if (manual) track?.requestFrame?.()

  timer = window.setInterval(() => {
    const t = elapsed()
    if (t >= maxSeconds) {
      stop().then(
        (r) => opts.onAutoStop?.(r),
        (err: unknown) => opts.onAutoStopError?.(err),
      )
      return
    }
    opts.drawFrame(t, frames)
    frames += 1
    if (manual) track?.requestFrame?.()
  }, 1000 / opts.fps)

  return { elapsed, stop }
}
