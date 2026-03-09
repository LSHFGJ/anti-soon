import { beforeEach, describe, expect, it, vi } from 'vitest'

type MockPublicClient = {
  readContract: ReturnType<typeof vi.fn>
  multicall: ReturnType<typeof vi.fn>
  getLogs: ReturnType<typeof vi.fn>
  getBlockNumber: ReturnType<typeof vi.fn>
  getBalance: ReturnType<typeof vi.fn>
  getCode: ReturnType<typeof vi.fn>
}

function createMockClient(): MockPublicClient {
  return {
    readContract: vi.fn(),
    multicall: vi.fn(),
    getLogs: vi.fn(),
    getBlockNumber: vi.fn(),
    getBalance: vi.fn(),
    getCode: vi.fn(),
  }
}

describe('publicClient read caching', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-09T08:10:00Z'))
  })

  it('dedupes identical in-flight contract reads and reuses a fresh cached result', async () => {
    const primaryClient = createMockClient()
    const secondaryClient = createMockClient()
    primaryClient.readContract.mockResolvedValue(3n)
    secondaryClient.readContract.mockResolvedValue(3n)

    const createPublicClient = vi
      .fn()
      .mockReturnValueOnce(primaryClient)
      .mockReturnValueOnce(secondaryClient)

    vi.doMock('viem', () => ({
      createPublicClient,
      http: vi.fn(() => ({})),
    }))

    vi.doMock('../config', () => ({
      CHAIN: { id: 11155111 },
    }))

    vi.doMock('../lib/rpcConfig', () => ({
      resolveRpcUrl: () => 'https://rpc.primary',
      resolveRpcUrls: () => ['https://rpc.primary', 'https://rpc.secondary'],
    }))

    const { readContractWithRpcFallback } = await import('../lib/publicClient')

    const params = {
      address: '0x0000000000000000000000000000000000000001',
      abi: [],
      functionName: 'nextProjectId',
    } as const

    const [firstResult, secondResult] = await Promise.all([
      readContractWithRpcFallback(params),
      readContractWithRpcFallback(params),
    ])

    expect(firstResult).toBe(3n)
    expect(secondResult).toBe(3n)
    expect(primaryClient.readContract).toHaveBeenCalledTimes(1)
    expect(secondaryClient.readContract).toHaveBeenCalledTimes(1)

    const cachedResult = await readContractWithRpcFallback(params)

    expect(cachedResult).toBe(3n)
    expect(primaryClient.readContract).toHaveBeenCalledTimes(1)
    expect(secondaryClient.readContract).toHaveBeenCalledTimes(1)
  })

  it('expires cached read results after the ttl window', async () => {
    const primaryClient = createMockClient()
    const secondaryClient = createMockClient()
    primaryClient.readContract.mockResolvedValue(7n)
    secondaryClient.readContract.mockResolvedValue(7n)

    const createPublicClient = vi
      .fn()
      .mockReturnValueOnce(primaryClient)
      .mockReturnValueOnce(secondaryClient)

    vi.doMock('viem', () => ({
      createPublicClient,
      http: vi.fn(() => ({})),
    }))

    vi.doMock('../config', () => ({
      CHAIN: { id: 11155111 },
    }))

    vi.doMock('../lib/rpcConfig', () => ({
      resolveRpcUrl: () => 'https://rpc.primary',
      resolveRpcUrls: () => ['https://rpc.primary', 'https://rpc.secondary'],
    }))

    const { readContractWithRpcFallback } = await import('../lib/publicClient')

    const params = {
      address: '0x0000000000000000000000000000000000000001',
      abi: [],
      functionName: 'nextProjectId',
    } as const

    await readContractWithRpcFallback(params)
    vi.advanceTimersByTime(10_001)
    await readContractWithRpcFallback(params)

    expect(primaryClient.readContract).toHaveBeenCalledTimes(2)
    expect(secondaryClient.readContract).toHaveBeenCalledTimes(2)
  })
})
