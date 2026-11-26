/**
 * Keyboard shortcuts as a pure key → action mapping. The hook that listens for keys only
 * describes the focus and dialog context; every rule lives here so it can be tested.
 */

export type ShortcutAction =
  | { type: 'shutter' }
  | { type: 'camera' }
  | { type: 'sources' }
  | { type: 'roll' }
  | { type: 'compare' }
  | { type: 'prevBody' }
  | { type: 'nextBody' }
  | { type: 'body'; index: number }
  | { type: 'help' }

export interface KeyInput {
  key: string
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
  repeat?: boolean
}

/**
 * Where keyboard focus is: `typing` in a text field (no shortcuts at all), on a `control` the
 * user reached with the keyboard (Space belongs to it), or `none`.
 */
export type FocusContext = 'none' | 'control' | 'typing'

export interface ShortcutContext {
  focus: FocusContext
  /** A modal dialog is open: it owns the keyboard. */
  modalOpen: boolean
  /** A non-modal sheet (film roll, tour) is open: the shutter key is held back. */
  sheetOpen: boolean
}

const LETTERS: Readonly<Record<string, ShortcutAction>> = {
  c: { type: 'camera' },
  f: { type: 'sources' },
  r: { type: 'roll' },
  b: { type: 'compare' },
}

export function shortcutFor(input: KeyInput, ctx: ShortcutContext): ShortcutAction | null {
  if (input.ctrlKey || input.metaKey || input.altKey) return null
  if (ctx.focus === 'typing' || ctx.modalOpen) return null
  const { key } = input
  if (key === ' ' || key === 'Spacebar') {
    if (input.repeat || ctx.sheetOpen || ctx.focus === 'control') return null
    return { type: 'shutter' }
  }
  // Holding [ or ] walks the shelf; everything else fires once per press.
  if (key === '[') return { type: 'prevBody' }
  if (key === ']') return { type: 'nextBody' }
  if (input.repeat) return null
  if (key === '?') return { type: 'help' }
  if (/^[1-9]$/.test(key)) return { type: 'body', index: Number(key) - 1 }
  return LETTERS[key.toLowerCase()] ?? null
}

export interface ShortcutHelp {
  keys: readonly string[]
  label: string
}

/** What the help dialog lists, in the order it lists it. */
export const SHORTCUT_HELP: readonly ShortcutHelp[] = [
  { keys: ['Space'], label: 'Shutter: develop, take or record' },
  { keys: ['C'], label: 'Live camera on or off' },
  { keys: ['F'], label: 'Film roll: scenes and imports' },
  { keys: ['R'], label: 'Camera roll' },
  { keys: ['B'], label: 'Before and after' },
  { keys: ['[', ']'], label: 'Previous or next camera' },
  { keys: ['1', '–', '9'], label: 'Jump to a camera on the shelf' },
  { keys: ['?'], label: 'This list' },
  { keys: ['Esc'], label: 'Close a sheet or dialog' },
]
