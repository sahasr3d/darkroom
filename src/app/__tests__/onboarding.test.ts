import { describe, expect, test } from 'vitest'
import { CLOSED, COACH_STEPS, coachReducer, initialCoach } from '../onboarding'

describe('onboarding steps', () => {
  test('shows once: open on a first visit, closed after', () => {
    expect(initialCoach(null)).toEqual({ open: true, step: 0 })
    expect(initialCoach('1')).toEqual(CLOSED)
    expect(initialCoach('garbage')).toEqual({ open: true, step: 0 })
  })

  test('has the three steps in order', () => {
    expect(COACH_STEPS.map((s) => s.target)).toEqual(['shelf', 'source', 'shutter'])
  })

  test('next walks forward and closes after the last step', () => {
    let s = initialCoach(null)
    s = coachReducer(s, 'next')
    expect(s).toEqual({ open: true, step: 1 })
    s = coachReducer(s, 'next')
    expect(s).toEqual({ open: true, step: 2 })
    expect(coachReducer(s, 'next')).toEqual(CLOSED)
  })

  test('back stops at the first step', () => {
    expect(coachReducer({ open: true, step: 0 }, 'back')).toEqual({ open: true, step: 0 })
    expect(coachReducer({ open: true, step: 2 }, 'back')).toEqual({ open: true, step: 1 })
  })

  test('skip closes from anywhere; restart reopens at step one', () => {
    expect(coachReducer({ open: true, step: 1 }, 'skip')).toEqual(CLOSED)
    expect(coachReducer(CLOSED, 'restart')).toEqual({ open: true, step: 0 })
  })

  test('a closed tour ignores next and back', () => {
    expect(coachReducer(CLOSED, 'next')).toBe(CLOSED)
    expect(coachReducer(CLOSED, 'back')).toBe(CLOSED)
  })
})
