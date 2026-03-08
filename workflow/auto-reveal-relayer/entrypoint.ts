import {
  CronCapability,
  Runner,
  consensusIdenticalAggregation,
  handler,
  type NodeRuntime,
  type Runtime,
} from "@chainlink/cre-sdk"
import { createInMemoryAutoRevealCursorStore } from "./cursor-state"
import {
  buildAutoRevealExecutionEnv,
  resolveRequiredEntrypointSecret,
} from "./entrypoint-helpers"
import { createLiveRevealRuntime } from "./live-runtime"
import {
  executeAutoRevealRelayerCycle,
  type EnvRecord,
  loadRunOnceConfig,
} from "./run-once-core"
import {
  parseWorkflowConfig,
  type WorkflowConfig,
} from "./workflow-config"

type AutoRevealEntrypointResult = {
  [key: string]: never
}

const DEFAULT_CRON_SCHEDULE = "0 * * * * *"
const cronCapability = new CronCapability()
const REQUIRED_ENTRYPOINT_SECRET_IDS = [
  "AUTO_REVEAL_PUBLIC_RPC_URL",
  "AUTO_REVEAL_ADMIN_RPC_URL",
  "AUTO_REVEAL_PRIVATE_KEY",
] as const
const asyncNodeConsensusAggregation =
  consensusIdenticalAggregation() as unknown as Parameters<
    Runtime<WorkflowConfig>["runInNodeMode"]
  >[1]
const OPTIONAL_ENTRYPOINT_ENV_IDS = [
  "AUTO_REVEAL_CHAIN_ID",
  "AUTO_REVEAL_LOOKBACK_BLOCKS",
  "AUTO_REVEAL_REPLAY_OVERLAP_BLOCKS",
  "AUTO_REVEAL_LOG_CHUNK_BLOCKS",
  "AUTO_REVEAL_MAX_EXECUTION_BATCH_SIZE",
  "AUTO_REVEAL_CURSOR_FILE",
] as const

function readProcessEnvRecord(): EnvRecord {
  const runtime = globalThis as {
    process?: {
      env?: EnvRecord
    }
  }

  return runtime.process?.env ?? {}
}

function readRequiredRuntimeSecret(
  runtime: Runtime<WorkflowConfig>,
  secretId: (typeof REQUIRED_ENTRYPOINT_SECRET_IDS)[number],
  processEnv: EnvRecord,
): string {
  let runtimeSecretValue: string | undefined

  try {
    runtimeSecretValue = runtime.getSecret({ id: secretId }).result().value
  } catch {
    runtimeSecretValue = undefined
  }

  return resolveRequiredEntrypointSecret({
    secretId,
    runtimeSecretValue,
    processEnv,
  })
}

function readOptionalRuntimeSecret(
  runtime: Runtime<WorkflowConfig>,
  secretId: (typeof OPTIONAL_ENTRYPOINT_ENV_IDS)[number],
): string | undefined {
  try {
    const value = runtime.getSecret({ id: secretId }).result().value.trim()
    return value.length > 0 ? value : undefined
  } catch {
    return undefined
  }
}

function collectEntrypointSecrets(runtime: Runtime<WorkflowConfig>): EnvRecord {
  const processEnv = readProcessEnvRecord()
  const collected: EnvRecord = {}

  for (const secretId of REQUIRED_ENTRYPOINT_SECRET_IDS) {
    collected[secretId] = readRequiredRuntimeSecret(runtime, secretId, processEnv)
  }

  for (const secretId of OPTIONAL_ENTRYPOINT_ENV_IDS) {
    collected[secretId] = readOptionalRuntimeSecret(runtime, secretId) ?? processEnv[secretId]
  }

  return collected
}

async function onCronTrigger(
  runtime: Runtime<WorkflowConfig>,
): Promise<AutoRevealEntrypointResult> {
  const env = collectEntrypointSecrets(runtime)

  const result = await runtime
    .runInNodeMode(
      runAutoRevealRelayerInNodeMode,
      asyncNodeConsensusAggregation,
    )(env)
    .result()

  return result as AutoRevealEntrypointResult
}

async function runAutoRevealRelayerInNodeMode(
  nodeRuntime: NodeRuntime<WorkflowConfig>,
  env: EnvRecord,
): Promise<AutoRevealEntrypointResult> {
  const workflowConfig = parseWorkflowConfig(nodeRuntime.config)
  const executionEnv = buildAutoRevealExecutionEnv(workflowConfig, env)
  const runOnceConfig = loadRunOnceConfig(executionEnv)
  const revealRuntime = await createLiveRevealRuntime({ env: executionEnv, runOnceConfig })
  await executeAutoRevealRelayerCycle(runOnceConfig, {
    store: createInMemoryAutoRevealCursorStore(),
    ...revealRuntime,
  })

  return {}
}

function initWorkflow(_config: WorkflowConfig) {
  return [
    handler(
      cronCapability.trigger({ schedule: DEFAULT_CRON_SCHEDULE }),
      (runtime: Runtime<WorkflowConfig>) => onCronTrigger(runtime),
    ),
  ]
}

export async function main() {
  const runner = await Runner.newRunner<WorkflowConfig>()
  await runner.run(initWorkflow)
}
