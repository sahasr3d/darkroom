import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type PointerEvent } from 'react'
import type { Rect } from '../cameras/types'
import type { Pipeline, Shot } from '../engine/pipeline'
import { INITIAL_GOVERNOR, previewTag, scaleOf, stepGovernor } from '../engine/previewScale'
import { clamp } from '../engine/rng'
import type { GridKind } from '../app/aids'
import { FinderOverlays } from './FinderOverlays'

const scaleRect = (r: Rect, s: number): Rect => ({ x: r.x * s, y: r.y * s, w: r.w * s, h: r.h * s })

type Props = {
  pipeline: Pipeline | null
  error: string | null
  shot: Shot | null
  compare: boolean
  /** Changes on every exposure; replays the shutter curtain. */
  exposureKey: number
  onFile: (file: File) => void
  grid: GridKind
  roll: number | null
  countdown: number | null
  badge: string | null
  /** Tap sets a focus point (image uv); double-tap clears it. */
  onFocus: (point: readonly [number, number] | null) => void
  /** Pinch or scroll: multiply the focal length by this factor. */
  onZoom: (factor: number) => void
  /** False on fixed-lens bodies: the wheel then scrolls the page as usual. */
  canZoom: boolean
  /** performance.now() when recording began (drives REC/timecode OSDs), or null. */
  recordingSince: number | null
}

/** A tap is a press that moves less than this and lifts within TAP_MS. */
const TAP_SLOP_PX = 8
const TAP_MS = 350
const DOUBLE_TAP_MS = 320
const WHEEL_ZOOM_STEP = 1.06

/** Never render the preview beyond this many device pixels on the long edge. */
const PREVIEW_MAX_EDGE = 2048
const FRAME_INTERVAL_MS = 1000 / 60

function useBoxSize<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setSize({ w: Math.floor(entry.contentRect.width), h: Math.floor(entry.contentRect.height) }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, size] as const
}

export function Viewfinder({ pipeline, error, shot, compare, exposureKey, onFile, grid, roll, countdown, badge, onFocus, onZoom, canZoom, recordingSince }: Props) {
  const [wellRef, box] = useBoxSize<HTMLDivElement>()
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const press = useRef<{ x: number; y: number; t: number } | null>(null)
  const lastTap = useRef(0)
  const pinchDist = useRef<number | null>(null)
  const onZoomRef = useRef(onZoom)
  useEffect(() => {
    onZoomRef.current = onZoom
  }, [onZoom])

  // Scroll-to-zoom needs a non-passive listener so the page doesn't scroll instead.
  useEffect(() => {
    const el = wellRef.current
    if (!el || !canZoom) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      onZoomRef.current(e.deltaY < 0 ? WHEEL_ZOOM_STEP : 1 / WHEEL_ZOOM_STEP)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [wellRef, canZoom])
  const afterRef = useRef<HTMLCanvasElement>(null)
  const beforeRef = useRef<HTMLCanvasElement>(null)
  const shellRef = useRef<HTMLDivElement>(null)
  const [split, setSplit] = useState(0.5)
  const [dragging, setDragging] = useState(false)
  const [renderError, setRenderError] = useState<string | null>(null)
  const [glEpoch, setGlEpoch] = useState(0)
  /** Adaptive preview resolution: render-time governor (ref, per frame) and its level (state, rare). */
  const governor = useRef(INITIAL_GOVERNOR)
  const [previewLevel, setPreviewLevel] = useState(0)

  useEffect(() => {
    if (!pipeline) return
    pipeline.renderer.onRestored = () => setGlEpoch((e) => e + 1)
    return () => {
      pipeline.renderer.onRestored = null
    }
  }, [pipeline])

  const animated = !!shot && (!!shot.source.live || shot.body.animated(shot.params))
  // Stills always preview at full resolution; only moving previews trade pixels for frame rate.
  const previewScale = animated ? scaleOf({ level: previewLevel }) : 1

  const layout = useMemo(() => {
    if (!pipeline || !shot || box.w < 8 || box.h < 8) return null
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const edge = PREVIEW_MAX_EDGE * previewScale
    return pipeline.previewLayout(shot, Math.min(box.w * dpr * previewScale, edge), Math.min(box.h * dpr * previewScale, edge))
  }, [pipeline, shot, box.w, box.h, previewScale])

  useEffect(() => {
    if (!animated) governor.current = INITIAL_GOVERNOR
  }, [animated])

  useEffect(() => {
    if (!pipeline || !shot || !layout) return
    const after = afterRef.current
    const before = beforeRef.current
    if (!after || !before) return
    let raf = 0
    let last = -Infinity
    const draw = (now: number) => {
      try {
        const t0 = performance.now()
        pipeline.render(after, shot, layout, { time: now / 1000, forExport: false, elapsed: recordingSince === null ? null : (now - recordingSince) / 1000 })
        if (animated) {
          const next = stepGovernor(governor.current, performance.now() - t0)
          if (next.level !== governor.current.level) setPreviewLevel(next.level)
          governor.current = next
        }
        if (compare) pipeline.renderBefore(before, after, shot, layout)
        setRenderError(null)
      } catch (err: unknown) {
        setRenderError(err instanceof Error ? err.message : 'The viewfinder could not be drawn.')
      }
    }
    const tick = (now: number) => {
      if (animated) raf = requestAnimationFrame(tick)
      if (now - last < FRAME_INTERVAL_MS - 2) return
      last = now
      draw(now)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [pipeline, shot, layout, compare, animated, glEpoch, recordingSince])

  const display = useMemo(() => {
    if (!layout) return null
    const s = Math.min(box.w / layout.canvasW, box.h / layout.canvasH)
    return { w: Math.floor(layout.canvasW * s), h: Math.floor(layout.canvasH * s) }
  }, [layout, box.w, box.h])

  const moveSplit = (clientX: number) => {
    const rect = shellRef.current?.getBoundingClientRect()
    if (rect) setSplit(clamp((clientX - rect.left) / rect.width, 0, 1))
  }
  /** Image uv of a client point, relative to the first exposure's rect. */
  const uvAt = (clientX: number, clientY: number): readonly [number, number] | null => {
    const rect = shellRef.current?.getBoundingClientRect()
    if (!rect || !layout) return null
    const s = rect.width / layout.canvasW
    const img = layout.slots[0].rect
    const u = (clientX - rect.left - img.x * s) / (img.w * s)
    const v = (clientY - rect.top - img.y * s) / (img.h * s)
    return u < 0 || u > 1 || v < 0 || v > 1 ? null : [u, v]
  }

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      pinchDist.current = Math.hypot(a.x - b.x, a.y - b.y)
      press.current = null
      return
    }
    press.current = { x: e.clientX, y: e.clientY, t: performance.now() }
    if (compare) moveSplit(e.clientX)
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 2 && pinchDist.current) {
      const [a, b] = [...pointers.current.values()]
      const d = Math.hypot(a.x - b.x, a.y - b.y)
      if (Math.abs(d - pinchDist.current) > 6) {
        onZoom(d / pinchDist.current)
        pinchDist.current = d
      }
      return
    }
    if (compare) moveSplit(e.clientX)
  }
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinchDist.current = null
    const p = press.current
    press.current = null
    if (!p || compare) return
    const moved = Math.hypot(e.clientX - p.x, e.clientY - p.y)
    if (moved > TAP_SLOP_PX || performance.now() - p.t > TAP_MS) return
    const now = performance.now()
    if (now - lastTap.current < DOUBLE_TAP_MS) {
      lastTap.current = 0
      onFocus(null)
      return
    }
    lastTap.current = now
    const uv = uvAt(e.clientX, e.clientY)
    if (uv) onFocus(uv)
  }
  const onSplitKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 0.1 : 0.02
    if (e.key === 'ArrowLeft') setSplit((s) => clamp(s - step, 0, 1))
    else if (e.key === 'ArrowRight') setSplit((s) => clamp(s + step, 0, 1))
    else if (e.key === 'Home') setSplit(0)
    else if (e.key === 'End') setSplit(1)
    else return
    e.preventDefault()
  }
  const onDrop = (e: DragEvent<HTMLElement>) => {
    e.preventDefault()
    setDragging(false)
    const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith('image/') || f.type.startsWith('video/')) ?? e.dataTransfer.files[0]
    if (file) onFile(file)
  }

  const shownError = error ?? renderError
  const scaleTag = previewTag(previewScale)
  const tagBase = 'pointer-events-none absolute bg-black/70 px-1.5 py-0.5 font-[family-name:var(--font-osd)] text-[11px] text-amber'
  const tagClass = `${tagBase} top-2`

  return (
    <section
      aria-label="Viewfinder"
      className="relative flex h-full min-h-0 flex-col p-2 lg:p-4"
      onDragEnter={(e) => {
        if (e.dataTransfer.types.includes('Files')) setDragging(true)
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false)
      }}
      onDrop={onDrop}
    >
      <div ref={wellRef} className="finder-well relative min-h-[220px] flex-1 overflow-hidden">
        {display && (
          <div
            ref={shellRef}
            className="screen-shell absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 select-none"
            style={{ width: display.w, height: display.h, touchAction: 'none' }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={(e) => {
              pointers.current.delete(e.pointerId)
              pinchDist.current = null
              press.current = null
            }}
          >
            <canvas ref={afterRef} className="absolute inset-0" role="img" aria-label={shot ? `${shot.body.badge} rendering of ${shot.source.label}` : 'Viewfinder'} />
            <canvas ref={beforeRef} className="absolute inset-0" aria-hidden="true" style={{ clipPath: `inset(0 ${(1 - split) * 100}% 0 0)`, visibility: compare ? 'visible' : 'hidden' }} />
            <span className="bracket left-1.5 top-1.5 border-l border-t" aria-hidden="true" />
            <span className="bracket right-1.5 top-1.5 border-r border-t" aria-hidden="true" />
            <span className="bracket bottom-1.5 left-1.5 border-b border-l" aria-hidden="true" />
            <span className="bracket bottom-1.5 right-1.5 border-b border-r" aria-hidden="true" />
            {layout && (
              <FinderOverlays
                image={scaleRect(layout.slots[0].rect, display.w / layout.canvasW)}
                grid={grid}
                roll={roll}
                focus={shot?.rig.focus ?? null}
                countdown={countdown}
                badge={badge}
              />
            )}
            {compare && (
              <>
                <span className={`${tagClass} left-2`}>Original</span>
                <span className={`${tagClass} right-2`}>{shot?.body.badge}</span>
                <div
                  className="split-handle"
                  style={{ left: `${split * 100}%` }}
                  role="slider"
                  tabIndex={0}
                  aria-label="Before and after divider"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(split * 100)}
                  aria-valuetext={`${Math.round(split * 100)}% original`}
                  onKeyDown={onSplitKey}
                >
                  <span className="split-grip" />
                </div>
              </>
            )}
            {scaleTag && (
              <span className={`${tagBase} bottom-2 right-2`}>
                {scaleTag}
              </span>
            )}
            {exposureKey > 0 && <div key={exposureKey} className="curtain pointer-events-none absolute inset-0 bg-black" aria-hidden="true" />}
          </div>
        )}
        {!display && !shownError && <p className="absolute inset-0 grid place-items-center font-[family-name:var(--font-osd)] text-[13px] text-dim">Loading film…</p>}
        {shownError && (
          <div role="alert" className="absolute inset-x-4 top-1/2 -translate-y-1/2 border border-rec bg-black/85 p-4 font-[family-name:var(--font-osd)] text-[13px] leading-5 text-silver">
            {shownError}
          </div>
        )}
        {dragging && (
          <div className="pointer-events-none absolute inset-3 grid place-items-center border border-dashed border-amber bg-black/70 text-[14px] text-amber">
            Drop to load this photo or video
          </div>
        )}
      </div>
    </section>
  )
}
