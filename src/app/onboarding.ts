/**
 * First-visit tour: three coach marks anchored to real controls (`data-coach` attributes).
 * Pure state so the step logic is testable; the component handles anchoring and focus.
 */

export const ONBOARDED_KEY = 'darkroom.onboarded'

export interface CoachStep {
  /** Matches `data-coach` on the control(s) the mark points at. */
  target: string
  title: string
  body: string
}

export const COACH_STEPS: readonly CoachStep[] = [
  {
    target: 'shelf',
    title: 'Pick a camera',
    body: 'Each body on the shelf is its own film, lens and frame. Choose one to load its look.',
  },
  {
    target: 'source',
    title: 'Choose what to shoot',
    body: 'Open the film roll for test scenes or your own photos and videos, or turn on your camera.',
  },
  {
    target: 'shutter',
    title: 'Press the shutter',
    body: 'Every shot develops right here and lands in your camera roll. Nothing leaves this device.',
  },
]

export interface CoachState {
  open: boolean
  step: number
}

export type CoachEvent = 'next' | 'back' | 'skip' | 'restart'

export const CLOSED: CoachState = { open: false, step: 0 }

/** Open on step one unless the tour was already seen. */
export function initialCoach(seenFlag: string | null): CoachState {
  return seenFlag === '1' ? CLOSED : { open: true, step: 0 }
}

export function coachReducer(state: CoachState, event: CoachEvent): CoachState {
  switch (event) {
    case 'restart':
      return { open: true, step: 0 }
    case 'skip':
      return CLOSED
    case 'back':
      return state.open ? { ...state, step: Math.max(0, state.step - 1) } : state
    case 'next':
      if (!state.open) return state
      return state.step >= COACH_STEPS.length - 1 ? CLOSED : { ...state, step: state.step + 1 }
  }
}
