import { createPublicClient, createWalletClient, http, parseAbi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const bountyHubAbi = parseAbi([
  'function queuedReveals(uint256) view returns (address auditor, bytes32 salt, uint256 deadline, bool queued)',
  'function submissions(uint256) view returns (address auditor, uint256 projectId, bytes32 commitHash, string cipherURI, bytes32 salt, uint256 commitTimestamp, uint256 revealTimestamp, uint8 status, uint256 drainAmountWei, uint8 severity, uint256 payoutAmount, uint256 disputeDeadline, bool challenged, address challenger, uint256 challengeBond)',
  'function projects(uint256) view returns (address owner, uint256 bountyPool, uint256 maxPayoutPerBug, address targetContract, uint256 forkBlock, bool active, uint8 mode, uint256 commitDeadline, uint256 revealDeadline, uint256 disputeWindow, bytes32 rulesHash, uint8 vnetStatus, string vnetRpcUrl, bytes32 baseSnapshotId, uint256 vnetCreatedAt, string repoUrl)',
  'function executeQueuedReveal(uint256 _submissionId)',
  'event RevealQueued(uint256 indexed submissionId, address indexed auditor, uint256 deadline)',
])

function envOrThrow(name) {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

function envNumber(name, fallback) {
  const raw = process.env[name]?.trim()
  if (!raw) return fallback
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid number in ${name}: ${raw}`)
  }
  return parsed
}

function safeBigInt(value) {
  if (typeof value === 'bigint') return value
  if (typeof value === 'string' && value.length > 0) return BigInt(value)
  return null
}

export function computeScanStartBlock({
  currentBlock,
  lookbackBlocks,
  replayOverlapBlocks,
  persistedCursor,
}) {
  const bootstrapFrom = currentBlock > lookbackBlocks ? currentBlock - lookbackBlocks : 0n

  if (persistedCursor === null) {
    return bootstrapFrom
  }

  return persistedCursor > replayOverlapBlocks ? persistedCursor - replayOverlapBlocks : 0n
}

export async function readCursor(cursorFilePath) {
  try {
    const raw = await readFile(cursorFilePath, 'utf8')
    const parsed = JSON.parse(raw)
    const persistedCursor = safeBigInt(parsed?.nextFromBlock)
    return persistedCursor
  } catch {
    return null
  }
}

export async function writeCursor(cursorFilePath, nextFromBlock) {
  const payload = {
    nextFromBlock: nextFromBlock.toString(),
    updatedAt: new Date().toISOString(),
  }
  await writeFile(cursorFilePath, JSON.stringify(payload, null, 2))
}

export async function readProcessedEventLedger(ledgerFilePath) {
  try {
    const raw = await readFile(ledgerFilePath, 'utf8')
    const parsed = JSON.parse(raw)
    const ledger = parsed?.events
    if (!ledger || typeof ledger !== 'object') {
      return {}
    }
    return ledger
  } catch {
    return {}
  }
}

export async function writeProcessedEventLedger(ledgerFilePath, events) {
  const payload = {
    events,
    updatedAt: new Date().toISOString(),
  }
  await writeFile(ledgerFilePath, JSON.stringify(payload, null, 2))
}

export function buildSourceEventKey({ chainId, address, log }) {
  const blockNumber = safeBigInt(log?.blockNumber)
  const logIndex = safeBigInt(log?.logIndex)
  const txHash = typeof log?.transactionHash === 'string' ? log.transactionHash.toLowerCase() : null

  if (blockNumber === null || logIndex === null || txHash === null) {
    return null
  }

  return `${chainId}:${address.toLowerCase()}:${blockNumber}:${txHash}:${logIndex}`
}

export function filterIdempotentEvents({ logs, chainId, address, processedEventLedger }) {
  const pending = []
  const skipped = []
  const seenInBatch = new Set()

  for (const log of logs) {
    const eventKey = buildSourceEventKey({ chainId, address, log })
    if (!eventKey) {
      skipped.push({ eventKey: 'unknown', reason: 'missing_event_identity' })
      continue
    }

    if (seenInBatch.has(eventKey)) {
      skipped.push({ eventKey, reason: 'duplicate_in_batch' })
      continue
    }
    seenInBatch.add(eventKey)

    if (processedEventLedger[eventKey]) {
      skipped.push({ eventKey, reason: 'already_processed' })
      continue
    }

    pending.push({ eventKey, log })
  }

  return { pending, skipped }
}

export async function getLogsInChunks({
  publicClient,
  address,
  event,
  fromBlock,
  toBlock,
  chunkSizeBlocks,
}) {
  if (chunkSizeBlocks <= 0n) {
    throw new Error('chunkSizeBlocks must be greater than 0')
  }

  if (toBlock < fromBlock) {
    return []
  }

  const logs = []
  let start = fromBlock

  while (start <= toBlock) {
    const endCandidate = start + chunkSizeBlocks - 1n
    const end = endCandidate < toBlock ? endCandidate : toBlock

    const chunkLogs = await publicClient.getLogs({
      address,
      event,
      fromBlock: start,
      toBlock: end,
    })

    logs.push(...chunkLogs)
    start = end + 1n
  }

  return logs
}

async function main() {
  const rpcUrl = envOrThrow('AUTO_REVEAL_RPC_URL')
  const privateKey = envOrThrow('AUTO_REVEAL_PRIVATE_KEY')
  const bountyHub = envOrThrow('AUTO_REVEAL_BOUNTY_HUB_ADDRESS')
  const chainId = envNumber('AUTO_REVEAL_CHAIN_ID', 11155111)
  const lookbackBlocks = BigInt(envNumber('AUTO_REVEAL_LOOKBACK_BLOCKS', 5000))
  const replayOverlapBlocks = BigInt(envNumber('AUTO_REVEAL_REPLAY_OVERLAP_BLOCKS', 12))
  const logChunkBlocks = BigInt(envNumber('AUTO_REVEAL_LOG_CHUNK_BLOCKS', 5000))
  const cursorFilePath = process.env.AUTO_REVEAL_CURSOR_FILE?.trim() || fileURLToPath(new URL('./.auto-reveal-cursor.json', import.meta.url))
  const eventLedgerFilePath = process.env.AUTO_REVEAL_EVENT_LEDGER_FILE?.trim() || fileURLToPath(new URL('./.auto-reveal-events.json', import.meta.url))

  const chain = {
    id: chainId,
    name: `chain-${chainId}`,
    nativeCurrency: { name: 'Native', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  }

  const account = privateKeyToAccount(privateKey)
  const transport = http(rpcUrl)
  const publicClient = createPublicClient({ chain, transport })
  const walletClient = createWalletClient({ account, chain, transport })

  const currentBlock = await publicClient.getBlockNumber()
  const persistedCursor = await readCursor(cursorFilePath)
  const fromBlock = computeScanStartBlock({
    currentBlock,
    lookbackBlocks,
    replayOverlapBlocks,
    persistedCursor,
  })
  const now = BigInt(Math.floor(Date.now() / 1000))

  const logs = await getLogsInChunks({
    publicClient,
    address: bountyHub,
    event: bountyHubAbi[4],
    fromBlock,
    toBlock: currentBlock,
    chunkSizeBlocks: logChunkBlocks,
  })

  const processedEventLedger = await readProcessedEventLedger(eventLedgerFilePath)
  const { pending: eventsToProcess, skipped: skippedEvents } = filterIdempotentEvents({
    logs,
    chainId,
    address: bountyHub,
    processedEventLedger,
  })

  console.log(`Found ${logs.length} reveal-queue logs in range ${fromBlock}-${currentBlock}`)
  for (const { eventKey, reason } of skippedEvents) {
    console.log(`Skipping source event ${eventKey}: ${reason}`)
  }
  console.log(`Processing ${eventsToProcess.length} source events after idempotency filter`)

  for (const { eventKey, log } of eventsToProcess) {
    const submissionId = log?.args?.submissionId
    if (typeof submissionId !== 'bigint') {
      console.log(`Skipping source event ${eventKey}: missing_submission_id`)
      continue
    }

    try {
      const queued = await publicClient.readContract({
        address: bountyHub,
        abi: bountyHubAbi,
        functionName: 'queuedReveals',
        args: [submissionId],
      })

      if (!queued[3]) {
        console.log(`Skipping source event ${eventKey}: queue_not_active`)
        continue
      }

      const submission = await publicClient.readContract({
        address: bountyHub,
        abi: bountyHubAbi,
        functionName: 'submissions',
        args: [submissionId],
      })

      const projectId = submission[1]
      const submissionStatus = submission[7]
      if (submissionStatus !== 0) {
        console.log(`Skipping source event ${eventKey}: submission_status_${submissionStatus}`)
        continue
      }

      const project = await publicClient.readContract({
        address: bountyHub,
        abi: bountyHubAbi,
        functionName: 'projects',
        args: [projectId],
      })

      const mode = BigInt(project[6])
      const commitDeadline = project[7]
      const revealDeadline = project[8]
      const queuedDeadline = queued[2]

      if (mode !== 1n) {
        console.log(`Skipping source event ${eventKey}: project_not_multi_mode`)
        continue
      }

      if (commitDeadline === 0n || now <= commitDeadline) {
        console.log(`Skipping source event ${eventKey}: commit_deadline_not_reached`)
        continue
      }

      if (revealDeadline !== 0n && now > revealDeadline) {
        console.log(`Skipping source event ${eventKey}: reveal_window_closed`)
        continue
      }

      if (now > queuedDeadline) {
        console.log(`Skipping source event ${eventKey}: queued_deadline_expired`)
        continue
      }

      const { request } = await publicClient.simulateContract({
        account,
        address: bountyHub,
        abi: bountyHubAbi,
        functionName: 'executeQueuedReveal',
        args: [submissionId],
      })

      const txHash = await walletClient.writeContract(request)
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash })
      console.log(`Executed queued reveal for submission ${submissionId} tx=${txHash} status=${receipt.status}`)

      processedEventLedger[eventKey] = {
        sourceBlockNumber: safeBigInt(log?.blockNumber)?.toString() ?? null,
        submissionId: submissionId.toString(),
        anchorTxHash: txHash,
        anchoredAt: new Date().toISOString(),
      }
      await writeProcessedEventLedger(eventLedgerFilePath, processedEventLedger)
      console.log(`Marked source event ${eventKey} as processed in ${eventLedgerFilePath}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`Failed processing submission ${submissionId}: ${message}`)
    }
  }

  await writeCursor(cursorFilePath, currentBlock + 1n)
  console.log(`Updated cursor file ${cursorFilePath} => nextFromBlock=${currentBlock + 1n}`)
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url)

if (isMainModule) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error)
    console.error(message)
    process.exitCode = 1
  })
}
