import { audioChainFor, isClean } from './chain'
import { buildAudioGraph, type AudioGraph } from './graph'

/**
 * Where a clip's sound comes from: the microphone for the live camera, the file's own track for an
 * imported video, and nothing for a still (which then only carries the body's room tone).
 */
export type SoundSource = 'microphone' | 'file' | 'none'

export function soundSourceOf(media: { hasStream: boolean; blobSrc: boolean }): SoundSource {
  if (media.hasStream) return 'microphone'
  return media.blobSrc ? 'file' : 'none'
}

export interface RecordingAudio {
  /** The processed track to add to the recording, or null for a silent clip. */
  track: MediaStreamTrack | null
  /** Status-line note when sound was wanted but couldn't be had (empty otherwise). */
  note: string
  /** Stop the microphone and generators, and close the audio context. Safe to call twice. */
  release: () => void
}

const SILENT: RecordingAudio = { track: null, note: '', release: () => undefined }

interface OpenOptions {
  image: CanvasImageSource
  bodyId: string
  fps: number
}

/** Open the microphone, or null if it was refused or there is none. */
async function openMicrophone(): Promise<MediaStream | null> {
  if (!navigator.mediaDevices?.getUserMedia) return null
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true }, video: false })
  } catch {
    return null
  }
}

/** A hidden audio-only player on the imported file, so its sound reaches the recording only. */
async function openFileAudio(video: HTMLVideoElement): Promise<HTMLAudioElement | null> {
  const audio = new Audio()
  audio.src = video.src
  audio.loop = true
  audio.preload = 'auto'
  try {
    audio.currentTime = video.currentTime
    await audio.play()
    return audio
  } catch {
    audio.removeAttribute('src')
    audio.load()
    return null
  }
}

/**
 * Set up the clip's sound: source → the body's retro chain → a MediaStream track for the
 * MediaRecorder. Never throws; a failure records a silent clip and explains why in `note`.
 */
export async function openRecordingAudio({ image, bodyId, fps }: OpenOptions): Promise<RecordingAudio> {
  const spec = audioChainFor(bodyId)
  const video = image instanceof HTMLVideoElement ? image : null
  const kind = soundSourceOf({ hasStream: !!video && video.srcObject instanceof MediaStream, blobSrc: !!video && video.src.startsWith('blob:') })
  if (kind === 'none' && isClean(spec)) return SILENT
  if (typeof AudioContext === 'undefined') return { ...SILENT, note: ' without sound (this browser has no Web Audio)' }

  let mic: MediaStream | null = null
  let fileAudio: HTMLAudioElement | null = null
  if (kind === 'microphone') {
    mic = await openMicrophone()
    if (!mic) return { ...SILENT, note: ' without sound: the microphone is blocked or missing' }
  } else if (kind === 'file' && video) {
    fileAudio = await openFileAudio(video)
    if (!fileAudio) return { ...SILENT, note: ' without sound: the video’s audio could not be played' }
  }

  const ctx = new AudioContext()
  let graph: AudioGraph | null = null
  let released = false
  const release = () => {
    if (released) return
    released = true
    graph?.stop()
    mic?.getTracks().forEach((t) => t.stop())
    if (fileAudio) {
      fileAudio.pause()
      fileAudio.removeAttribute('src')
      fileAudio.load()
    }
    void ctx.close().catch(() => undefined)
  }
  try {
    if (ctx.state === 'suspended') await ctx.resume()
    const input = mic ? ctx.createMediaStreamSource(mic) : fileAudio ? ctx.createMediaElementSource(fileAudio) : null
    graph = buildAudioGraph(ctx, input, spec, fps)
    return { track: graph.track, note: '', release }
  } catch (err: unknown) {
    release()
    return { ...SILENT, note: ` without sound (${err instanceof Error ? err.message : 'the sound chain failed'})` }
  }
}
