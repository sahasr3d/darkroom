import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]):not([tabindex="-1"]), select, textarea, video[controls], [tabindex]:not([tabindex="-1"])'

/**
 * Dialog focus contract: focus moves in on open (the `initial` selector, else the first
 * focusable), Tab stays inside when `trap` is set, Escape calls `onClose`, and focus returns to
 * whatever had it before when the dialog closes.
 */
export function useDialog<T extends HTMLElement>(onClose: () => void, opts: { trap?: boolean; initial?: string } = {}): RefObject<T | null> {
  const ref = useRef<T>(null)
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])
  const { trap = true, initial } = opts

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const root = ref.current
    const first = (initial && root?.querySelector<HTMLElement>(initial)) || root?.querySelector<HTMLElement>(FOCUSABLE)
    ;(first ?? root)?.focus()

    /** Only the topmost modal answers keys, wherever focus has fallen (e.g. onto the page after a key unmounted). */
    const isTopmost = (): boolean => {
      const modals = document.querySelectorAll('[role="dialog"][aria-modal="true"]')
      return !!root && modals[modals.length - 1] === root
    }
    const onKey = (e: KeyboardEvent) => {
      if (!root || !isTopmost()) return
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        closeRef.current()
        return
      }
      if (!trap || e.key !== 'Tab') return
      const items = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement)
      if (items.length === 0) return
      const [head, tail] = [items[0], items[items.length - 1]]
      const inside = root.contains(document.activeElement)
      if (!inside || (e.shiftKey && document.activeElement === head)) {
        e.preventDefault()
        ;(e.shiftKey ? tail : head).focus()
      } else if (!e.shiftKey && document.activeElement === tail) {
        e.preventDefault()
        head.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      if (opener?.isConnected) opener.focus({ preventScroll: true })
    }
  }, [trap, initial])

  return ref
}

/**
 * Escape for a dialog that does not hold focus (the film roll stays open while you use the
 * finder): listens on the window, but never while a modal dialog is on top.
 */
export function useEscape(onClose: () => void): void {
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || document.querySelector('[role="dialog"][aria-modal="true"]')) return
      closeRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

/** Callback ref that focuses an element as it mounts (confirm steps that replace the key just pressed). */
export function focusOnMount(el: HTMLElement | null): void {
  el?.focus({ preventScroll: true })
}
