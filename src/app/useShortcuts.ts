import { useEffect, useRef } from 'react'
import { shortcutFor, type FocusContext, type ShortcutAction } from './shortcuts'

const TYPING = 'input:not([type=range]):not([type=checkbox]):not([type=radio]):not([type=button]), textarea, select, [contenteditable=""], [contenteditable="true"]'
const CONTROL = 'button, a[href], input, [role=button], [role=radio], [role=switch], [role=tab], [role=slider], [tabindex]'

/** Where focus is, as the shortcut mapper understands it. */
function focusContext(): FocusContext {
  const el = document.activeElement
  if (!(el instanceof HTMLElement) || el === document.body) return 'none'
  if (el.matches(TYPING) || el.isContentEditable) return 'typing'
  // A control focused by keyboard owns Space; one merely clicked with the mouse does not.
  return el.matches(CONTROL) && el.matches(':focus-visible') ? 'control' : 'none'
}

/**
 * Global keyboard shortcuts. The rules live in `shortcutFor`; this hook only reads the focus and
 * dialog context and dispatches. A handler that returns false lets the key through.
 */
export function useShortcuts(onAction: (action: ShortcutAction) => boolean | void): void {
  const handler = useRef(onAction)
  useEffect(() => {
    handler.current = onAction
  }, [onAction])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return
      const action = shortcutFor(e, {
        focus: focusContext(),
        modalOpen: !!document.querySelector('[role="dialog"][aria-modal="true"]'),
        sheetOpen: !!document.querySelector('[role="dialog"]:not([aria-modal="true"])'),
      })
      if (!action || handler.current(action) === false) return
      e.preventDefault()
      // Space on a mouse-clicked button would also press it; take focus off so only the shutter fires.
      if (action.type === 'shutter' && document.activeElement instanceof HTMLElement) document.activeElement.blur()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
