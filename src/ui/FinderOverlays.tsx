import type { Rect } from '../cameras/types'
import type { GridKind } from '../app/aids'

type Props = {
  /** Image area inside the shell, in CSS pixels. */
  image: Rect
  grid: GridKind
  /** Camera roll in degrees, or null when the level is off. */
  roll: number | null
  /** Focus point in image uv, or null. */
  focus: readonly [number, number] | null
  countdown: number | null
  /** Shown while a two-exposure shot is half done, e.g. "Exposure 2 of 2". */
  badge: string | null
}

const PHI = 0.382

/** Non-recording viewfinder aids: grid, artificial horizon, focus reticle, timer, exposure badge. */
export function FinderOverlays({ image, grid, roll, focus, countdown, badge }: Props) {
  const lines: [number, number, number, number][] = []
  if (grid === 'thirds' || grid === 'golden') {
    const a = grid === 'thirds' ? 1 / 3 : PHI
    for (const t of [a, 1 - a]) lines.push([t, 0, t, 1], [0, t, 1, t])
  }
  const level = roll !== null && Math.abs(roll) < 1
  return (
    <div className="pointer-events-none absolute" style={{ left: image.x, top: image.y, width: image.w, height: image.h }} aria-hidden="true">
      {grid !== 'off' && (
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1 1" preserveAspectRatio="none">
          {lines.map(([x1, y1, x2, y2], i) => (
            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(255,255,255,0.45)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          ))}
          {grid === 'cross' && (
            <>
              <line x1="0.47" y1="0.5" x2="0.53" y2="0.5" stroke="rgba(255,255,255,0.7)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
              <line x1="0.5" y1="0.46" x2="0.5" y2="0.54" stroke="rgba(255,255,255,0.7)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            </>
          )}
        </svg>
      )}

      {roll !== null && (
        <div className="absolute inset-0 grid place-items-center">
          {/* Fixed reference marks at the frame edges, and the rotating horizon bar between them. */}
          <span className="absolute left-[16%] top-1/2 h-px w-[5%] bg-white/50" />
          <span className="absolute right-[16%] top-1/2 h-px w-[5%] bg-white/50" />
          <div className="relative h-0.5" style={{ width: '56%', transform: `rotate(${-roll}deg)` }}>
            <span className={`absolute inset-0 ${level ? 'bg-amber shadow-[0_0_6px_var(--color-amber)]' : 'bg-white/80 shadow-[0_0_0_1px_rgba(0,0,0,0.35)]'}`} />
            <span className={`absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap font-[family-name:var(--font-osd)] text-[11px] ${level ? 'text-amber' : 'text-white/90'}`}>
              {level ? 'Level' : `${roll > 0 ? '+' : ''}${roll.toFixed(1)}°`}
            </span>
          </div>
        </div>
      )}

      {focus && (
        <span className="absolute h-14 w-14 -translate-x-1/2 -translate-y-1/2 border border-amber shadow-[0_0_0_1px_rgba(0,0,0,0.5)]" style={{ left: `${focus[0] * 100}%`, top: `${focus[1] * 100}%` }}>
          <span className="absolute left-1/2 top-0 h-1.5 w-px -translate-x-1/2 bg-amber" />
          <span className="absolute bottom-0 left-1/2 h-1.5 w-px -translate-x-1/2 bg-amber" />
          <span className="absolute left-0 top-1/2 h-px w-1.5 -translate-y-1/2 bg-amber" />
          <span className="absolute right-0 top-1/2 h-px w-1.5 -translate-y-1/2 bg-amber" />
        </span>
      )}

      {badge && <span className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/70 px-2 py-0.5 font-[family-name:var(--font-osd)] text-[12px] text-amber">{badge}</span>}

      {countdown !== null && (
        <span key={countdown} className="absolute inset-0 grid place-items-center font-[family-name:var(--font-osd)] text-[88px] leading-none text-amber [text-shadow:0_0_18px_rgba(255,176,32,0.6)]">
          {countdown}
        </span>
      )}
    </div>
  )
}
