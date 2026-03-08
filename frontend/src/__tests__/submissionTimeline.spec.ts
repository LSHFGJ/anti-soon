import { describe, expect, it } from 'vitest'
import { getSubmissionTimeline } from '../components/shared/submissionTimeline'

describe('submissionTimeline', () => {
  it('does NOT show Verified -> Finalized for invalid final outcomes (status 5)', () => {
    const steps = getSubmissionTimeline(5, 0n, 0n, false)
    expect(steps.some(s => s.label === 'Verified')).toBe(false)
    expect(steps.some(s => s.label === 'Finalized')).toBe(false)
    expect(steps[steps.length - 1].label).toBe('Invalid')
  })

  it('does NOT represent statuses 6 or 7 as settled/finalized success', () => {
    const steps6 = getSubmissionTimeline(6, 0n, 0n, false)
    expect(steps6.some(s => s.label === 'Finalized')).toBe(false)
    expect(steps6.some(s => s.label === 'Verified')).toBe(false)
    expect(steps6).toEqual([
      { label: 'Committed', completed: true, active: false, timestamp: 0n },
      { label: 'Revealed', completed: true, active: false, timestamp: 0n },
      { label: 'Pending Review', completed: false, active: true, timestamp: undefined },
      { label: 'Jury Phase', completed: false, active: false, timestamp: undefined },
    ])

    const steps7 = getSubmissionTimeline(7, 0n, 0n, false)
    expect(steps7.some(s => s.label === 'Finalized')).toBe(false)
    expect(steps7.some(s => s.label === 'Verified')).toBe(false)
    expect(steps7).toEqual([
      { label: 'Committed', completed: true, active: false, timestamp: 0n },
      { label: 'Revealed', completed: true, active: false, timestamp: 0n },
      { label: 'Pending Review', completed: false, active: true, timestamp: undefined },
      { label: 'Adjudication', completed: false, active: false, timestamp: undefined },
    ])
  })

  it('uses the real terminal labels for statuses 5, 6, and 7 even if lifecycleStatus is stale', () => {
    expect(getSubmissionTimeline(5, 0n, 0n, false, 4).map(step => step.label)).toEqual([
      'Committed',
      'Revealed',
      'Invalid',
    ])

    expect(getSubmissionTimeline(6, 0n, 0n, false, 4).map(step => step.label)).toEqual([
      'Committed',
      'Revealed',
      'Pending Review',
      'Jury Phase',
    ])

    expect(getSubmissionTimeline(7, 0n, 0n, false, 2).map(step => step.label)).toEqual([
      'Committed',
      'Revealed',
      'Pending Review',
      'Adjudication',
    ])
  })
})
