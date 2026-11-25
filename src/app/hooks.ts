import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { applyHardware, NO_HARDWARE, trackOf, type HardwareApplied } from '../engine/hardware'
import type { Rig } from '../engine/look'
import type { SourceImage } from '../engine/pipeline'
import { playTick } from '../engine/shutterSound'

/**
 * Self-timer: `start(seconds)` counts down once a second (with a tick) and calls `onFire` at zero.
 * Returns the number currently shown, or null.
 */
export function useSelfTimer(onFire: () => void): { countdown: number | null; start: (seconds: number) => void; cancel: () => void } {
  const [countdown, setCountdown] = useState<number | null>(null)
  const timer = useRef<number | null>(null)
  const fireRef = useRef(onFire)
  useEffect(() => {
    fireRef.current = onFire
  }, [onFire])

  const cancel = useCallback(() => {
    if (timer.current !== null) window.clearInterval(timer.current)
    timer.current = null
    setCountdown(null)
  }, [])

  const start = useCallback(
    (seconds: number) => {
      cancel()
      let left = seconds
      setCountdown(left)
      playTick(false)
      timer.current = window.setInterval(() => {
        left -= 1
        if (left <= 0) {
          cancel()
          fireRef.current()
          return
        }
        playTick(left === 1)
        setCountdown(left)
      }, 1000)
    },
    [cancel],
  )

  useEffect(() => cancel, [cancel])
  return { countdown, start, cancel }
}

/** Push manual exposure, white balance and focus to the live camera when it supports them. */
export function useHardwareSync(liveSource: SourceImage | null, rig: Rig): HardwareApplied {
  const [applied, setApplied] = useState<HardwareApplied>(NO_HARDWARE)
  const rigRef = useRef(rig)
  useEffect(() => {
    rigRef.current = rig
  }, [rig])
  const { manual, iso, shutter, kelvin, focus } = rig

  useEffect(() => {
    const video = liveSource?.image
    const track = video instanceof HTMLVideoElement ? trackOf(video) : null
    if (!track) {
      setApplied(NO_HARDWARE)
      return
    }
    let cancelled = false
    void applyHardware(track, { ...rigRef.current, manual, iso, shutter, kelvin, focus }).then((result) => {
      if (!cancelled) setApplied(result)
    })
    return () => {
      cancelled = true
    }
  }, [liveSource, manual, iso, shutter, kelvin, focus])
  return applied
}

/**
 * Fullscreen one element (the viewfinder). Uses the Fullscreen API where allowed; where it is
 * blocked (embedded views, iOS Safari) it falls back to filling the window (`fallback: true`).
 */
export function useFullscreen<T extends HTMLElement>(ref: RefObject<T | null>): { active: boolean; fallback: boolean; toggle: () => void } {
  const [mode, setMode] = useState<'off' | 'native' | 'fallback'>('off')
  useEffect(() => {
    const onChange = () => setMode((m) => (ref.current && document.fullscreenElement === ref.current ? 'native' : m === 'native' ? 'off' : m))
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [ref])
  useEffect(() => {
    if (mode !== 'fallback') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMode('off')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode])
  const toggle = useCallback(() => {
    if (mode === 'native') {
      void document.exitFullscreen()
      return
    }
    if (mode === 'fallback') {
      setMode('off')
      return
    }
    const el = ref.current
    if (!el?.requestFullscreen) {
      setMode('fallback')
      return
    }
    el.requestFullscreen().catch(() => setMode('fallback'))
  }, [mode, ref])
  return { active: mode !== 'off', fallback: mode === 'fallback', toggle }
}
