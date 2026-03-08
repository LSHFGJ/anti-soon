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
  buildRunOncePlan,
  executeAutoRevealRelayerCycle,
  loadRunOnceConfig,
  type EnvRecord,
  type RunOnceCliArgs,
  type RunOnceConfig,
  type RunOnceExecutionResult,
  type RunOncePlan,
} from "./run-once-core"
import type { AutoRevealCursorStore } from "./cursor-state"
import type { RunOnceExecutionDeps as CoreRunOnceExecutionDeps } from "./run-once-core"

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
  "  AUTO_REVEAL_CHAIN_ID             Defaults to 11155111",
  "  AUTO_REVEAL_LOOKBACK_BLOCKS      Defaults to 5000",
  "  AUTO_REVEAL_REPLAY_OVERLAP_BLOCKS Defaults to 12",
  "  AUTO_REVEAL_LOG_CHUNK_BLOCKS     Defaults to 5000",
  "  AUTO_REVEAL_MAX_EXECUTION_BATCH_SIZE Defaults to 25",
  "  AUTO_REVEAL_CURSOR_FILE          Defaults to workflow/auto-reveal-relayer/.auto-reveal-cursor.json",
].join("\n")

type Io = {
  stdout: (line: string) => void
  stderr: (line: string) => void
}

const defaultIo: Io = {
  stdout: (line) => console.log(line),
  stderr: (line) => console.error(line),
}

export type RunOnceExecutionDeps = Omit<CoreRunOnceExecutionDeps, "store"> & {
  store?: AutoRevealCursorStore
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

export async function runAutoRevealRelayerCycle(
  config: RunOnceConfig,
  deps: RunOnceExecutionDeps,
): Promise<RunOnceExecutionResult> {
  const nowMs = deps.nowMs ?? Date.now()
  const store = deps.store ?? loadAutoRevealCursorStore(config.cursorFile, nowMs)

  assertAutoRevealCursorStoreHealthy(store)

  return await executeAutoRevealRelayerCycle(config, {
    ...deps,
    store,
    nowMs,
  })
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

export type {
  EnvRecord,
  RunOnceCliArgs,
  RunOnceConfig,
  RunOnceExecutionResult,
  RunOncePlan,
}

export {
  advanceDurableAutoRevealCursor,
  buildRunOncePlan,
  claimDurableAutoRevealQueueItem,
  deriveAutoRevealQueueItemIdempotencyKey,
  loadAutoRevealCursorStore,
  loadRunOnceConfig,
  markDurableAutoRevealQueueItemCompleted,
  markDurableAutoRevealQueueItemQuarantined,
}
