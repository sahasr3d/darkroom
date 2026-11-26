import { useCallback, useRef, useState } from 'react'
import { CAMERA_BODIES } from '../cameras/registry'
import { formatBytes, KIND_LABEL, type RollEntry } from '../app/roll/entry'
import type { Roll } from '../app/roll/useRoll'
import { Switch } from './controls'
import { IconClose, IconTrash } from './icons'
import { RollViewer } from './RollViewer'
import { focusOnMount, useDialog } from './useDialog'
import { useObjectUrl } from './useObjectUrl'

type Props = {
  roll: Roll
  alsoDownload: boolean
  onAlsoDownload: (on: boolean) => void
  onRedevelop: (entry: RollEntry) => Promise<void>
  onStatus: (message: string) => void
  onClose: () => void
}

const badgeOf = (id: string): string => CAMERA_BODIES.find((b) => b.id === id)?.badge ?? 'Unknown camera'
const errorOf = (err: unknown, fallback: string): string => (err instanceof Error && err.message ? err.message : fallback)

function Thumb({ entry, onOpen }: { entry: RollEntry; onOpen: (id: string) => void }) {
  const url = useObjectUrl(entry.thumb)
  const when = new Date(entry.createdAt).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  return (
    <li>
      <button type="button" data-entry={entry.id} className="roll-thumb" aria-label={`${KIND_LABEL[entry.kind]} from the ${badgeOf(entry.bodyId)}, ${when}`} onClick={() => onOpen(entry.id)}>
        {url ? <img src={url} alt="" loading="lazy" decoding="async" /> : <span className="grid h-full place-items-center text-[11px] text-dim">{KIND_LABEL[entry.kind]}</span>}
        {entry.kind !== 'photo' && <span className="roll-tag">{KIND_LABEL[entry.kind]}</span>}
      </button>
    </li>
  )
}

/** The camera roll: every exposure kept on this device, newest first, with a viewer that plays loops and clips in place. */
export function RollSheet({ roll, alsoDownload, onAlsoDownload, onRedevelop, onStatus, onClose }: Props) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const gridRef = useRef<HTMLUListElement>(null)
  const { entries } = roll
  const index = openId ? entries.findIndex((e) => e.id === openId) : -1
  const open = index >= 0 ? entries[index] : null

  const back = useCallback(() => {
    const id = openId
    setOpenId(null)
    // After the grid has rendered again, put focus back on the shot that was open.
    window.setTimeout(() => gridRef.current?.querySelector<HTMLElement>(`[data-entry="${id}"]`)?.focus(), 0)
  }, [openId])
  // Escape steps back out of the viewer first, then closes the roll.
  const dialogRef = useDialog<HTMLDivElement>(open ? back : onClose)

  const remove = async (entry: RollEntry) => {
    try {
      const next = entries[index + 1] ?? entries[index - 1] ?? null
      await roll.remove(entry.id)
      setOpenId(next?.id ?? null)
      onStatus(`Deleted ${entry.filename}.`)
    } catch (err: unknown) {
      setError(errorOf(err, 'The shot could not be deleted.'))
    }
  }
  const clear = async () => {
    try {
      await roll.clear()
      setConfirmClear(false)
      onStatus('Camera roll cleared.')
    } catch (err: unknown) {
      setError(errorOf(err, 'The roll could not be cleared.'))
    }
  }
  const redevelop = async (entry: RollEntry) => {
    await onRedevelop(entry)
    onClose()
  }

  const count = entries.length
  const summary = `${count} ${count === 1 ? 'shot' : 'shots'}, ${formatBytes(roll.bytes)} ${roll.persistent ? 'on this device' : 'this visit'}`

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="roll-title" tabIndex={-1} className="plate sheet-panel max-w-[920px]" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center gap-3 px-3 py-2.5">
          <div className="min-w-0">
            <h2 id="roll-title" className="text-[13px] font-medium text-silver">
              Camera roll
            </h2>
            <p className="font-[family-name:var(--font-osd)] text-[12px] tabular-nums text-dim">{roll.ready ? summary : 'Opening…'}</p>
          </div>
          <button type="button" className="key key-icon ml-auto" aria-label="Close camera roll" onClick={onClose}>
            <IconClose />
          </button>
        </header>

        {(roll.notice || error) && (
          <p role="alert" className="mx-3 mb-2 border border-amber-deep px-3 py-2 text-[12px] leading-5 text-silver [text-wrap:pretty]">
            {error ?? roll.notice}
          </p>
        )}

        {open ? (
          <RollViewer key={open.id} entry={open} position={index} count={count} onBack={back} onStep={(d) => setOpenId(entries[index + d]?.id ?? open.id)} onDelete={remove} onRedevelop={redevelop} onStatus={onStatus} />
        ) : (
          <>
            <div className="hairline-t scroll-quiet min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
              {roll.ready && count === 0 ? (
                <div className="roll-empty">
                  <p className="text-[13px] text-silver">No shots yet</p>
                  <p className="max-w-[34ch] text-[12px] leading-5 text-dim [text-wrap:pretty]">Press the shutter. Every exposure develops on this device and waits here, ready to share, save or develop again.</p>
                </div>
              ) : (
                <ul ref={gridRef} className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-5">
                  {entries.map((e) => (
                    <Thumb key={e.id} entry={e} onOpen={setOpenId} />
                  ))}
                </ul>
              )}
            </div>
            <footer className="hairline-t grid gap-2 px-3 py-2 sm:flex sm:items-center sm:gap-4">
              <div className="sm:w-[260px]">
                <Switch label="Also download each shot" checked={alsoDownload} onChange={onAlsoDownload} />
              </div>
              {confirmClear ? (
                <div role="group" aria-label="Confirm clearing the roll" className="flex flex-wrap items-center gap-2 sm:ml-auto">
                  <span className="text-[12px] text-silver">Delete all {count} shots for good?</span>
                  <button type="button" className="key" onClick={() => void clear()}>
                    Clear roll
                  </button>
                  <button ref={focusOnMount} type="button" className="key" onClick={() => setConfirmClear(false)}>
                    Keep them
                  </button>
                </div>
              ) : (
                <button type="button" className="key justify-self-start sm:ml-auto" disabled={count === 0} onClick={() => setConfirmClear(true)}>
                  <IconTrash />
                  Clear roll
                </button>
              )}
            </footer>
          </>
        )}
      </div>
    </div>
  )
}
