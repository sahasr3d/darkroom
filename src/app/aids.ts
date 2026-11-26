/** Shooting aids and drawer tabs: plain data shared by the UI, persistence and tests. */

export type GridKind = 'off' | 'thirds' | 'cross' | 'golden'
export type TimerSeconds = 0 | 3 | 10

export interface Aids {
  grid: GridKind
  timer: TimerSeconds
  level: boolean
  dualSave: boolean
  /** Video bodies: record sound (microphone or the imported video's track) through the body's sound chain. */
  sound: boolean
}

export const DEFAULT_AIDS: Aids = { grid: 'off', timer: 0, level: false, dualSave: false, sound: true }

export const GRID_KINDS: readonly GridKind[] = ['off', 'thirds', 'cross', 'golden']
export const TIMER_SECONDS: readonly TimerSeconds[] = [0, 3, 10]

export type DrawerTab = 'body' | 'lens' | 'manual' | 'aids'
export const DRAWER_TABS: readonly DrawerTab[] = ['body', 'lens', 'manual', 'aids']
