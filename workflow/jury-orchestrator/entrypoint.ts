import { HTTPCapability, Runner, handler } from "@chainlink/cre-sdk"
import {
  executeJuryPipeline,
  parseJuryWorkflowConfig,
  type JuryWorkflowConfig,
} from "./main"
import { buildJuryPipelineInputFromHttpPayload } from "./entrypoint-helpers"

const httpCapability = new HTTPCapability()

function initWorkflow(config: JuryWorkflowConfig) {
  const parsedConfig = parseJuryWorkflowConfig(config)

  return [
    handler(httpCapability.trigger({ authorizedKeys: [] }), (_runtime, payload) =>
      executeJuryPipeline(buildJuryPipelineInputFromHttpPayload(parsedConfig, payload)),
    ),
  ]
}

export async function main() {
  const runner = await Runner.newRunner<JuryWorkflowConfig>()
  await runner.run(initWorkflow)
}
