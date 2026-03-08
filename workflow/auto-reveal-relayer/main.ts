import { createInMemoryAutoRevealCursorStore } from "./cursor-state"
import type { MultiDeadlineRuntime } from "./multi-deadline"
import type {
  AutoRevealFailureMetricEvent,
  AutoRevealRetryPolicy,
} from "./retry-policy"
import {
  executeAutoRevealRelayerCycle,
  loadRunOnceConfig,
  type EnvRecord,
  type RunOnceExecutionResult,
} from "./run-once-core"
import type { UniqueCandidateRuntime } from "./unique-orchestration"
import {
  parseWorkflowConfig,
  type WorkflowConfig,
} from "./workflow-config"

export { parseWorkflowConfig, type WorkflowConfig } from "./workflow-config"

export type WorkflowExecutionOverrides = {
  store?: ReturnType<typeof createInMemoryAutoRevealCursorStore>
  uniqueRuntime: UniqueCandidateRuntime
  multiRuntime: MultiDeadlineRuntime
  nowMs?: number
  retryPolicy?: AutoRevealRetryPolicy
  sleep?: (ms: number) => Promise<void> | void
  recordMetric?: (event: AutoRevealFailureMetricEvent) => void
}

function getDefaultEnv(): EnvRecord {
  const runtime = globalThis as {
    process?: {
      env?: EnvRecord
    }
  }

  return runtime.process?.env ?? {}
}

function buildWorkflowEnv(
  env: EnvRecord,
  workflowConfig: WorkflowConfig,
): EnvRecord {
  const configuredAddress = env.AUTO_REVEAL_BOUNTY_HUB_ADDRESS

  if (
    configuredAddress
    && configuredAddress.trim().length > 0
    && configuredAddress !== workflowConfig.bountyHubAddress
  ) {
    throw new Error(
      "AUTO_REVEAL_BOUNTY_HUB_ADDRESS must match workflow config bountyHubAddress",
    )
  }

  return {
    ...env,
    AUTO_REVEAL_BOUNTY_HUB_ADDRESS: workflowConfig.bountyHubAddress,
  }
}

export async function main(
  workflowConfigInput: unknown,
  env: EnvRecord = getDefaultEnv(),
  overrides?: WorkflowExecutionOverrides,
): Promise<RunOnceExecutionResult> {
  if (!overrides?.uniqueRuntime || !overrides.multiRuntime) {
    throw new Error(
      "main requires uniqueRuntime and multiRuntime overrides to execute the relayer cycle",
    )
  }

  const workflowConfig = parseWorkflowConfig(workflowConfigInput)
  const config = loadRunOnceConfig(buildWorkflowEnv(env, workflowConfig))

  return await executeAutoRevealRelayerCycle(config, {
    store: overrides.store ?? createInMemoryAutoRevealCursorStore(),
    uniqueRuntime: overrides.uniqueRuntime,
    multiRuntime: overrides.multiRuntime,
    nowMs: overrides.nowMs,
    retryPolicy: overrides.retryPolicy,
    sleep: overrides.sleep,
    recordMetric: overrides.recordMetric,
  })
}
