import { runMultiDeadlineScanner, type MultiDeadlineRuntime } from "./multi-deadline"
import { runUniqueCommittedCandidateScanner, type UniqueCandidateRuntime } from "./unique-orchestration"
import type { AutoRevealCursorStore } from "./cursor-state"
import type {
  AutoRevealFailureMetricEvent,
  AutoRevealRetryPolicy,
} from "./retry-policy"

const EVM_ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/
const PRIVATE_KEY_REGEX = /^0x[0-9a-fA-F]{64}$/

const DEFAULT_CHAIN_ID = 11155111
const DEFAULT_LOOKBACK_BLOCKS = 5000
const DEFAULT_REPLAY_OVERLAP_BLOCKS = 12
const DEFAULT_LOG_CHUNK_BLOCKS = 5000
const DEFAULT_MAX_EXECUTION_BATCH_SIZE = 25
const DEFAULT_CURSOR_FILE =
  "workflow/auto-reveal-relayer/.auto-reveal-cursor.json"

export type EnvRecord = Record<string, string | undefined>

export type RunOnceCliArgs = {
  help: boolean
  cursorFile?: string
  lookbackBlocks?: string
  replayOverlapBlocks?: string
  logChunkBlocks?: string
  maxExecutionBatchSize?: string
}

export type RunOnceConfig = {
  publicRpcUrl: string
  adminRpcUrl: string
  privateKey: string
  bountyHubAddress: `0x${string}`
  chainId: number
  lookbackBlocks: number
  replayOverlapBlocks: number
  logChunkBlocks: number
  maxExecutionBatchSize: number
  cursorFile: string
}

export type RunOncePlan = {
  mode: "run-once"
  chainId: number
  publicRpcUrl: string
  adminRpcUrl: string
  bountyHubAddress: `0x${string}`
  cursorFile: string
  cursorLastFinalizedBlock: bigint
  recoveredProcessingCount: number
  quarantinedItemCount: number
  replayOverlapBlocks: number
  logChunkBlocks: number
  maxExecutionBatchSize: number
  fromBlock: bigint
  toBlock: bigint
}

export type RunOnceExecutionDeps = {
  store: AutoRevealCursorStore
  uniqueRuntime: UniqueCandidateRuntime
  multiRuntime: MultiDeadlineRuntime
  nowMs?: number
  retryPolicy?: AutoRevealRetryPolicy
  sleep?: (ms: number) => Promise<void> | void
  recordMetric?: (event: AutoRevealFailureMetricEvent) => void
}

export type RunOnceExecutionResult = {
  plan: RunOncePlan
  unique: Awaited<ReturnType<typeof runUniqueCommittedCandidateScanner>>
  multi: Awaited<ReturnType<typeof runMultiDeadlineScanner>>
}

function requiredEnv(env: EnvRecord, key: string): string {
  const value = env[key]
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${key}`)
  }
  return value
}

function parseUrl(rawValue: string, label: string): string {
  const normalized = rawValue.trim()
  if (!/^https?:\/\/\S+$/i.test(normalized)) {
    throw new Error(`${label} must be a valid URL`)
  }

  return normalized
}

function parsePositiveInt(value: string, label: string): number {
  const normalized = value.trim()
  if (!/^[0-9]+$/.test(normalized)) {
    throw new Error(`${label} must be a positive integer`)
  }

  const numeric = Number.parseInt(normalized, 10)
  if (!Number.isSafeInteger(numeric) || numeric <= 0) {
    throw new Error(`${label} must be a positive integer`)
  }

  return numeric
}

function parseAddress(value: string, label: string): `0x${string}` {
  if (!EVM_ADDRESS_REGEX.test(value)) {
    throw new Error(`${label} must be a valid EVM address`)
  }

  return value as `0x${string}`
}

function parsePrivateKey(value: string): string {
  if (!PRIVATE_KEY_REGEX.test(value)) {
    throw new Error("AUTO_REVEAL_PRIVATE_KEY must be a 32-byte hex private key")
  }

  return value
}

export function loadRunOnceConfig(
  env: EnvRecord,
  cliArgs: RunOnceCliArgs = { help: false },
): RunOnceConfig {
  const publicRpcUrl = parseUrl(
    requiredEnv(env, "AUTO_REVEAL_PUBLIC_RPC_URL"),
    "AUTO_REVEAL_PUBLIC_RPC_URL",
  )
  const adminRpcUrl = parseUrl(
    requiredEnv(env, "AUTO_REVEAL_ADMIN_RPC_URL"),
    "AUTO_REVEAL_ADMIN_RPC_URL",
  )
  const privateKey = parsePrivateKey(
    requiredEnv(env, "AUTO_REVEAL_PRIVATE_KEY"),
  )
  const bountyHubAddress = parseAddress(
    requiredEnv(env, "AUTO_REVEAL_BOUNTY_HUB_ADDRESS"),
    "AUTO_REVEAL_BOUNTY_HUB_ADDRESS",
  )

  if (publicRpcUrl === adminRpcUrl) {
    throw new Error(
      "AUTO_REVEAL_ADMIN_RPC_URL must be different from AUTO_REVEAL_PUBLIC_RPC_URL",
    )
  }

  const chainId = parsePositiveInt(
    env.AUTO_REVEAL_CHAIN_ID ?? String(DEFAULT_CHAIN_ID),
    "AUTO_REVEAL_CHAIN_ID",
  )

  const lookbackBlocks = parsePositiveInt(
    cliArgs.lookbackBlocks
      ?? env.AUTO_REVEAL_LOOKBACK_BLOCKS
      ?? String(DEFAULT_LOOKBACK_BLOCKS),
    "AUTO_REVEAL_LOOKBACK_BLOCKS",
  )

  const replayOverlapBlocks = parsePositiveInt(
    cliArgs.replayOverlapBlocks
      ?? env.AUTO_REVEAL_REPLAY_OVERLAP_BLOCKS
      ?? String(DEFAULT_REPLAY_OVERLAP_BLOCKS),
    "AUTO_REVEAL_REPLAY_OVERLAP_BLOCKS",
  )

  const logChunkBlocks = parsePositiveInt(
    cliArgs.logChunkBlocks
      ?? env.AUTO_REVEAL_LOG_CHUNK_BLOCKS
      ?? String(DEFAULT_LOG_CHUNK_BLOCKS),
    "AUTO_REVEAL_LOG_CHUNK_BLOCKS",
  )

  const maxExecutionBatchSize = parsePositiveInt(
    cliArgs.maxExecutionBatchSize
      ?? env.AUTO_REVEAL_MAX_EXECUTION_BATCH_SIZE
      ?? String(DEFAULT_MAX_EXECUTION_BATCH_SIZE),
    "AUTO_REVEAL_MAX_EXECUTION_BATCH_SIZE",
  )

  const cursorFile =
    cliArgs.cursorFile
      ?? env.AUTO_REVEAL_CURSOR_FILE
      ?? DEFAULT_CURSOR_FILE

  if (cursorFile.trim().length === 0) {
    throw new Error("AUTO_REVEAL_CURSOR_FILE must be a non-empty path")
  }

  return {
    publicRpcUrl,
    adminRpcUrl,
    privateKey,
    bountyHubAddress,
    chainId,
    lookbackBlocks,
    replayOverlapBlocks,
    logChunkBlocks,
    maxExecutionBatchSize,
    cursorFile,
  }
}

export function buildRunOncePlan(
  config: RunOnceConfig,
  lastProcessedBlock: bigint = 0n,
  cursorState: {
    recoveredProcessingCount?: number
    quarantinedItemCount?: number
  } = {},
): RunOncePlan {
  const overlap = BigInt(config.replayOverlapBlocks)

  const safeAnchor =
    lastProcessedBlock > overlap
      ? lastProcessedBlock - overlap
      : 0n

  const fromBlock = safeAnchor + 1n
  const toBlock =
    fromBlock
      + BigInt(config.lookbackBlocks)
      - 1n

  return {
    mode: "run-once",
    chainId: config.chainId,
    publicRpcUrl: config.publicRpcUrl,
    adminRpcUrl: config.adminRpcUrl,
    bountyHubAddress: config.bountyHubAddress,
    cursorFile: config.cursorFile,
    cursorLastFinalizedBlock: lastProcessedBlock,
    recoveredProcessingCount: cursorState.recoveredProcessingCount ?? 0,
    quarantinedItemCount: cursorState.quarantinedItemCount ?? 0,
    replayOverlapBlocks: config.replayOverlapBlocks,
    logChunkBlocks: config.logChunkBlocks,
    maxExecutionBatchSize: config.maxExecutionBatchSize,
    fromBlock,
    toBlock,
  }
}

export async function executeAutoRevealRelayerCycle(
  config: RunOnceConfig,
  deps: RunOnceExecutionDeps,
): Promise<RunOnceExecutionResult> {
  const nowMs = deps.nowMs ?? Date.now()

  const plan = buildRunOncePlan(config, deps.store.cursorLastFinalizedBlock, {
    recoveredProcessingCount: deps.store.recoveredProcessingCount,
    quarantinedItemCount: deps.store.quarantinedItemCount,
  })

  const unique = await runUniqueCommittedCandidateScanner({
    config,
    plan,
    store: deps.store,
    runtime: deps.uniqueRuntime,
    nowMs,
  })
  const multi = await runMultiDeadlineScanner({
    config,
    plan,
    store: deps.store,
    runtime: deps.multiRuntime,
    nowMs,
    retryPolicy: deps.retryPolicy,
    sleep: deps.sleep,
    recordMetric: deps.recordMetric,
  })

  return {
    plan,
    unique,
    multi,
  }
}
