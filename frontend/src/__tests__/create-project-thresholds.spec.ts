import { describe, expect, it } from 'vitest'

import {
  buildCreateProjectThresholdPayload,
  CREATE_PROJECT_THRESHOLD_BANDS,
} from '../lib/createProjectThresholds'

describe('create project threshold payload', () => {
  it('collapses the create-project flow to high and medium bands while preserving the legacy payload shape', () => {
    const payload = buildCreateProjectThresholdPayload({
      highThreshold: '5',
      mediumThreshold: '2',
    })

    expect(CREATE_PROJECT_THRESHOLD_BANDS).toEqual(['high', 'medium'])
    expect(payload).toEqual({
      criticalDrainWei: 5_000_000_000_000_000_000n,
      highDrainWei: 5_000_000_000_000_000_000n,
      mediumDrainWei: 2_000_000_000_000_000_000n,
      lowDrainWei: 2_000_000_000_000_000_000n,
    })
  })
})
