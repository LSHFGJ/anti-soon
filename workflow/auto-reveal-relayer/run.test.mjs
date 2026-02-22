import { describe, expect, it } from 'bun:test'
import { computeScanStartBlock, getLogsInChunks } from './run.mjs'

describe('computeScanStartBlock', () => {
  it('uses lookback bootstrap when cursor is missing', () => {
    const start = computeScanStartBlock({
      currentBlock: 10_000n,
      lookbackBlocks: 5000n,
      replayOverlapBlocks: 12n,
      persistedCursor: null,
    })

    expect(start).toBe(5000n)
  })

  it('replays overlap when cursor exists', () => {
    const start = computeScanStartBlock({
      currentBlock: 10_000n,
      lookbackBlocks: 5000n,
      replayOverlapBlocks: 12n,
      persistedCursor: 9001n,
    })

    expect(start).toBe(8989n)
  })

  it('never returns negative block number', () => {
    const start = computeScanStartBlock({
      currentBlock: 100n,
      lookbackBlocks: 5000n,
      replayOverlapBlocks: 12n,
      persistedCursor: 5n,
    })

    expect(start).toBe(0n)
  })
})

describe('getLogsInChunks', () => {
  it('splits scans into bounded ranges', async () => {
    const ranges = []
    const mockClient = {
      getLogs: async ({ fromBlock, toBlock }) => {
        ranges.push([fromBlock, toBlock])
        return [{ fromBlock, toBlock }]
      },
    }

    const logs = await getLogsInChunks({
      publicClient: mockClient,
      address: '0x0000000000000000000000000000000000000001',
      event: {},
      fromBlock: 100n,
      toBlock: 109n,
      chunkSizeBlocks: 4n,
    })

    expect(ranges).toEqual([
      [100n, 103n],
      [104n, 107n],
      [108n, 109n],
    ])
    expect(logs.length).toBe(3)
  })
})
