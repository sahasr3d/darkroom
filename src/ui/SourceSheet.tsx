import { useEffect, useRef, useState } from 'react'
import { renderScene, SCENES, type SceneId } from '../engine/scenes'
import { IconClose, IconUpload } from './icons'

type Props = {
  activeSourceId: string | null
  onScene: (id: SceneId) => void
  onFile: (file: File) => void
  onClose: () => void
}

function thumbnailOf(id: SceneId): string {
  const src = renderScene(id)
  const c = document.createElement('canvas')
  c.width = 240
  c.height = 160
  c.getContext('2d')?.drawImage(src, 0, 0, c.width, c.height)
  return c.toDataURL('image/jpeg', 0.8)
}

/** The film roll: built-in test scenes and photo import, opened from the roll key. */
export function SourceSheet({ activeSourceId, onScene, onFile, onClose }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [thumbs, setThumbs] = useState<Partial<Record<SceneId, string>>>({})

  useEffect(() => {
    const timers = SCENES.map((s, i) => window.setTimeout(() => setThumbs((t) => ({ ...t, [s.id]: thumbnailOf(s.id) })), 60 + i * 80))
    panelRef.current?.querySelector<HTMLElement>('button')?.focus()
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      timers.forEach((t) => window.clearTimeout(t))
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return (
    <div id="source-sheet" ref={panelRef} role="dialog" aria-label="Film roll" className="plate absolute inset-x-2 bottom-2 z-20 grid gap-3 p-3 lg:inset-x-auto lg:bottom-4 lg:left-4 lg:w-[420px]">
      <div className="flex items-center justify-between">
        <span className="text-[12px] text-silver">Film roll</span>
        <button type="button" className="key h-8 w-8 p-0" aria-label="Close film roll" onClick={onClose}>
          <IconClose />
        </button>
      </div>
      <ul className="grid grid-cols-3 gap-2">
        {SCENES.map((s) => {
          const on = activeSourceId === `scene-${s.id}`
          return (
            <li key={s.id}>
              <button type="button" aria-pressed={on} onClick={() => onScene(s.id)} className={`grid w-full gap-1 border p-1 text-left ${on ? 'border-amber-deep' : 'border-line hover:border-line-hi'}`}>
                <span className="relative block aspect-[3/2] w-full overflow-hidden bg-black">
                  {thumbs[s.id] && <img src={thumbs[s.id]} alt="" className="h-full w-full object-cover" />}
                  {on && <span className="led led-amber absolute left-1 top-1" aria-hidden="true" />}
                </span>
                <span className="text-[11px] leading-4 text-silver">{s.label}</span>
              </button>
            </li>
          )
        })}
      </ul>
      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/*"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onFile(f)
          e.target.value = ''
        }}
      />
      <button type="button" className="key w-full" onClick={() => fileRef.current?.click()}>
        <IconUpload />
        Import a photo or video
      </button>
      <p className="text-[11px] leading-4 text-dim">You can also drop a photo or video on the viewfinder. Nothing leaves this device.</p>
    </div>
  )
}
