import { CronCapability, handler, Runner, type Runtime } from "@chainlink/cre-sdk"
import { z } from "zod"

const configSchema = z.object({
  chainSelectorName: z.string(),
  bountyHubAddress: z.string(),
  gasLimit: z.string(),
  tenderlyAccountSlug: z.string(),
  tenderlyProjectSlug: z.string(),
  llmApiUrl: z.string(),
  ipfsGateway: z.string(),
})

type Config = z.infer<typeof configSchema>

const onCronTrigger = (runtime: Runtime<Config>): string => {
  runtime.log("AntiSoon verify-poc workflow triggered.")
  runtime.log(`BountyHub: ${runtime.config.bountyHubAddress}`)
  return "Hello from AntiSoon!"
}

const initWorkflow = (config: Config) => {
  const cron = new CronCapability()
  return [handler(cron.trigger({ schedule: "*/30 * * * * *" }), onCronTrigger)]
}

export async function main() {
  const runner = await Runner.newRunner<Config>()
  await runner.run(initWorkflow)
}
