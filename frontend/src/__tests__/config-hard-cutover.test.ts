import { describe, expect, it } from 'vitest'
import {
  ACL_ONLY_HARD_CUTOVER_MARKER,
  SUBMISSION_MODE,
  UNSUPPORTED_LEGACY_SUBMISSION_MODE_ERROR,
  assertAclOnlySubmissionMode,
} from '../config'

describe('hard cutover submission mode policy', () => {
  it('accepts acl-only marker', () => {
    expect(SUBMISSION_MODE).toBe(ACL_ONLY_HARD_CUTOVER_MARKER)
    expect(() => assertAclOnlySubmissionMode(ACL_ONLY_HARD_CUTOVER_MARKER)).not.toThrow()
  })

  it('rejects legacy key marker with explicit error text', () => {
    expect(() => assertAclOnlySubmissionMode('legacy-key-v1')).toThrow(
      `${UNSUPPORTED_LEGACY_SUBMISSION_MODE_ERROR}; received legacy marker "legacy-key-v1"`
    )
  })
})
