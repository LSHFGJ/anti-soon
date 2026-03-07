import { describe, expect, it, vi } from 'vitest'
import { BOUNTY_HUB_ADDRESS } from '../config'
import { discoverDeploymentBlock, getLogsWithRangeFallback } from '../lib/chainLogs'

describe('getLogsWithRangeFallback', () => {
  it('chunks requests when provider limits eth_getLogs range', async () => {
    const firstError = new Error('eth_getLogs is limited to 0 - 10000 blocks range')

    const fetchLogs = vi
      .fn()
      .mockRejectedValueOnce(firstError)
      .mockResolvedValueOnce([{ id: 'chunk-1' }])
      .mockResolvedValueOnce([{ id: 'chunk-2' }])
      .mockResolvedValueOnce([{ id: 'chunk-3' }])

    const logs = await getLogsWithRangeFallback({
      fetchLogs,
      getLatestBlock: async () => 25_000n,
      getStartBlock: async () => 0n,
    })

    expect(logs).toHaveLength(3)
    expect(fetchLogs).toHaveBeenCalledTimes(4)
    expect(fetchLogs.mock.calls[1]?.[0]?.fromBlock).toBe(0n)
    expect(fetchLogs.mock.calls[1]?.[0]?.toBlock).toBe(9_999n)
    expect(fetchLogs.mock.calls[2]?.[0]?.fromBlock).toBe(10_000n)
    expect(fetchLogs.mock.calls[2]?.[0]?.toBlock).toBe(19_999n)
    expect(fetchLogs.mock.calls[3]?.[0]?.fromBlock).toBe(20_000n)
    expect(fetchLogs.mock.calls[3]?.[0]?.toBlock).toBe(25_000n)
  })

  it('chunks requests when provider returns exceed maximum block range errors', async () => {
    const firstError = new Error('RPC Request failed: exceed maximum block range: 50000')

    const fetchLogs = vi
      .fn()
      .mockRejectedValueOnce(firstError)
      .mockResolvedValueOnce([{ id: 'chunk-1' }])
      .mockResolvedValueOnce([{ id: 'chunk-2' }])

    const logs = await getLogsWithRangeFallback({
      fetchLogs,
      getLatestBlock: async () => 15_000n,
      getStartBlock: async () => 0n,
    })

    expect(logs).toHaveLength(2)
    expect(fetchLogs).toHaveBeenCalledTimes(3)
    expect(fetchLogs.mock.calls[1]?.[0]?.fromBlock).toBe(0n)
    expect(fetchLogs.mock.calls[1]?.[0]?.toBlock).toBe(9_999n)
    expect(fetchLogs.mock.calls[2]?.[0]?.fromBlock).toBe(10_000n)
    expect(fetchLogs.mock.calls[2]?.[0]?.toBlock).toBe(15_000n)
  })

  it('rethrows non-range provider errors', async () => {
    const fetchLogs = vi.fn().mockRejectedValue(new Error('unauthorized'))

    await expect(() =>
      getLogsWithRangeFallback({
        fetchLogs,
        getLatestBlock: async () => 1n,
        getStartBlock: async () => 0n,
      })
    ).rejects.toThrow('unauthorized')
  })

  it('falls back to recent lookback on non-archive pruned history providers', async () => {
    const latestBlock = 12_345_678n
    const getCode = vi.fn().mockRejectedValue(new Error('state at block is pruned'))

    const block = await discoverDeploymentBlock(
      {
        chain: { id: 11155111 },
        getCode,
        getBlockNumber: vi.fn().mockResolvedValue(latestBlock),
      } as never,
      BOUNTY_HUB_ADDRESS,
      latestBlock,
    )

    expect(block).toBe(latestBlock - 1_000_000n)
  })
})
