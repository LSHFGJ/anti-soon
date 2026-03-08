import { parseEther } from 'viem'

export const CREATE_PROJECT_THRESHOLD_BANDS = ['high', 'medium'] as const

export type CreateProjectThresholdInputs = {
  highThreshold: string
  mediumThreshold: string
}

// Preserve the current four-field payload shape while the create flow only asks for H/M.
export function buildCreateProjectThresholdPayload({
  highThreshold,
  mediumThreshold,
}: CreateProjectThresholdInputs) {
  const highDrainWei = parseEther(highThreshold)
  const mediumDrainWei = parseEther(mediumThreshold)

  return {
    criticalDrainWei: highDrainWei,
    highDrainWei,
    mediumDrainWei,
    lowDrainWei: mediumDrainWei,
  }
}
