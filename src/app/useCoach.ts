import { useCallback, useEffect, useReducer, useState } from 'react'
import { CLOSED, coachReducer, initialCoach, ONBOARDED_KEY, type CoachEvent, type CoachState } from './onboarding'
import { readStored, writeStored } from './storage'

/** Let the studio paint (fonts, first develop) before pointing at it. */
const SHOW_DELAY_MS = 700

/**
 * First-visit tour state. Waits until the studio is `ready`, shows once, and remembers that it
 * was seen as soon as it closes (finished or skipped). `restart` replays it from the Aids tab.
 */
export function useCoach(ready: boolean): { state: CoachState; dispatch: (event: CoachEvent) => void } {
  const [wanted] = useState(() => initialCoach(readStored(ONBOARDED_KEY)))
  const [state, send] = useReducer(coachReducer, CLOSED)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    if (!ready || shown || !wanted.open) return
    const id = window.setTimeout(() => {
      setShown(true)
      send('restart')
    }, SHOW_DELAY_MS)
    return () => window.clearTimeout(id)
  }, [ready, shown, wanted.open])

  const dispatch = useCallback((event: CoachEvent) => {
    if (event === 'restart') setShown(true)
    send(event)
  }, [])

  useEffect(() => {
    if (shown && !state.open) writeStored(ONBOARDED_KEY, '1')
  }, [shown, state.open])

  return { state, dispatch }
}
