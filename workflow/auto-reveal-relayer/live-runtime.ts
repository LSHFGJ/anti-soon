import type { MultiDeadlineRuntime } from "./multi-deadline"
import { loadRunOnceConfig, type EnvRecord, type RunOnceConfig } from "./run-once-core"
import type { UniqueCandidateRuntime } from "./unique-orchestration"
import type { WorkflowConfig } from "./workflow-config"

type HexString = `0x${string}`

const BOUNTY_HUB_REVEAL_ABI = [
  {
    type: "event",
    name: "PoCCommitted",
    inputs: [
      { name: "submissionId", type: "uint256", indexed: true },
      { name: "projectId", type: "uint256", indexed: true },
      { name: "auditor", type: "address", indexed: true },
      { name: "commitHash", type: "bytes32", indexed: false },
    ],
  },
  {
    type: "event",
    name: "RevealQueued",
    inputs: [{ name: "submissionId", type: "uint256", indexed: true }],
  },
  {
    type: "event",
    name: "PoCRevealed",
    inputs: [{ name: "submissionId", type: "uint256", indexed: true }],
  },
  {
    type: "function",
    stateMutability: "view",
    name: "projects",
    inputs: [{ name: "_projectId", type: "uint256" }],
    outputs: [
      { type: "uint8", name: "mode" },
      { type: "uint64", name: "commitDeadline" },
      { type: "uint64", name: "revealDeadline" },
    ],
  },
  {
    type: "function",
    stateMutability: "view",
    name: "submissions",
    inputs: [{ name: "_submissionId", type: "uint256" }],
    outputs: [
      { type: "uint256", name: "projectId" },
      { type: "uint8", name: "status" },
    ],
  },
  {
    type: "function",
    stateMutability: "view",
    name: "queuedReveals",
    inputs: [{ name: "_submissionId", type: "uint256" }],
    outputs: [
      { type: "address", name: "auditor" },
      { type: "bytes32", name: "salt" },
      { type: "uint64", name: "deadline" },
      { type: "bool", name: "queued" },
    ],
  },
  {
    type: "function",
    stateMutability: "view",
    name: "uniqueRevealStateByProject",
    inputs: [{ name: "_projectId", type: "uint256" }],
    outputs: [
      { type: "bool", name: "hasCandidate" },
      { type: "uint256", name: "candidateSubmissionId" },
      { type: "bool", name: "winnerLocked" },
      { type: "uint256", name: "winnerSubmissionId" },
    ],
  },
  {
    type: "function",
    stateMutability: "nonpayable",
    name: "executeQueuedReveal",
    inputs: [{ name: "_submissionId", type: "uint256" }],
    outputs: [],
  },
] as const

type AutoRevealRuntimeSecretKey =
  | "AUTO_REVEAL_PUBLIC_RPC_URL"
  | "AUTO_REVEAL_ADMIN_RPC_URL"
  | "AUTO_REVEAL_PRIVATE_KEY"

function normalizeAddress(value: string, label: string): `0x${string}` {
  if (!/^0x[a-fA-F0-9]{40}$/.test(value)) {
    throw new Error(`${label} must be a valid EVM address`)
  }

  return value as `0x${string}`
}

function normalizeHash(value: string, label: string): HexString {
  if (!/^0x[a-fA-F0-9]{64}$/.test(value)) {
    throw new Error(`${label} must be a 32-byte hex string`)
  }

  return value.toLowerCase() as HexString
}

function toBigInt(value: unknown, label: string): bigint {
  if (typeof value === "bigint") {
    return value
  }

  if (typeof value === "number") {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`${label} must be a non-negative integer`)
    }

    return BigInt(value)
  }

  if (typeof value === "string" && value.length > 0) {
    return BigInt(value)
  }

  throw new Error(`${label} is required`)
}

function requireSecretValue(
  values: Partial<Record<AutoRevealRuntimeSecretKey, string | undefined>>,
  key: AutoRevealRuntimeSecretKey,
): string {
  const value = values[key]?.trim()
  if (!value) {
    throw new Error(`Missing required entrypoint secret: ${key}`)
  }

  return value
}

export function buildAutoRevealExecutionEnv(
  workflowConfig: WorkflowConfig,
  values: Partial<Record<AutoRevealRuntimeSecretKey | string, string | undefined>>,
): EnvRecord {
  const publicRpcUrl = requireSecretValue(values, "AUTO_REVEAL_PUBLIC_RPC_URL")
  const adminRpcUrl = requireSecretValue(values, "AUTO_REVEAL_ADMIN_RPC_URL")
  const privateKey = requireSecretValue(values, "AUTO_REVEAL_PRIVATE_KEY")
  const configuredAddress = values.AUTO_REVEAL_BOUNTY_HUB_ADDRESS?.trim()

  if (
    configuredAddress &&
    configuredAddress !== workflowConfig.bountyHubAddress
  ) {
    throw new Error(
      "AUTO_REVEAL_BOUNTY_HUB_ADDRESS must match workflow config bountyHubAddress",
    )
  }

  return {
    AUTO_REVEAL_PUBLIC_RPC_URL: publicRpcUrl,
    AUTO_REVEAL_ADMIN_RPC_URL: adminRpcUrl,
    AUTO_REVEAL_PRIVATE_KEY: privateKey,
    AUTO_REVEAL_BOUNTY_HUB_ADDRESS: workflowConfig.bountyHubAddress,
    ...(values.AUTO_REVEAL_CHAIN_ID
      ? { AUTO_REVEAL_CHAIN_ID: values.AUTO_REVEAL_CHAIN_ID }
      : {}),
    ...(values.AUTO_REVEAL_LOOKBACK_BLOCKS
      ? { AUTO_REVEAL_LOOKBACK_BLOCKS: values.AUTO_REVEAL_LOOKBACK_BLOCKS }
      : {}),
    ...(values.AUTO_REVEAL_REPLAY_OVERLAP_BLOCKS
      ? { AUTO_REVEAL_REPLAY_OVERLAP_BLOCKS: values.AUTO_REVEAL_REPLAY_OVERLAP_BLOCKS }
      : {}),
    ...(values.AUTO_REVEAL_LOG_CHUNK_BLOCKS
      ? { AUTO_REVEAL_LOG_CHUNK_BLOCKS: values.AUTO_REVEAL_LOG_CHUNK_BLOCKS }
      : {}),
    ...(values.AUTO_REVEAL_MAX_EXECUTION_BATCH_SIZE
      ? { AUTO_REVEAL_MAX_EXECUTION_BATCH_SIZE: values.AUTO_REVEAL_MAX_EXECUTION_BATCH_SIZE }
      : {}),
    ...(values.AUTO_REVEAL_CURSOR_FILE
      ? { AUTO_REVEAL_CURSOR_FILE: values.AUTO_REVEAL_CURSOR_FILE }
      : {}),
  }
}

export const buildLiveRevealEnv = buildAutoRevealExecutionEnv

export async function createLiveRevealRuntime(args: {
  env: EnvRecord
  runOnceConfig: RunOnceConfig
}): Promise<{
  uniqueRuntime: UniqueCandidateRuntime
  multiRuntime: MultiDeadlineRuntime
}> {
  const viem = await import("viem")
  const accounts = await import("viem/accounts")
  const transportConfig = {
    batch: false,
    fetchOptions: {
      cache: "no-store" as const,
      keepalive: false,
    },
  } as const
  const account = accounts.privateKeyToAccount(
    normalizeHash(args.env.AUTO_REVEAL_PRIVATE_KEY ?? "", "AUTO_REVEAL_PRIVATE_KEY"),
  )
  const publicClient = viem.createPublicClient({
    transport: viem.http(args.runOnceConfig.publicRpcUrl, transportConfig),
  })
  const walletClient = viem.createWalletClient({
    account,
    transport: viem.http(args.runOnceConfig.adminRpcUrl, transportConfig),
  })
  const bountyHubAddress = args.runOnceConfig.bountyHubAddress

  const uniqueRuntime: UniqueCandidateRuntime = {
    getCommittedLogs: async ({ fromBlock, toBlock }) => {
      const logs = await publicClient.getContractEvents({
        address: bountyHubAddress,
        abi: BOUNTY_HUB_REVEAL_ABI,
        eventName: "PoCCommitted",
        fromBlock,
        toBlock,
        strict: false,
      })

      return logs.map((log) => ({
        submissionId: toBigInt(log.args.submissionId, "PoCCommitted.submissionId"),
        projectId: toBigInt(log.args.projectId, "PoCCommitted.projectId"),
        auditor: normalizeAddress(String(log.args.auditor ?? ""), "PoCCommitted.auditor"),
        commitHash: normalizeHash(String(log.args.commitHash ?? ""), "PoCCommitted.commitHash"),
        blockNumber: toBigInt(log.blockNumber, "PoCCommitted.blockNumber"),
        transactionHash: normalizeHash(
          String(log.transactionHash ?? ""),
          "PoCCommitted.transactionHash",
        ),
        logIndex: toBigInt(log.logIndex, "PoCCommitted.logIndex"),
      }))
    },
    readSubmission: async (submissionId) => {
      const [projectId, status] = await publicClient.readContract({
        address: bountyHubAddress,
        abi: BOUNTY_HUB_REVEAL_ABI,
        functionName: "submissions",
        args: [submissionId],
      })

      return {
        submissionId,
        projectId,
        status:
          status === 0
            ? "Committed"
            : status === 1
              ? "Revealed"
              : status === 4
                ? "Finalized"
                : status === 5
                  ? "Invalid"
                  : "Verified",
      }
    },
    readProject: async (projectId) => {
      const [mode] = await publicClient.readContract({
        address: bountyHubAddress,
        abi: BOUNTY_HUB_REVEAL_ABI,
        functionName: "projects",
        args: [projectId],
      })

      return {
        projectId,
        mode: mode === 0 ? "UNIQUE" : "MULTI",
      }
    },
    readUniqueRevealState: async (projectId) => {
      const [hasCandidate, candidateSubmissionId, winnerLocked, winnerSubmissionId] =
        await publicClient.readContract({
        address: bountyHubAddress,
        abi: BOUNTY_HUB_REVEAL_ABI,
        functionName: "uniqueRevealStateByProject",
        args: [projectId],
      })

      return {
        hasCandidate,
        candidateSubmissionId,
        winnerLocked,
        winnerSubmissionId,
      }
    },
  }

  const multiRuntime: MultiDeadlineRuntime = {
    getNowTimestampSec: async () => {
      const block = await publicClient.getBlock({ blockTag: "latest" })
      return toBigInt(block.timestamp, "latest block timestamp")
    },
    getQueuedRevealLogs: async ({ fromBlock, toBlock }) => {
      const logs = await publicClient.getContractEvents({
        address: bountyHubAddress,
        abi: BOUNTY_HUB_REVEAL_ABI,
        eventName: "RevealQueued",
        fromBlock,
        toBlock,
        strict: false,
      })

      return logs.map((log) => ({
        submissionId: toBigInt(log.args.submissionId, "RevealQueued.submissionId"),
        blockNumber: toBigInt(log.blockNumber, "RevealQueued.blockNumber"),
        transactionHash: normalizeHash(
          String(log.transactionHash ?? ""),
          "RevealQueued.transactionHash",
        ),
        logIndex: toBigInt(log.logIndex, "RevealQueued.logIndex"),
      }))
    },
    readSubmission: async (submissionId) => {
      const [projectId, status] = await publicClient.readContract({
        address: bountyHubAddress,
        abi: BOUNTY_HUB_REVEAL_ABI,
        functionName: "submissions",
        args: [submissionId],
      })

      return {
        submissionId,
        projectId,
        status:
          status === 0
            ? "Committed"
            : status === 1
              ? "Revealed"
              : status === 5
                ? "Invalid"
                : "Verified",
      }
    },
    readProject: async (projectId) => {
      const [mode, commitDeadline, revealDeadline] = await publicClient.readContract({
        address: bountyHubAddress,
        abi: BOUNTY_HUB_REVEAL_ABI,
        functionName: "projects",
        args: [projectId],
      })

      return {
        projectId,
        mode: mode === 0 ? "UNIQUE" : "MULTI",
        commitDeadline,
        revealDeadline,
      }
    },
    readQueuedReveal: async (submissionId) => {
      const [auditor, salt, deadline, queued] = await publicClient.readContract({
        address: bountyHubAddress,
        abi: BOUNTY_HUB_REVEAL_ABI,
        functionName: "queuedReveals",
        args: [submissionId],
      })

      return {
        submissionId,
        auditor: normalizeAddress(auditor, "queuedReveals.auditor"),
        salt: normalizeHash(salt, "queuedReveals.salt"),
        deadline,
        queued,
      }
    },
    executeQueuedReveal: async (submissionId) => {
      const simulation = await publicClient.simulateContract({
        account,
        address: bountyHubAddress,
        abi: BOUNTY_HUB_REVEAL_ABI,
        functionName: "executeQueuedReveal",
        args: [submissionId],
      })
      const txHash = await walletClient.writeContract(simulation.request)
      await publicClient.waitForTransactionReceipt({ hash: txHash })

      return { txHash: normalizeHash(txHash, "executeQueuedReveal tx hash") }
    },
  }

  return { uniqueRuntime, multiRuntime }
}

export function buildRunOnceConfigForLiveReveal(
  workflowConfig: WorkflowConfig,
  values: Partial<Record<AutoRevealRuntimeSecretKey | string, string | undefined>>,
): RunOnceConfig {
  return loadRunOnceConfig(buildAutoRevealExecutionEnv(workflowConfig, values))
}
