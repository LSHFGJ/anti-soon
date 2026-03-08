import type { Address } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { readAllLeaderboardAuditors } from '../lib/leaderboardReads'
import { readAllProjectIds } from '../lib/projectIndex'
import {
  readAllAuditorSubmissionIds,
  readAllProjectSubmissionIds,
} from '../lib/submissionIndex'

const {
  mockReadContractWithRpcFallback,
  mockReadWithRpcFallback,
} = vi.hoisted(() => ({
  mockReadContractWithRpcFallback: vi.fn(),
  mockReadWithRpcFallback: vi.fn(),
}))

vi.mock('../lib/publicClient', () => ({
  readContractWithRpcFallback: (...args: unknown[]) => mockReadContractWithRpcFallback(...args),
  readWithRpcFallback: (...args: unknown[]) => mockReadWithRpcFallback(...args),
}))

type SubmissionRecord = readonly [auditor: Address, projectId: bigint]

const AUDITOR_A = '0x1111111111111111111111111111111111111111' as Address
const AUDITOR_B = '0x2222222222222222222222222222222222222222' as Address

function getFunctionName(parameters: unknown): string | null {
  if (typeof parameters !== 'object' || parameters === null || !('functionName' in parameters)) {
    return null
  }

  const value = parameters.functionName
  return typeof value === 'string' ? value : null
}

function getArgs(parameters: unknown): readonly unknown[] {
  if (typeof parameters !== 'object' || parameters === null || !('args' in parameters)) {
    return []
  }

  const value = parameters.args
  return Array.isArray(value) ? value : []
}

describe('contract index fallbacks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockReadWithRpcFallback.mockImplementation(async (operation: (client: unknown) => Promise<unknown>) => {
      const client = {
        readContract: (parameters: unknown) => mockReadContractWithRpcFallback(parameters),
      }

      return operation(client)
    })
  })

  it('falls back to nextProjectId scans when getProjectIds is unavailable', async () => {
    mockReadContractWithRpcFallback.mockImplementation(async (parameters: unknown) => {
      const functionName = getFunctionName(parameters)

      if (functionName === 'getProjectIds') {
        throw new Error('index getter unavailable')
      }

      if (functionName === 'nextProjectId') {
        return 3n
      }

      throw new Error(`Unexpected readContract call: ${String(functionName)}`)
    })

    await expect(readAllProjectIds()).resolves.toEqual([2n, 1n, 0n])
  })

  it('falls back to submission scans when getAuditorSubmissionIds is unavailable', async () => {
    const submissions = new Map<string, SubmissionRecord>([
      ['0', [AUDITOR_A, 11n]],
      ['1', [AUDITOR_B, 12n]],
      ['2', [AUDITOR_A, 13n]],
    ])

    mockReadContractWithRpcFallback.mockImplementation(async (parameters: unknown) => {
      const functionName = getFunctionName(parameters)
      const args = getArgs(parameters)

      if (functionName === 'getAuditorSubmissionIds') {
        throw new Error('auditor index unavailable')
      }

      if (functionName === 'nextSubmissionId') {
        return 3n
      }

      if (functionName === 'submissions') {
        const submissionId = args[0]
        const entry = submissions.get(String(submissionId))
        if (!entry) {
          throw new Error(`Unexpected submission id ${String(submissionId)}`)
        }

        return [entry[0], entry[1]]
      }

      throw new Error(`Unexpected readContract call: ${String(functionName)}`)
    })

    await expect(readAllAuditorSubmissionIds(AUDITOR_A)).resolves.toEqual([2n, 0n])
  })

  it('falls back to submission scans when getProjectSubmissionIds is unavailable', async () => {
    const submissions = new Map<string, SubmissionRecord>([
      ['0', [AUDITOR_A, 11n]],
      ['1', [AUDITOR_B, 12n]],
      ['2', [AUDITOR_A, 11n]],
    ])

    mockReadContractWithRpcFallback.mockImplementation(async (parameters: unknown) => {
      const functionName = getFunctionName(parameters)
      const args = getArgs(parameters)

      if (functionName === 'getProjectSubmissionIds') {
        throw new Error('project index unavailable')
      }

      if (functionName === 'nextSubmissionId') {
        return 3n
      }

      if (functionName === 'submissions') {
        const submissionId = args[0]
        const entry = submissions.get(String(submissionId))
        if (!entry) {
          throw new Error(`Unexpected submission id ${String(submissionId)}`)
        }

        return [entry[0], entry[1]]
      }

      throw new Error(`Unexpected readContract call: ${String(functionName)}`)
    })

    await expect(readAllProjectSubmissionIds(11n)).resolves.toEqual([2n, 0n])
  })

  it('falls back to submission scans when getLeaderboardAuditors is unavailable', async () => {
    const submissions = new Map<string, SubmissionRecord>([
      ['0', [AUDITOR_A, 11n]],
      ['1', [AUDITOR_B, 12n]],
      ['2', [AUDITOR_A, 13n]],
    ])

    mockReadContractWithRpcFallback.mockImplementation(async (parameters: unknown) => {
      const functionName = getFunctionName(parameters)
      const args = getArgs(parameters)

      if (functionName === 'getLeaderboardAuditors') {
        throw new Error('leaderboard index unavailable')
      }

      if (functionName === 'nextSubmissionId') {
        return 3n
      }

      if (functionName === 'submissions') {
        const submissionId = args[0]
        const entry = submissions.get(String(submissionId))
        if (!entry) {
          throw new Error(`Unexpected submission id ${String(submissionId)}`)
        }

        return [entry[0], entry[1]]
      }

      throw new Error(`Unexpected readContract call: ${String(functionName)}`)
    })

    await expect(readAllLeaderboardAuditors()).resolves.toEqual([AUDITOR_A, AUDITOR_B])
  })

  it('does not replace transport failures with a project scan fallback', async () => {
    mockReadContractWithRpcFallback.mockRejectedValue(new Error('ALL_RPC_READS_FAILED: RPC[1] timed out after 4000ms'))

    await expect(readAllProjectIds()).rejects.toThrow('ALL_RPC_READS_FAILED')
    expect(mockReadContractWithRpcFallback).toHaveBeenCalledTimes(1)
  })

  it('does not replace transport failures with a submission scan fallback', async () => {
    mockReadContractWithRpcFallback.mockRejectedValue(new Error('ALL_RPC_READS_FAILED: RPC[1] timed out after 4000ms'))

    await expect(readAllAuditorSubmissionIds(AUDITOR_A)).rejects.toThrow('ALL_RPC_READS_FAILED')
    expect(mockReadContractWithRpcFallback).toHaveBeenCalledTimes(1)
  })

  it('still falls back when aggregated rpc failures include contract reverts', async () => {
    mockReadContractWithRpcFallback.mockImplementation(async (parameters: unknown) => {
      const functionName = getFunctionName(parameters)

      if (functionName === 'getProjectIds') {
        throw new Error('ALL_RPC_READS_FAILED: The contract function "getProjectIds" reverted. | RPC[5] timed out after 4000ms')
      }

      if (functionName === 'nextProjectId') {
        return 3n
      }

      throw new Error(`Unexpected readContract call: ${String(functionName)}`)
    })

    await expect(readAllProjectIds()).resolves.toEqual([2n, 1n, 0n])
  })
})
