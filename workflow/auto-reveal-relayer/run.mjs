import { createPublicClient, createWalletClient, http, parseAbi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const bountyHubAbi = parseAbi([
  'function queuedReveals(uint256) view returns (address auditor, bytes32 decryptionKey, bytes32 salt, uint256 deadline, bool queued)',
  'function submissions(uint256) view returns (address auditor, uint256 projectId, bytes32 commitHash, string cipherURI, bytes32 decryptionKey, bytes32 salt, uint256 commitTimestamp, uint256 revealTimestamp, uint8 status, uint256 drainAmountWei, uint8 severity, uint256 payoutAmount, uint256 disputeDeadline, bool challenged, address challenger, uint256 challengeBond)',
  'function projects(uint256) view returns (address owner, uint256 bountyPool, uint256 maxPayoutPerBug, address targetContract, uint256 forkBlock, bool active, uint8 mode, uint256 commitDeadline, uint256 revealDeadline, uint256 disputeWindow, bytes32 rulesHash, bytes projectPublicKey, uint8 vnetStatus, string vnetRpcUrl, bytes32 baseSnapshotId, uint256 vnetCreatedAt, string repoUrl)',
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

  const submissionIds = new Set()
  for (const log of logs) {
    const submissionId = log.args.submissionId
    if (typeof submissionId === 'bigint') {
      submissionIds.add(submissionId)
    }
  }

  console.log(`Found ${submissionIds.size} queued submissions in range ${fromBlock}-${currentBlock}`)

  for (const submissionId of submissionIds) {
    try {
      const queued = await publicClient.readContract({
        address: bountyHub,
        abi: bountyHubAbi,
        functionName: 'queuedReveals',
        args: [submissionId],
      })

      if (!queued[4]) {
        continue
      }

      const submission = await publicClient.readContract({
        address: bountyHub,
        abi: bountyHubAbi,
        functionName: 'submissions',
        args: [submissionId],
      })

      const projectId = submission[1]
      const submissionStatus = submission[8]
      if (submissionStatus !== 0) {
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
      const queuedDeadline = queued[3]

      if (mode !== 1n) {
        continue
      }

      if (commitDeadline === 0n || now <= commitDeadline) {
        continue
      }

      if (revealDeadline !== 0n && now > revealDeadline) {
        continue
      }

      if (now > queuedDeadline) {
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
