import { useCallback, useEffect, useRef, useState } from 'react'
import type { Rig } from '../engine/look'
import { lutNameFromFile, parseCube, type CubeLut } from '../engine/lut'
import { clearStoredLut, loadStoredLut, storeLut } from '../engine/lutStore'
import type { Pipeline } from '../engine/pipeline'
import type { LoadedGrade } from '../ui/CustomGrade'

/** A 65³ cube is ~8 MB of text; anything far beyond that isn't a LUT. */
export const MAX_CUBE_BYTES = 32 * 1024 * 1024

export interface CustomGradeState {
  grade: LoadedGrade | null
  error: string | null
  loading: boolean
  load: (file: File) => Promise<void>
  remove: () => void
}

const gradeId = (lut: CubeLut): string => `${lut.title}-${lut.size}-${Date.now().toString(36)}`

/**
 * The custom film stock: a .cube LUT parsed on load, handed to the GPU, remembered in IndexedDB
 * and restored on the next visit. The rig only carries its identity and strength.
 */
export function useCustomGrade(pipeline: Pipeline | null, onRig: (patch: Partial<Rig>) => void, onStatus: (message: string) => void): CustomGradeState {
  const [grade, setGrade] = useState<LoadedGrade | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const loadSeq = useRef(0)

  /** Upload first, then publish the new rig, so the next render already samples the new cube. */
  const apply = useCallback(
    (lut: CubeLut) => {
      pipeline?.setLut(lut)
      setGrade({ title: lut.title, size: lut.size })
      setError(null)
      onRig({ lutId: gradeId(lut) })
    },
    [pipeline, onRig],
  )

  useEffect(() => {
    if (!pipeline) return
    let alive = true
    void loadStoredLut().then((lut) => {
      if (alive && lut && loadSeq.current === 0) apply(lut)
    })
    return () => {
      alive = false
    }
  }, [pipeline, apply])

  const load = useCallback(
    async (file: File) => {
      if (!pipeline) return
      const seq = ++loadSeq.current
      if (!/\.cube$/i.test(file.name)) {
        setError(`“${file.name}” isn't a .cube file. Export a 3D LUT as .cube and load it again.`)
        return
      }
      if (file.size > MAX_CUBE_BYTES) {
        setError(`“${file.name}” is over 32 MB, too large for a 3D LUT.`)
        return
      }
      setLoading(true)
      try {
        const lut = parseCube(await file.text(), lutNameFromFile(file.name))
        if (seq !== loadSeq.current) return
        apply(lut)
        const kept = await storeLut(lut)
        onStatus(`Custom grade “${lut.title}” loaded (${lut.size}³)${kept ? '' : '. It won’t be remembered: this browser blocks storage'}.`)
      } catch (err: unknown) {
        if (seq === loadSeq.current) setError(err instanceof Error ? err.message : `“${file.name}” couldn't be read.`)
      } finally {
        if (seq === loadSeq.current) setLoading(false)
      }
    },
    [pipeline, apply, onStatus],
  )

  const remove = useCallback(() => {
    loadSeq.current += 1
    pipeline?.setLut(null)
    setGrade(null)
    setError(null)
    setLoading(false)
    onRig({ lutId: null })
    void clearStoredLut()
    onStatus('Custom grade removed.')
  }, [pipeline, onRig, onStatus])

  return { grade, error, loading, load, remove }
}
