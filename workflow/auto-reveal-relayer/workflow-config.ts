const EVM_ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/
const POSITIVE_INTEGER_STRING_REGEX = /^[0-9]+$/
const WORKFLOW_CONFIG_KEYS = [
  "chainSelectorName",
  "bountyHubAddress",
  "gasLimit",
] as const
const SECRET_ONLY_CONFIG_KEYS = new Set([
  "AUTO_REVEAL_PRIVATE_KEY",
  "privateKey",
  "PRIVATE_KEY",
])

export type WorkflowConfig = {
  chainSelectorName: string
  bountyHubAddress: `0x${string}`
  gasLimit: string
}

function requireObject(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }

  return value as Record<string, unknown>
}

function requireNonEmptyString(
  value: unknown,
  fieldName: string,
): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${fieldName} must be a non-empty string`)
  }

  return value.trim()
}

function requirePositiveIntegerString(
  value: unknown,
  fieldName: string,
): string {
  const normalized = requireNonEmptyString(value, fieldName)
  if (!POSITIVE_INTEGER_STRING_REGEX.test(normalized) || normalized === "0") {
    throw new Error(`${fieldName} must be a positive integer string`)
  }

  return normalized
}

function assertNoSecretOnlyConfigKeys(source: Record<string, unknown>): void {
  const offendingKeys = Object.keys(source).filter((key) =>
    SECRET_ONLY_CONFIG_KEYS.has(key),
  )

  if (offendingKeys.length > 0) {
    throw new Error(
      `${offendingKeys.join(", ")} must stay secret-only and must not appear in workflow config`,
    )
  }
}

function assertNoUnexpectedConfigKeys(source: Record<string, unknown>): void {
  const allowedKeys = new Set<string>(WORKFLOW_CONFIG_KEYS)
  const unexpectedKeys = Object.keys(source).filter((key) => !allowedKeys.has(key))

  if (unexpectedKeys.length > 0) {
    throw new Error(
      `workflow config contains unsupported key(s): ${unexpectedKeys.join(", ")}`,
    )
  }
}

export function parseWorkflowConfig(config: unknown): WorkflowConfig {
  const source = requireObject(config, "workflow config")
  assertNoSecretOnlyConfigKeys(source)
  assertNoUnexpectedConfigKeys(source)

  const chainSelectorName = requireNonEmptyString(
    source.chainSelectorName,
    "chainSelectorName",
  )
  const bountyHubAddress = requireNonEmptyString(
    source.bountyHubAddress,
    "bountyHubAddress",
  )
  const gasLimit = requirePositiveIntegerString(source.gasLimit, "gasLimit")

  if (!EVM_ADDRESS_REGEX.test(bountyHubAddress)) {
    throw new Error("bountyHubAddress must be a valid EVM address")
  }

  return {
    chainSelectorName,
    bountyHubAddress: bountyHubAddress as `0x${string}`,
    gasLimit,
  }
}
