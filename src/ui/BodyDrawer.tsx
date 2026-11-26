import { useId, type KeyboardEvent, type ReactNode } from 'react'
import type { DrawerTab } from '../app/aids'
import { num, str, type CameraBody, type Control, type ParamValue, type Params } from '../cameras/types'

const TABS: readonly { id: DrawerTab; label: string }[] = [
  { id: 'body', label: 'Body' },
  { id: 'lens', label: 'Lens' },
  { id: 'manual', label: 'Manual' },
  { id: 'aids', label: 'Aids' },
]
import { IconChevron, IconDice, IconReseed, IconSample, IconSave, IconStory, IconUpload } from './icons'
import { ControlGroupBox, Fader, ReadoutText, Segmented, Swatches, Switch } from './controls'

type Props = {
  body: CameraBody
  params: Params
  open: boolean
  outputSize: string
  busy: 'png' | 'story' | null
  canExport: boolean
  onToggle: () => void
  onSample: () => void
  tab: DrawerTab
  onTab: (tab: DrawerTab) => void
  /** Content for the non-body tabs (lens dock, manual dials, aids). */
  panels: Record<Exclude<DrawerTab, 'body'>, ReactNode>
  /** Saved recipes, shown at the top of the Body tab. */
  recipes: ReactNode
  onParam: (key: string, value: ParamValue) => void
  onRandomize: () => void
  onAction: (key: string) => void
  onPng: () => void
  onStory: () => void
}

function renderControl(c: Control, body: CameraBody, params: Params, onParam: Props['onParam'], onAction: Props['onAction']) {
  switch (c.kind) {
    case 'range': {
      const rest = typeof body.defaults[c.key] === 'number' ? (body.defaults[c.key] as number) : c.min
      return <Fader key={c.key} label={c.label} value={num(params, c.key)} min={c.min} max={c.max} step={c.step} unit={c.unit} resetTo={c.detent ?? rest} onChange={(v) => onParam(c.key, v)} />
    }
    case 'select':
      return <Segmented key={c.key} label={c.label} value={str(params, c.key)} options={c.options} onChange={(v) => onParam(c.key, v)} />
    case 'swatch':
      return <Swatches key={c.key} label={c.label} value={str(params, c.key)} options={c.options} onChange={(v) => onParam(c.key, v)} />
    case 'toggle':
      return <Switch key={c.key} label={c.label} checked={params[c.key] === true} onChange={(v) => onParam(c.key, v)} />
    case 'text':
      return <ReadoutText key={c.key} label={c.label} value={str(params, c.key)} maxLength={c.maxLength} placeholder={c.placeholder} validate={c.validate} onChange={(v) => onParam(c.key, v)} />
    case 'action':
      return (
        <button key={c.key} type="button" className="key justify-self-start" onClick={() => onAction(c.key)}>
          {c.key.endsWith('Import') ? <IconUpload /> : <IconReseed />}
          {c.label}
        </button>
      )
  }
}

/** Body settings: a pull-up sheet on phones, a permanent side panel on desktop. */
export function BodyDrawer(p: Props) {
  const panelId = useId()
  const onTabKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = TABS.findIndex((t) => t.id === p.tab)
    const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!delta) return
    e.preventDefault()
    const next = TABS[(i + delta + TABS.length) % TABS.length].id
    p.onTab(next)
    document.getElementById(`${panelId}-tab-${next}`)?.focus()
  }
  return (
    <section aria-label={`${p.body.badge} settings`} className="flex h-full min-h-0 flex-col border-line max-lg:hairline-t lg:border-l">
      <div className="flex items-center gap-2 py-1.5 pr-3">
        <button type="button" className="drawer-head flex min-w-0 flex-1 items-center justify-between gap-3 py-1 pl-4 text-left lg:pointer-events-none" aria-expanded={p.open} aria-controls={panelId} onClick={p.onToggle}>
          <span className="min-w-0">
            <span className="block text-[12px] text-silver">Camera settings</span>
            <span className="block truncate text-[11px] text-dim">{p.body.tagline}</span>
          </span>
          <IconChevron className={`shrink-0 text-dim transition-transform lg:hidden ${p.open ? 'rotate-180' : ''}`} />
        </button>
        <button type="button" className="key shrink-0 px-2.5" onClick={p.onSample} aria-label={`Sample photos from the ${p.body.badge}`}>
          <IconSample />
          Sample
        </button>
      </div>

      <div id={panelId} className={`${p.open ? 'flex' : 'hidden'} min-h-0 flex-1 flex-col lg:flex`}>
        <div role="tablist" aria-label="Drawer" className="hairline-t grid grid-cols-4" onKeyDown={onTabKey}>
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`${panelId}-tab-${t.id}`}
              aria-selected={p.tab === t.id}
              aria-controls={`${panelId}-panel`}
              tabIndex={p.tab === t.id ? 0 : -1}
              onClick={() => p.onTab(t.id)}
              className={`drawer-tab ${p.tab === t.id ? 'text-amber' : 'text-dim hover:text-silver'}`}
            >
              {t.label}
              {p.tab === t.id && <span className="absolute inset-x-3 bottom-0 h-px bg-amber" aria-hidden="true" />}
            </button>
          ))}
        </div>
        <div id={`${panelId}-panel`} role="tabpanel" aria-labelledby={`${panelId}-tab-${p.tab}`} className="scroll-quiet min-h-0 flex-1 lg:overflow-y-auto">
          {p.tab === 'body' ? (
            <>
              {p.recipes}
              <div className="hairline-t grid gap-3 px-4 pb-4 pt-3">
                <Fader label="Intensity" size="master" value={num(p.params, 'intensity')} min={0} max={100} step={1} resetTo={num(p.body.defaults, 'intensity')} onChange={(v) => p.onParam('intensity', v)} />
                <button type="button" className="key w-full" onClick={p.onRandomize}>
                  <IconDice />
                  Randomize variation
                </button>
              </div>
              {p.body.groups.map((g) => (
                <ControlGroupBox key={g.title} title={g.title}>
                  {g.controls.map((c) => renderControl(c, p.body, p.params, p.onParam, p.onAction))}
                </ControlGroupBox>
              ))}
            </>
          ) : (
            p.panels[p.tab]
          )}
        </div>

        <div className="hairline-t grid gap-2 px-4 py-3">
          <div className="flex items-baseline justify-between">
            <span className="engrave">Export</span>
            <span className="font-[family-name:var(--font-osd)] text-[11px] text-dim">{p.outputSize}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="key" onClick={p.onPng} disabled={!p.canExport || p.busy !== null}>
              <IconSave />
              {p.busy === 'png' ? 'Developing…' : 'Full-res PNG'}
            </button>
            <button type="button" className="key" onClick={p.onStory} disabled={!p.canExport || p.busy !== null}>
              <IconStory />
              {p.busy === 'story' ? 'Developing…' : 'Story 9:16'}
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
