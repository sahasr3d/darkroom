import { useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from 'react'
import { captureFrame, type LiveCamera } from '../engine/capture'
import type { Pipeline, SourceImage } from '../engine/pipeline'
import type { SceneId } from '../engine/scenes'
import { fileSource, isVideoFile, releaseVideoSource, sceneSource, videoFileSource } from '../engine/sources'

const FONT_FACES = ["16px 'JetBrains Mono'", "700 16px 'Space Mono'", "16px 'Share Tech Mono'", "16px 'Caveat'", "16px 'Permanent Marker'"]

export const errorText = (err: unknown): string => (err instanceof Error ? err.message : 'Something went wrong.')

export interface Sources {
  still: SourceImage | null
  /** Second image: half-frame frame B, or the second exposure of a double exposure. */
  pair: SourceImage | null
  setPair: Dispatch<SetStateAction<SourceImage | null>>
  /** First exposure frozen while a live two-exposure shot is half done. */
  frameA: SourceImage | null
  setFrameA: Dispatch<SetStateAction<SourceImage | null>>
  fontsReady: boolean
  pairInputRef: RefObject<HTMLInputElement | null>
  onScene: (id: SceneId) => void
  /** Load a photo or video as the source; resolves false if it could not be opened. */
  onFile: (file: File) => Promise<boolean>
  onPairFile: (file: File) => Promise<void>
  /** Grab the current frame of whatever is moving: the live camera or an imported video. */
  liveFrame: () => SourceImage | null
  onFreeze: () => void
}

interface Options {
  pipeline: Pipeline | null
  camera: LiveCamera
  /** A two-exposure setup is mounted and the camera is live: a half-done frame A may survive. */
  keepFrameA: boolean
  multiFrame: boolean
  onStatus: (message: string) => void
  /** Called after a scene or file becomes the source (closes the film roll). */
  onLoaded: () => void
}

/** What is in front of the lens: scenes, imports, the frozen frame and the second exposure. */
export function useSources({ pipeline, camera, keepFrameA, multiFrame, onStatus, onLoaded }: Options): Sources {
  const [still, setStill] = useState<SourceImage | null>(null)
  const [pair, setPair] = useState<SourceImage | null>(null)
  const [frameA, setFrameA] = useState<SourceImage | null>(null)
  const [fontsReady, setFontsReady] = useState(false)
  const uploadSeq = useRef(0)
  const pairSeq = useRef(0)
  const pairInputRef = useRef<HTMLInputElement>(null)

  // A half-done two-exposure shot only survives while the camera stays live on such a setup.
  useEffect(() => {
    if (!keepFrameA) setFrameA(null)
  }, [keepFrameA])

  useEffect(() => {
    let alive = true
    Promise.all(FONT_FACES.map((f) => document.fonts.load(f)))
      .catch(() => undefined)
      .then(() => {
        if (!alive) return
        setFontsReady(true)
        setStill((s) => s ?? sceneSource('golden'))
      })
    return () => {
      alive = false
    }
  }, [])

  // Decoded uploads hold large ImageBitmaps; free each one as soon as it is replaced.
  useEffect(() => {
    const replaced = still
    return () => {
      if (replaced?.image instanceof ImageBitmap) replaced.image.close()
      releaseVideoSource(replaced)
    }
  }, [still])
  useEffect(() => {
    const image = pair?.image
    return () => {
      if (image instanceof ImageBitmap) image.close()
    }
  }, [pair])

  const onScene = (id: SceneId) => {
    camera.stop()
    setStill(sceneSource(id))
    onLoaded()
  }
  const onFile = async (file: File): Promise<boolean> => {
    if (!pipeline) return false
    const seq = ++uploadSeq.current
    try {
      const video = isVideoFile(file)
      const src = video ? await videoFileSource(file) : await fileSource(file, pipeline.maxSize)
      if (seq !== uploadSeq.current) {
        if (src.image instanceof ImageBitmap) src.image.close()
        releaseVideoSource(src)
        return false
      }
      camera.stop()
      setStill(src)
      onLoaded()
      onStatus(`Loaded ${src.label} (${src.width}×${src.height}${video ? ', video' : ''}).`)
      return true
    } catch (err: unknown) {
      onStatus(errorText(err))
      return false
    }
  }
  const onPairFile = async (file: File) => {
    if (!pipeline) return
    const seq = ++pairSeq.current
    try {
      const src = await fileSource(file, pipeline.maxSize)
      if (seq !== pairSeq.current) {
        if (src.image instanceof ImageBitmap) src.image.close()
        return
      }
      setPair(src)
      onStatus(multiFrame ? `Frame B: ${src.label}.` : `Second exposure: ${src.label}.`)
    } catch (err: unknown) {
      onStatus(errorText(err))
    }
  }

  const liveFrame = (): SourceImage | null => {
    const src = camera.liveSource ?? (still?.live ? still : null)
    return src && src.image instanceof HTMLVideoElement ? captureFrame(src.image, !!src.mirrored) : null
  }
  const onFreeze = () => {
    const frame = liveFrame()
    if (!frame) return
    camera.stop()
    setStill(frame)
    onStatus('Frame held. Grade it, then develop.')
  }

  return { still, pair, setPair, frameA, setFrameA, fontsReady, pairInputRef, onScene, onFile, onPairFile, liveFrame, onFreeze }
}
