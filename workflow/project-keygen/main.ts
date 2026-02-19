import { handler, EVMClient, getNetwork, Runner, type Runtime, type NodeRuntime, type EVMLog } from "@chainlink/cre-sdk"
import { z } from "zod"

// ═══════════════════ Config ═══════════════════

const configSchema = z.object({
  chainSelectorName: z.string(),
  bountyHubAddress: z.string(),
  forwarderAddress: z.string(),
  gasLimit: z.string(),
})

type Config = z.infer<typeof configSchema>

// ═══════════════════ Main Handler ═══════════════════

const onProjectRegisteredV2 = (_runtime: Runtime<Config>, _log: EVMLog): string => {
  // TODO: Implement project keygen workflow
  // 1. Extract projectId, owner, mode from event
  // 2. Generate ECDH keypair
  // 3. Store private key in Vault DON (with owner binding)
  // 4. Update public key on-chain via updateProjectPublicKey
  return "TODO: implement"
}

// ═══════════════════ Workflow Init ═══════════════════

const initWorkflow = (_config: Config) => {
  // TODO: Initialize ProjectRegisteredV2 log trigger
  // TODO: Return handler array
  return []
}

export async function main() {
  const runner = await Runner.newRunner<Config>()
  await runner.run(initWorkflow)
}
