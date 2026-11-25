import { useEffect, useRef, useState } from 'react'
import type { CameraBody } from '../cameras/types'
import { DEFAULT_RIG } from '../engine/look'
import type { Pipeline, Shot } from '../engine/pipeline'
import { SCENES, type SceneId } from '../engine/scenes'
import { sceneSource } from '../engine/sources'
import { IconClose } from './icons'

type Props = {
  pipeline: Pipeline
  body: CameraBody
  onClose: () => void
}

interface Sample {
  scene: SceneId
  label: string
  url: string
}

/** Develop one sample off-screen through the real pipeline at a modest size. */
function developSample(pipeline: Pipeline, body: CameraBody, scene: SceneId): string {
  const shot: Shot = { body, params: body.defaults, rig: DEFAULT_RIG, source: sceneSource(scene) }
  const canvas = document.createElement('canvas')
  pipeline.render(canvas, shot, pipeline.previewLayout(shot, 720, 520), { time: 1, forExport: true })
  const url = canvas.toDataURL('image/jpeg', 0.88)
  canvas.width = 0
  canvas.height = 0
  return url
}

/** "Sample" contact sheet: the body's stock look on every built-in scene, before you shoot. */
export function SampleSheet({ pipeline, body, onClose }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const [samples, setSamples] = useState<Sample[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const order: SceneId[] = [body.sampleScene, ...SCENES.map((s) => s.id).filter((id) => id !== body.sampleScene)]
    let cancelled = false
    // One sample per tick so the sheet appears immediately and fills in.
    const timers = order.map((scene, i) =>
      window.setTimeout(() => {
        if (cancelled) return
        try {
          const url = developSample(pipeline, body, scene)
          setSamples((s) => [...s, { scene, label: SCENES.find((x) => x.id === scene)?.label ?? scene, url }])
        } catch (err: unknown) {
          setError(err instanceof Error ? err.message : 'The sample could not be developed.')
        }
      }, 30 + i * 40),
    )
    return () => {
      cancelled = true
      timers.forEach((t) => window.clearTimeout(t))
    }
  }, [pipeline, body])

  useEffect(() => {
    dialogRef.current?.querySelector<HTMLElement>('button')?.focus()
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/80 p-3" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${body.badge} samples`}
        className="plate scroll-quiet grid max-h-[92dvh] w-full max-w-[980px] gap-3 overflow-y-auto p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="badge text-[18px]">{body.badge}</div>
            <p className="text-[12px] text-dim">{body.tagline}</p>
            <p className="font-[family-name:var(--font-osd)] text-[12px] text-amber">{body.format}</p>
          </div>
          <button type="button" className="key h-9 w-9 shrink-0 p-0" aria-label="Close samples" onClick={onClose}>
            <IconClose />
          </button>
        </div>
        {error && (
          <p role="alert" className="border border-rec p-2 text-[12px] text-silver">
            {error}
          </p>
        )}
        <ul className="grid gap-3 sm:grid-cols-3">
          {samples.map((s) => (
            <li key={s.scene} className="grid content-start gap-1.5">
              <img src={s.url} alt={`${body.badge} sample: ${s.label}`} className="w-full border border-line" />
              <span className="text-[11px] text-dim">{s.label}</span>
            </li>
          ))}
          {samples.length < SCENES.length && (
            <li className="grid aspect-[4/3] place-items-center border border-dashed border-line font-[family-name:var(--font-osd)] text-[12px] text-dim">Developing…</li>
          )}
        </ul>
      </div>
    </div>
  )
}
