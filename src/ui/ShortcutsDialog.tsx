import { SHORTCUT_HELP } from '../app/shortcuts'
import { IconClose } from './icons'
import { useDialog } from './useDialog'

type Props = { onClose: () => void }

/** The ? card: every key the studio answers to, engraved like a panel legend. */
export function ShortcutsDialog({ onClose }: Props) {
  const ref = useDialog<HTMLDivElement>(onClose)
  return (
    <div className="sheet-backdrop lg:place-items-center" onClick={onClose}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="keys-title" className="plate sheet-panel max-w-[440px]" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center gap-3 px-4 py-2.5">
          <h2 id="keys-title" className="text-[13px] font-medium text-silver">
            Keyboard shortcuts
          </h2>
          <button type="button" className="key key-icon ml-auto" aria-label="Close keyboard shortcuts" onClick={onClose}>
            <IconClose />
          </button>
        </header>
        <dl className="hairline-t grid gap-y-2.5 px-4 py-4">
          {SHORTCUT_HELP.map((s) => (
            <div key={s.label} className="grid grid-cols-[92px_1fr] items-center gap-3">
              <dt className="flex gap-1">
                {s.keys.map((k) => (k === '–' ? <span key={k} className="self-center text-dim" aria-label="to">–</span> : <kbd key={k} className="keycap">{k}</kbd>))}
              </dt>
              <dd className="m-0 text-[12px] text-silver">{s.label}</dd>
            </div>
          ))}
        </dl>
        <p className="hairline-t px-4 py-3 text-[11px] leading-4 text-dim [text-wrap:pretty]">Shortcuts pause while you type in a field. Space presses a focused key instead of the shutter.</p>
      </div>
    </div>
  )
}
