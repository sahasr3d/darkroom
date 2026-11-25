import { useCallback, useEffect, useRef, useState } from 'react'
import type { SourceImage } from './pipeline'

export type Facing = 'environment' | 'user'
export type CameraState = 'off' | 'starting' | 'live'

export interface LiveCamera {
  state: CameraState
  facing: Facing
  /** True once the device reports more than one camera (enables the flip key). */
  canFlip: boolean
  liveSource: SourceImage | null
  start: (facing?: Facing) => Promise<void>
  flip: () => Promise<void>
  stop: () => void
}

export function cameraErrorMessage(err: unknown): string {
  const name = err instanceof DOMException ? err.name : ''
  if (name === 'NotAllowedError') return 'Camera access is blocked. Allow it from the address bar, then press the camera key again.'
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No camera was found on this device.'
  if (name === 'NotReadableError') return 'The camera is busy in another app. Close it there and try again.'
  if (!navigator.mediaDevices?.getUserMedia) return 'This browser cannot open a camera here. Use HTTPS or localhost.'
  return 'The camera could not start.'
}

/** Freeze the current video frame into a still, matching what the viewfinder showed. */
export function captureFrame(video: HTMLVideoElement, mirrored: boolean): SourceImage {
  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas unavailable')
  if (mirrored) {
    ctx.translate(canvas.width, 0)
    ctx.scale(-1, 1)
  }
  ctx.drawImage(video, 0, 0)
  const t = new Date()
  return { id: `capture-${t.getTime()}`, label: `Shot ${t.toLocaleTimeString()}`, image: canvas, width: canvas.width, height: canvas.height }
}

async function countVideoInputs(): Promise<number> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices()
    return devices.filter((d) => d.kind === 'videoinput').length
  } catch {
    return 0
  }
}

/** Owns one MediaStream and exposes it as a live SourceImage re-uploaded every frame. */
export function useLiveCamera(onError: (message: string) => void): LiveCamera {
  const [state, setState] = useState<CameraState>('off')
  const [facing, setFacing] = useState<Facing>('environment')
  const [canFlip, setCanFlip] = useState(false)
  const [liveSource, setLiveSource] = useState<SourceImage | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  /** Bumped by stop()/unmount so a getUserMedia() that resolves late is discarded. */
  const attemptRef = useRef(0)

  const release = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
  }

  const stop = useCallback(() => {
    attemptRef.current += 1
    release()
    setLiveSource(null)
    setState('off')
  }, [])

  const start = useCallback(
    async (want: Facing = 'environment') => {
      const attempt = ++attemptRef.current
      release()
      // Drop the old source so the viewfinder never uploads a video with no stream attached.
      setLiveSource(null)
      setState('starting')
      let stream: MediaStream | null = null
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('unsupported')
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: want }, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60 } },
          audio: false,
        })
        if (attempt !== attemptRef.current) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        const track = stream.getVideoTracks()[0]
        track?.addEventListener('ended', stop)
        const actual = (track?.getSettings().facingMode as Facing | undefined) ?? want
        const video = videoRef.current ?? document.createElement('video')
        videoRef.current = video
        video.muted = true
        video.playsInline = true
        video.srcObject = stream
        await video.play()
        if (attempt !== attemptRef.current) return
        const inputs = await countVideoInputs()
        if (attempt !== attemptRef.current) return
        const mirrored = actual === 'user'
        const toSource = (): SourceImage => ({ id: `live-${actual}`, label: mirrored ? 'Front camera' : 'Rear camera', image: video, width: video.videoWidth, height: video.videoHeight, live: true, mirrored })
        // Phones rotate the stream on orientation change; refresh the dimensions when they do.
        video.onresize = () => {
          if (attempt === attemptRef.current && video.videoWidth > 0) setLiveSource(toSource())
        }
        setFacing(actual)
        setCanFlip(inputs > 1)
        setLiveSource(toSource())
        setState('live')
      } catch (err: unknown) {
        stream?.getTracks().forEach((t) => t.stop())
        if (streamRef.current === stream) streamRef.current = null
        if (attempt !== attemptRef.current) return
        setState('off')
        onError(cameraErrorMessage(err))
      }
    },
    [onError, stop],
  )

  const flip = useCallback(() => start(facing === 'user' ? 'environment' : 'user'), [facing, start])

  useEffect(
    () => () => {
      attemptRef.current += 1
      streamRef.current?.getTracks().forEach((t) => t.stop())
    },
    [],
  )

  return { state, facing, canFlip, liveSource, start, flip, stop }
}
