import { parseJuryWorkflowConfig, type JuryPipelineInput } from "./main"

type HttpTriggerPayload = {
  input: Uint8Array
}

function requireObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object`)
  }

  return value as Record<string, unknown>
}

export function buildJuryPipelineInputFromHttpPayload(
  workflowConfigInput: unknown,
  payload: HttpTriggerPayload,
): JuryPipelineInput {
  const workflowConfig = parseJuryWorkflowConfig(workflowConfigInput)
  const rawInput = new TextDecoder().decode(payload.input)
  const parsedPayload = requireObject(JSON.parse(rawInput), "http trigger payload")

  if ("config" in parsedPayload) {
    throw new Error("http trigger payload must not include config")
  }

  return {
    ...parsedPayload,
    config: workflowConfig,
  } as JuryPipelineInput
}
