import type { Address, PublicClient } from 'viem'
import { getBlockNumberWithRpcFallback, getCodeWithRpcFallback } from './publicClient'

const MAX_ETH_GET_LOGS_RANGE = 10_000n
const NON_ARCHIVE_LOOKBACK_BLOCKS = 1_000_000n
const deploymentBlockCache = new Map<string, bigint>()

function isRangeLimitError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const message = error.message.toLowerCase()
  return (
    message.includes('eth_getlogs is limited to') ||
    message.includes('limited to a 10,000 range') ||
    message.includes('10000 blocks range') ||
    message.includes('exceed maximum block range')
  )
}

function isPrunedHistoryError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const message = error.message.toLowerCase()
  return message.includes('pruned') || message.includes('missing trie node')
}

export async function discoverDeploymentBlock(
  client: PublicClient,
  address: Address,
  latestBlock?: bigint,
): Promise<bigint> {
  const chainId = client.chain?.id ?? 0
  const cacheKey = `${chainId}:${address.toLowerCase()}`
  const cached = deploymentBlockCache.get(cacheKey)
  if (cached !== undefined) return cached

  const latest = latestBlock ?? await client.getBlockNumber()

  let low = 0n
  let high = latest

  while (low < high) {
    const mid = (low + high) / 2n
    let code: `0x${string}` | undefined

    try {
      code = await client.getCode({ address, blockNumber: mid })
    } catch (error) {
      if (!isPrunedHistoryError(error)) {
        throw error
      }

      const fallback = latest > NON_ARCHIVE_LOOKBACK_BLOCKS
        ? latest - NON_ARCHIVE_LOOKBACK_BLOCKS
        : 0n
      deploymentBlockCache.set(cacheKey, fallback)
      return fallback
    }

    const hasCode = code !== undefined && code !== '0x'
    if (hasCode) {
      high = mid
    } else {
      low = mid + 1n
    }
  }

  deploymentBlockCache.set(cacheKey, low)
  return low
}

export async function discoverDeploymentBlockWithFallback(
  address: Address,
  latestBlock?: bigint,
): Promise<bigint> {
  const cacheKey = `${0}:${address.toLowerCase()}`
  const cached = deploymentBlockCache.get(cacheKey)
  if (cached !== undefined) return cached

  const latest = latestBlock ?? await getBlockNumberWithRpcFallback()

  let low = 0n
  let high = latest

  while (low < high) {
    const mid = (low + high) / 2n
    let code: `0x${string}` | undefined

    try {
      code = await getCodeWithRpcFallback({ address, blockNumber: mid })
    } catch (error) {
      if (!isPrunedHistoryError(error)) {
        throw error
      }

      const fallback = latest > NON_ARCHIVE_LOOKBACK_BLOCKS
        ? latest - NON_ARCHIVE_LOOKBACK_BLOCKS
        : 0n
      deploymentBlockCache.set(cacheKey, fallback)
      return fallback
    }

    const hasCode = code !== undefined && code !== '0x'
    if (hasCode) {
      high = mid
    } else {
      low = mid + 1n
    }
  }

  deploymentBlockCache.set(cacheKey, low)
  return low
}

export async function getLogsWithRangeFallback<TLog>(params: {
  fetchLogs: (range?: { fromBlock: bigint; toBlock: bigint | 'latest' }) => Promise<TLog[]>
  getLatestBlock: () => Promise<bigint>
  getStartBlock: (latestBlock: bigint) => Promise<bigint>
}): Promise<TLog[]> {
  const { fetchLogs, getLatestBlock, getStartBlock } = params

  try {
    return await fetchLogs()
  } catch (error) {
    if (!isRangeLimitError(error)) {
      throw error
    }
  }

  const latestBlock = await getLatestBlock()
  const startBlock = await getStartBlock(latestBlock)

  if (startBlock > latestBlock) return []

  const collected: TLog[] = []

  for (let from = startBlock; from <= latestBlock; from += MAX_ETH_GET_LOGS_RANGE) {
    const to = from + MAX_ETH_GET_LOGS_RANGE - 1n > latestBlock
      ? latestBlock
      : from + MAX_ETH_GET_LOGS_RANGE - 1n

    const chunk = await fetchLogs({ fromBlock: from, toBlock: to })
    collected.push(...chunk)
  }

  return collected
}
