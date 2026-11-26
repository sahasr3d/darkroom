import { useMemo, useState, type KeyboardEvent } from 'react'
import { CAMERA_BODIES } from '../cameras/registry'
import { formatBytes, KIND_LABEL, type RollEntry } from '../app/roll/entry'
import { download } from '../engine/exporter'
import { IconArrow, IconReseed, IconSave, IconShare, IconTrash } from './icons'
import { useObjectUrl } from './useObjectUrl'
import { focusOnMount } from './useDialog'

type Props = {
  entry: RollEntry
  position: number
  count: number
  onBack: () => void
  onStep: (delta: -1 | 1) => void
  onDelete: (entry: RollEntry) => Promise<void>
  onRedevelop: (entry: RollEntry) => Promise<void>
  onStatus: (message: string) => void
}

const whenOf = (t: number): string => new Date(t).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

function shareFile(entry: RollEntry): File | null {
  if (typeof File === 'undefined' || typeof navigator.canShare !== 'function') return null
  const file = new File([entry.blob], entry.filename, { type: entry.blob.type })
  try {
    return navigator.canShare({ files: [file] }) ? file : null
  } catch {
    return null
  }
}

/** One shot from the roll, full size: photos and contact sheets as images, GIFs and clips playing in place. */
export function RollViewer({ entry, position, count, onBack, onStep, onDelete, onRedevelop, onStatus }: Props) {
  const url = useObjectUrl(entry.blob)
  const file = useMemo(() => shareFile(entry), [entry])
  const [confirming, setConfirming] = useState(false)
  const [working, setWorking] = useState(false)
  const body = CAMERA_BODIES.find((b) => b.id === entry.bodyId)
  const badge = body?.badge ?? 'Unknown camera'
  const canRedevelop = entry.kind === 'photo' && !!entry.original && !!body
  const label = `${KIND_LABEL[entry.kind]} from the ${badge}, ${whenOf(entry.createdAt)}`

  const share = async () => {
    if (!file) return
    try {
      await navigator.share({ files: [file], title: entry.filename })
    } catch (err: unknown) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) onStatus('Sharing did not work here. Use Save to download it instead.')
    }
  }
  /** Left and right step through the roll, except where a video's own controls want them. */
  const onArrows = (e: KeyboardEvent<HTMLDivElement>) => {
    if ((e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') || e.target instanceof HTMLVideoElement) return
    e.preventDefault()
    onStep(e.key === 'ArrowLeft' ? -1 : 1)
  }
  const run = async (task: () => Promise<void>) => {
    setWorking(true)
    try {
      await task()
    } finally {
      setWorking(false)
    }
  }

  return (
    <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)_auto]" onKeyDown={onArrows}>
      <div className="flex items-center gap-2 px-3 py-2">
        <button type="button" className="key" onClick={onBack} ref={focusOnMount}>
          <IconArrow />
          All shots
        </button>
        <span className="ml-auto font-[family-name:var(--font-osd)] text-[12px] tabular-nums text-dim" aria-live="polite">
          {position + 1} of {count}
        </span>
        <button type="button" className="key key-icon" aria-label="Newer shot" disabled={position === 0} onClick={() => onStep(-1)}>
          <IconArrow />
        </button>
        <button type="button" className="key key-icon" aria-label="Older shot" disabled={position >= count - 1} onClick={() => onStep(1)}>
          <IconArrow className="rotate-180" />
        </button>
      </div>

      <figure className="finder-well m-0 grid min-h-[200px] place-items-center overflow-hidden p-2">
        {url && entry.kind === 'video' ? (
          <video key={url} src={url} width={entry.width} height={entry.height} className="roll-media h-auto w-auto" controls autoPlay loop muted playsInline aria-label={label} />
        ) : url ? (
          <img key={url} src={url} alt={label} width={entry.width} height={entry.height} className="roll-media h-auto w-auto" />
        ) : null}
      </figure>

      <div className="hairline-t grid gap-3 px-3 py-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="badge text-[14px]" translate="no">{badge}</span>
          <span className="text-[12px] text-silver">{KIND_LABEL[entry.kind]}</span>
          <span className="font-[family-name:var(--font-osd)] text-[12px] tabular-nums text-dim">
            {whenOf(entry.createdAt)}, {entry.width}×{entry.height}, {formatBytes(entry.blob.size)}
          </span>
        </div>
        {confirming ? (
          <div role="group" aria-label="Confirm delete" className="flex flex-wrap items-center gap-2">
            <span className="mr-auto text-[12px] text-silver">Delete this shot? It can’t be undone.</span>
            <button type="button" className="key" disabled={working} onClick={() => void run(() => onDelete(entry))}>
              <IconTrash />
              Delete
            </button>
            <button ref={focusOnMount} type="button" className="key" onClick={() => setConfirming(false)}>
              Keep it
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            {file && (
              <button type="button" className="key" onClick={() => void share()}>
                <IconShare />
                Share
              </button>
            )}
            <button type="button" className="key" onClick={() => download({ blob: entry.blob, width: entry.width, height: entry.height, filename: entry.filename })}>
              <IconSave />
              Save
            </button>
            {canRedevelop && (
              <button type="button" className="key" disabled={working} onClick={() => void run(() => onRedevelop(entry))}>
                <IconReseed />
                Re-develop
              </button>
            )}
            <button type="button" className="key sm:ml-auto" onClick={() => setConfirming(true)}>
              <IconTrash />
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
