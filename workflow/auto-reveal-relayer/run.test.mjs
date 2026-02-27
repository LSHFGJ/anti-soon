import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { buildSourceEventKey, computeScanStartBlock, filterIdempotentEvents, getLogsInChunks } from './run.mjs'

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

describe('ABI semantics', () => {
  it('keeps queue/submission ABI keyless', () => {
    const source = readFileSync(fileURLToPath(new URL('./run.mjs', import.meta.url)), 'utf8')

    expect(source).not.toContain('decryptionKey')
    expect(source).toContain(
      'function queuedReveals(uint256) view returns (address auditor, bytes32 salt, uint256 deadline, bool queued)'
    )
    expect(source).toContain(
      'function submissions(uint256) view returns (address auditor, uint256 projectId, bytes32 commitHash, string cipherURI, bytes32 salt, uint256 commitTimestamp, uint256 revealTimestamp, uint8 status, uint256 drainAmountWei, uint8 severity, uint256 payoutAmount, uint256 disputeDeadline, bool challenged, address challenger, uint256 challengeBond)'
    )
  })
})

describe('filterIdempotentEvents', () => {
  const chainId = 11155111
  const address = '0x00000000000000000000000000000000000000aa'

  function makeLog({ submissionId = 1n, blockNumber = 101n, txHash = '0xabc', logIndex = 0n } = {}) {
    return {
      blockNumber,
      transactionHash: txHash,
      logIndex,
      args: { submissionId },
    }
  }

  it('skips second copy when same source event appears twice in one scan', () => {
    const firstLog = makeLog()
    const duplicateLog = makeLog()
    const eventKey = buildSourceEventKey({ chainId, address, log: firstLog })

    const result = filterIdempotentEvents({
      logs: [firstLog, duplicateLog],
      chainId,
      address,
      processedEventLedger: {},
    })

    expect(result.pending.length).toBe(1)
    expect(result.pending[0].eventKey).toBe(eventKey)
    expect(result.skipped).toEqual([{ eventKey, reason: 'duplicate_in_batch' }])
  })

  it('skips overlap replay when source event is already in persisted ledger', () => {
    const replayedLog = makeLog({ submissionId: 42n, blockNumber: 250n, txHash: '0xdef', logIndex: 7n })
    const eventKey = buildSourceEventKey({ chainId, address, log: replayedLog })

    const firstPass = filterIdempotentEvents({
      logs: [replayedLog],
      chainId,
      address,
      processedEventLedger: {},
    })
    expect(firstPass.pending.length).toBe(1)

    const secondPass = filterIdempotentEvents({
      logs: [replayedLog],
      chainId,
      address,
      processedEventLedger: {
        [eventKey]: {
          anchoredAt: '2026-02-28T00:00:00.000Z',
          anchorTxHash: '0xfeed',
          submissionId: '42',
        },
      },
    })

    expect(secondPass.pending.length).toBe(0)
    expect(secondPass.skipped).toEqual([{ eventKey, reason: 'already_processed' }])
  })
})
