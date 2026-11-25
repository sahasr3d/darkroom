import { useEffect, useRef, type KeyboardEvent } from 'react'
import { CAMERA_BODIES, shelfGroups } from '../cameras/registry'

type Props = {
  value: string
  onChange: (id: string) => void
}

/**
 * The camera shelf. A horizontal snap carousel of body plates on phones; a grouped vertical
 * shelf on desktop. One radiogroup either way, with arrow-key navigation.
 */
export function BodyShelf({ value, onChange }: Props) {
  const listRef = useRef<HTMLDivElement>(null)
  const groups = shelfGroups()

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-body="${value}"]`)?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
  }, [value])

  const step = (e: KeyboardEvent<HTMLDivElement>) => {
    const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!delta) return
    e.preventDefault()
    const i = CAMERA_BODIES.findIndex((b) => b.id === value)
    const next = CAMERA_BODIES[(i + delta + CAMERA_BODIES.length) % CAMERA_BODIES.length]
    onChange(next.id)
    e.currentTarget.querySelector<HTMLButtonElement>(`[data-body="${next.id}"]`)?.focus()
  }

  return (
    <nav aria-label="Camera shelf" className="h-full min-h-0">
      <div
        ref={listRef}
        role="radiogroup"
        aria-label="Camera body"
        onKeyDown={step}
        className="no-scrollbar flex snap-x gap-2 overflow-x-auto px-3 py-2 lg:scroll-quiet lg:block lg:h-full lg:snap-none lg:overflow-y-auto lg:overflow-x-hidden lg:px-3 lg:py-3"
      >
        {groups.map((g) => (
          <div key={g.category} role="presentation" className="flex gap-2 lg:mb-4 lg:grid lg:gap-1.5">
            <span className="engrave hidden px-1 lg:block">{g.label}</span>
            {g.bodies.map((b) => {
              const on = b.id === value
              return (
                <button
                  key={b.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-label={`${b.badge}: ${b.tagline}`}
                  data-body={b.id}
                  tabIndex={on ? 0 : -1}
                  onClick={() => onChange(b.id)}
                  className="body-plate snap-center"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="badge">{b.badge}</span>
                    <span className={`led ${on ? 'led-amber' : ''}`} aria-hidden="true" />
                  </span>
                  <span className="font-[family-name:var(--font-osd)] text-[11px] text-dim">{b.format}</span>
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </nav>
  )
}
