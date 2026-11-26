import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { COACH_STEPS, type CoachEvent, type CoachState } from '../app/onboarding'
import { useEscape } from './useDialog'

type Props = {
  state: CoachState
  onEvent: (event: CoachEvent) => void
}

interface Box {
  x: number
  y: number
  w: number
  h: number
}

const GAP = 12
const MARGIN = 12
const RING = 6

/** Each visible control tagged `data-coach={target}`, clipped to the window (inset by the ring) so a full-height shelf keeps its outline. */
function targetBoxes(target: string): Box[] {
  const inset = RING + 1
  return [...document.querySelectorAll<HTMLElement>(`[data-coach="${target}"]`)]
    .map((el) => el.getBoundingClientRect())
    .filter((r) => r.width > 0 && r.height > 0)
    .map((r) => {
      const x = Math.max(inset, r.left)
      const y = Math.max(inset, r.top)
      return { x, y, w: Math.max(0, Math.min(window.innerWidth - inset, r.right) - x), h: Math.max(0, Math.min(window.innerHeight - inset, r.bottom) - y) }
    })
}

/** The box around several boxes (the card is placed against all of them). */
function unionOf(boxes: readonly Box[]): Box | null {
  if (boxes.length === 0) return null
  const x = Math.min(...boxes.map((b) => b.x))
  const y = Math.min(...boxes.map((b) => b.y))
  return { x, y, w: Math.max(...boxes.map((b) => b.x + b.w)) - x, h: Math.max(...boxes.map((b) => b.y + b.h)) - y }
}

/** Full-window dim with a square hole per highlighted control (even-odd fill). */
function dimPath(boxes: readonly Box[]): string {
  const holes = boxes.map((b) => `M${b.x - RING} ${b.y - RING}h${b.w + RING * 2}v${b.h + RING * 2}h${-(b.w + RING * 2)}z`).join('')
  return `M0 0H${window.innerWidth}V${window.innerHeight}H0z${holes}`
}

const clampTo = (v: number, min: number, max: number): number => Math.min(Math.max(min, v), max)

/** Card below the target if it fits, else above, else beside a tall target; always inside the window. */
function cardPosition(box: Box, cardW: number, cardH: number): { left: number; top: number } {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const centredLeft = clampTo(box.x + box.w / 2 - cardW / 2, MARGIN, vw - cardW - MARGIN)
  const below = box.y + box.h + RING + GAP
  if (below + cardH <= vh - MARGIN) return { left: centredLeft, top: below }
  const above = box.y - RING - GAP - cardH
  if (above >= MARGIN) return { left: centredLeft, top: above }
  const top = clampTo(box.y + box.h / 2 - cardH / 2, MARGIN, vh - cardH - MARGIN)
  const right = box.x + box.w + RING + GAP
  if (right + cardW <= vw - MARGIN) return { left: right, top }
  const left = box.x - RING - GAP - cardW
  if (left >= MARGIN) return { left, top }
  return { left: centredLeft, top: vh - cardH - MARGIN }
}

function Card({ state, onEvent }: Props) {
  const step = COACH_STEPS[state.step]
  const last = state.step === COACH_STEPS.length - 1
  const cardRef = useRef<HTMLDivElement>(null)
  const primaryRef = useRef<HTMLButtonElement>(null)
  /** undefined until first measured; empty when the target is not on screen. */
  const [boxes, setBoxes] = useState<Box[] | undefined>(undefined)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  useEscape(() => onEvent('skip'))

  // Bring the control into view, then follow it through resizes and scrolling.
  useEffect(() => {
    document.querySelector(`[data-coach="${step.target}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    let frame = 0
    const measure = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setBoxes(targetBoxes(step.target)))
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [step.target])

  useLayoutEffect(() => {
    const card = cardRef.current
    if (!card || boxes === undefined) return
    const around = unionOf(boxes)
    setPos(around ? cardPosition(around, card.offsetWidth, card.offsetHeight) : { left: Math.max(MARGIN, (window.innerWidth - card.offsetWidth) / 2), top: MARGIN * 4 })
  }, [boxes])

  // Focus the primary key once the card is placed (a hidden card cannot take focus).
  const placed = pos !== null
  useEffect(() => {
    if (placed) primaryRef.current?.focus({ preventScroll: true })
  }, [state.step, placed])

  return (
    <>
      {boxes && boxes.length > 0 && (
        <svg className="coach-dim" aria-hidden="true">
          <path d={dimPath(boxes)} fillRule="evenodd" />
        </svg>
      )}
      {boxes?.map((b, i) => (
        <div key={i} className="coach-ring" aria-hidden="true" style={{ left: b.x - RING, top: b.y - RING, width: b.w + RING * 2, height: b.h + RING * 2 }} />
      ))}
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="false"
        aria-labelledby="coach-title"
        aria-describedby="coach-body"
        className="plate coach-card"
        style={pos ? { left: pos.left, top: pos.top } : { visibility: 'hidden' }}
      >
        <p className="font-[family-name:var(--font-osd)] text-[12px] tabular-nums text-amber">
          {state.step + 1} of {COACH_STEPS.length}
        </p>
        <h2 id="coach-title" className="text-[14px] font-medium text-silver [text-wrap:balance]">
          {step.title}
        </h2>
        <p id="coach-body" className="text-[12px] leading-5 text-dim [text-wrap:pretty]">
          {step.body}
        </p>
        <div className="mt-1 flex items-center gap-2">
          <button type="button" className="key key-quiet -ml-2" onClick={() => onEvent('skip')}>
            Skip tour
          </button>
          {state.step > 0 && (
            <button type="button" className="key ml-auto" onClick={() => onEvent('back')}>
              Back
            </button>
          )}
          <button ref={primaryRef} type="button" className={`key key-primary ${state.step > 0 ? '' : 'ml-auto'}`} onClick={() => onEvent('next')}>
            {last ? 'Start shooting' : 'Next'}
          </button>
        </div>
      </div>
    </>
  )
}

/**
 * First-visit coach marks: a ring around the real control and a short card beside it. Non-modal
 * (the highlighted controls stay usable), keyboard reachable, Escape skips; focus returns to
 * where it was when the tour ends.
 */
export function CoachMarks({ state, onEvent }: Props) {
  const opener = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (!state.open) return
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    return () => {
      if (opener.current?.isConnected) opener.current.focus({ preventScroll: true })
    }
  }, [state.open])
  return state.open ? <Card state={state} onEvent={onEvent} /> : null
}
