import {
  advanceDurableAutoRevealCursor,
  assertAutoRevealCursorStoreHealthy,
  claimDurableAutoRevealQueueItem,
  loadAutoRevealCursorStore,
  markDurableAutoRevealQueueItemCompleted,
  markDurableAutoRevealQueueItemQuarantined,
} from "./cursor-store"
import { deriveAutoRevealQueueItemIdempotencyKey } from "./idempotency"
import {
  runMultiDeadlineScanner,
  type MultiDeadlineRuntime,
  type MultiDeadlineScannerResult,
} from "./multi-deadline"
import {
  runUniqueCommittedCandidateScanner,
  type UniqueCandidateRuntime,
  type UniqueCandidateScannerResult,
} from "./unique-orchestration"
import type { AutoRevealCursorStore } from "./cursor-store"
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

const HELP_TEXT = [
  "Usage: bun run run-once [options]",
  "",
  "Run-once scheduler scaffold for queued reveal relaying.",
  "This command is deterministic and fail-closed on missing required env.",
  "",
  "Options:",
  "  --help                           Show this help message",
  "  --cursor-file <path>             Override cursor file path",
  "  --lookback-blocks <number>       Override lookback block window",
  "  --replay-overlap-blocks <number> Override replay overlap window",
  "  --log-chunk-blocks <number>      Override log chunk size",
  "  --max-execution-batch-size <n>   Override max queued reveals per run",
  "",
  "Required environment:",
  "  AUTO_REVEAL_PUBLIC_RPC_URL       Public/read-only RPC endpoint",
  "  AUTO_REVEAL_ADMIN_RPC_URL        Admin/write RPC endpoint",
  "  AUTO_REVEAL_PRIVATE_KEY          Relayer signing key (never frontend)",
  "  AUTO_REVEAL_BOUNTY_HUB_ADDRESS   BountyHub contract address",
  "",
  "Optional environment:",
  `  AUTO_REVEAL_CHAIN_ID             Defaults to ${DEFAULT_CHAIN_ID}`,
  `  AUTO_REVEAL_LOOKBACK_BLOCKS      Defaults to ${DEFAULT_LOOKBACK_BLOCKS}`,
  `  AUTO_REVEAL_REPLAY_OVERLAP_BLOCKS Defaults to ${DEFAULT_REPLAY_OVERLAP_BLOCKS}`,
  `  AUTO_REVEAL_LOG_CHUNK_BLOCKS     Defaults to ${DEFAULT_LOG_CHUNK_BLOCKS}`,
  `  AUTO_REVEAL_MAX_EXECUTION_BATCH_SIZE Defaults to ${DEFAULT_MAX_EXECUTION_BATCH_SIZE}`,
  `  AUTO_REVEAL_CURSOR_FILE          Defaults to ${DEFAULT_CURSOR_FILE}`,
].join("\n")

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
  uniqueRuntime: UniqueCandidateRuntime
  multiRuntime: MultiDeadlineRuntime
  store?: AutoRevealCursorStore
  nowMs?: number
  retryPolicy?: AutoRevealRetryPolicy
  sleep?: (ms: number) => Promise<void> | void
  recordMetric?: (event: AutoRevealFailureMetricEvent) => void
}

export type RunOnceExecutionResult = {
  plan: RunOncePlan
  unique: UniqueCandidateScannerResult
  multi: MultiDeadlineScannerResult
}

type Io = {
  stdout: (line: string) => void
  stderr: (line: string) => void
}

const defaultIo: Io = {
  stdout: (line) => console.log(line),
  stderr: (line) => console.error(line),
}

function readFlagValue(
  argv: string[],
  index: number,
  flagName: string,
): string {
  const value = argv[index + 1]
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${flagName}`)
  }
  return value
}

export function parseRunOnceCliArgs(argv: string[]): RunOnceCliArgs {
  const parsed: RunOnceCliArgs = {
    help: false,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]

    if (token === "--help" || token === "-h") {
      parsed.help = true
      continue
    }

    if (token === "--cursor-file") {
      parsed.cursorFile = readFlagValue(argv, i, token)
      i += 1
      continue
    }

    if (token === "--lookback-blocks") {
      parsed.lookbackBlocks = readFlagValue(argv, i, token)
      i += 1
      continue
    }

    if (token === "--replay-overlap-blocks") {
      parsed.replayOverlapBlocks = readFlagValue(argv, i, token)
      i += 1
      continue
    }

    if (token === "--log-chunk-blocks") {
      parsed.logChunkBlocks = readFlagValue(argv, i, token)
      i += 1
      continue
    }

    if (token === "--max-execution-batch-size") {
      parsed.maxExecutionBatchSize = readFlagValue(argv, i, token)
      i += 1
      continue
    }

    throw new Error(`Unknown option: ${token}`)
  }

  return parsed
}

function requiredEnv(env: EnvRecord, key: string): string {
  const value = env[key]
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${key}`)
  }
  return value
}

function parseUrl(rawValue: string, label: string): string {
  let parsed: URL
  try {
    parsed = new URL(rawValue)
  } catch {
    throw new Error(`${label} must be a valid URL`)
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${label} must use http or https`)
  }

  return parsed.toString()
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

export async function runAutoRevealRelayerCycle(
  config: RunOnceConfig,
  deps: RunOnceExecutionDeps,
): Promise<RunOnceExecutionResult> {
  const nowMs = deps.nowMs ?? Date.now()
  const store = deps.store ?? loadAutoRevealCursorStore(config.cursorFile, nowMs)

  assertAutoRevealCursorStoreHealthy(store)

  const plan = buildRunOncePlan(config, store.cursorLastFinalizedBlock, {
    recoveredProcessingCount: store.recoveredProcessingCount,
    quarantinedItemCount: store.quarantinedItemCount,
  })

  const unique = await runUniqueCommittedCandidateScanner({
    config,
    plan,
    store,
    runtime: deps.uniqueRuntime,
    nowMs,
  })
  const multi = await runMultiDeadlineScanner({
    config,
    plan,
    store,
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

function stringifyWithBigInt(value: unknown): string {
  return JSON.stringify(
    value,
    (_key, nestedValue) =>
      typeof nestedValue === "bigint"
        ? nestedValue.toString()
        : nestedValue,
    2,
  )
}

function getDefaultArgv(): string[] {
  const runtime = globalThis as {
    process?: {
      argv?: string[]
    }
  }

  return runtime.process?.argv?.slice(2) ?? []
}

function getDefaultEnv(): EnvRecord {
  const runtime = globalThis as {
    process?: {
      env?: EnvRecord
    }
  }

  return runtime.process?.env ?? {}
}

export async function runOnceCommand(
  argv: string[] = getDefaultArgv(),
  env: EnvRecord = getDefaultEnv(),
  io: Io = defaultIo,
): Promise<number> {
  try {
    const cliArgs = parseRunOnceCliArgs(argv)
    if (cliArgs.help) {
      io.stdout(HELP_TEXT)
      return 0
    }

    const config = loadRunOnceConfig(env, cliArgs)
    const store = loadAutoRevealCursorStore(config.cursorFile)
    assertAutoRevealCursorStoreHealthy(store)
    const plan = buildRunOncePlan(config, store.cursorLastFinalizedBlock, {
      recoveredProcessingCount: store.recoveredProcessingCount,
      quarantinedItemCount: store.quarantinedItemCount,
    })
    io.stdout(stringifyWithBigInt(plan))

    return 0
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    io.stderr(message)
    return 1
  }
}

export {
  advanceDurableAutoRevealCursor,
  claimDurableAutoRevealQueueItem,
  deriveAutoRevealQueueItemIdempotencyKey,
  loadAutoRevealCursorStore,
  markDurableAutoRevealQueueItemCompleted,
  markDurableAutoRevealQueueItemQuarantined,
}

function isMainModule(): boolean {
  const moduleMeta = import.meta as { main?: boolean }
  return moduleMeta.main === true
}

if (isMainModule()) {
  void runOnceCommand().then((exitCode) => {
    const runtime = globalThis as {
      process?: {
        exitCode?: number
      }
    }

    if (runtime.process) {
      runtime.process.exitCode = exitCode
    }
  })
}
