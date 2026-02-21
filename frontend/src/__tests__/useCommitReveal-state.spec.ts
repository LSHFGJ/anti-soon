import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockUseWallet = vi.fn()
const mockUseProjectPublicKey = vi.fn()

const mockAesGcmEncrypt = vi.fn()
const mockGenerateRandomSalt = vi.fn()
const mockHashCiphertext = vi.fn()
const mockComputeCommitHash = vi.fn()

vi.mock('../hooks/useWallet', () => ({
  useWallet: () => mockUseWallet()
}))

vi.mock('../hooks/useProjectPublicKey', () => ({
  useProjectPublicKey: () => mockUseProjectPublicKey()
}))

vi.mock('../utils/encryption', () => ({
  aesGcmEncrypt: (...args: unknown[]) => mockAesGcmEncrypt(...args),
  generateRandomSalt: () => mockGenerateRandomSalt(),
  hashCiphertext: (...args: unknown[]) => mockHashCiphertext(...args),
  computeCommitHash: (...args: unknown[]) => mockComputeCommitHash(...args)
}))

import { useCommitReveal, SUBMISSION_LIFECYCLE_PHASES } from '../hooks/useCommitReveal'
import { SUBMISSION_LIFECYCLE_PHASES as submissionLifecyclePhases } from '../hooks/usePoCSubmission'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('commit/reveal lifecycle state model', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockUseWallet.mockReturnValue({
      address: null,
      walletClient: undefined,
      publicClient: undefined,
      isConnected: false
    })

    mockUseProjectPublicKey.mockReturnValue({
      publicKey: '0x11',
      isLoading: false,
      error: null
    })

    mockGenerateRandomSalt.mockReturnValue('0x1234')
    mockHashCiphertext.mockReturnValue('0x5678')
    mockComputeCommitHash.mockReturnValue('0x9abc')
  })

  it('keeps lifecycle phases aligned across both hooks', () => {
    expect(SUBMISSION_LIFECYCLE_PHASES).toEqual([
      'idle',
      'encrypting',
      'committing',
      'committed',
      'revealing',
      'revealed',
      'failed'
    ])
    expect(submissionLifecyclePhases).toEqual(SUBMISSION_LIFECYCLE_PHASES)
  })

  it('sets failed with actionable message when commit starts without wallet', async () => {
    const { result } = renderHook(() => useCommitReveal(1n, '{"poc":"json"}'))

    await act(async () => {
      await result.current.commit()
    })

    expect(result.current.state.phase).toBe('failed')
    expect(result.current.state.error).toContain('Wallet not connected')
  })

  it('uses deterministic commit transition ordering and supports reset recovery', async () => {
    vi.useFakeTimers()

    const waitReceiptDeferred = deferred<{ logs: Array<{ data: `0x${string}`; topics: `0x${string}`[] }> }>()
    const encryptDeferred = deferred<{ ciphertext: Uint8Array; iv: Uint8Array }>()

    const publicClient = {
      simulateContract: vi.fn().mockResolvedValue({ request: { to: '0xabc' } }),
      waitForTransactionReceipt: vi.fn().mockReturnValue(waitReceiptDeferred.promise)
    }
    const walletClient = {
      writeContract: vi.fn().mockResolvedValue('0xcommit')
    }

    mockUseWallet.mockReturnValue({
      address: '0x1111111111111111111111111111111111111111',
      walletClient,
      publicClient,
      isConnected: true
    })
    mockAesGcmEncrypt.mockReturnValue(encryptDeferred.promise)

    const { result } = renderHook(() => useCommitReveal(1n, '{"poc":"json"}'))

    let commitPromise: Promise<void>
    await act(async () => {
      commitPromise = result.current.commit()
    })

    expect(result.current.state.phase).toBe('encrypting')

    await act(async () => {
      encryptDeferred.resolve({
        ciphertext: new Uint8Array([1, 2, 3]),
        iv: new Uint8Array([4, 5, 6])
      })
      await vi.advanceTimersByTimeAsync(800)
    })

    expect(result.current.state.phase).toBe('committing')

    await act(async () => {
      waitReceiptDeferred.resolve({ logs: [] })
      await commitPromise
    })

    expect(result.current.state.phase).toBe('committed')

    await act(async () => {
      result.current.reset()
    })

    expect(result.current.state.phase).toBe('idle')
    expect(result.current.state.error).toBeUndefined()

    vi.useRealTimers()
  })
})
