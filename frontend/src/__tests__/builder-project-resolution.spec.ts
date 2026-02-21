import { describe, expect, it } from 'vitest'
import { resolveSubmissionProjectId } from '../pages/Builder'

describe('resolveSubmissionProjectId', () => {
  it('prefers location-state project id over path and query values', () => {
    const result = resolveSubmissionProjectId('7', '8', '9', '10')
    expect(result).toBe(7n)
  })

  it('uses path project id when state is absent', () => {
    const result = resolveSubmissionProjectId(undefined, '8', '9', '10')
    expect(result).toBe(8n)
  })

  it('uses query projectId and project keys as fallbacks', () => {
    expect(resolveSubmissionProjectId(undefined, undefined, '9', undefined)).toBe(9n)
    expect(resolveSubmissionProjectId(undefined, undefined, undefined, '10')).toBe(10n)
  })

  it('returns null when all sources are missing or invalid', () => {
    expect(resolveSubmissionProjectId(undefined, undefined, undefined, undefined)).toBeNull()
    expect(resolveSubmissionProjectId('invalid', undefined, undefined, undefined)).toBeNull()
    expect(resolveSubmissionProjectId('-1', undefined, undefined, undefined)).toBeNull()
  })
})
