import { buildAutoRevealExecutionEnv } from "./live-runtime"

type EntrypointProcessEnv = Record<string, string | undefined>

const REQUIRED_ENTRYPOINT_SECRET_ALIASES = {
  AUTO_REVEAL_PUBLIC_RPC_URL: ["DEMO_OPERATOR_PUBLIC_RPC_URL", "CRE_SIM_SEPOLIA_RPC_URL"],
  AUTO_REVEAL_ADMIN_RPC_URL: [
    "DEMO_OPERATOR_ADMIN_RPC_URL",
    "CRE_SIM_ADMIN_RPC_URL",
    "CRE_SIM_SEPOLIA_RPC_URL",
  ],
  AUTO_REVEAL_PRIVATE_KEY: ["DEMO_OPERATOR_PRIVATE_KEY", "CRE_SIM_PRIVATE_KEY"],
} as const

function firstNonEmpty(
  values: Array<string | undefined>,
): string | undefined {
  for (const value of values) {
    const trimmed = value?.trim()
    if (trimmed) {
      return trimmed
    }
  }

  return undefined
}

export function resolveRequiredEntrypointSecret(args: {
  secretId: keyof typeof REQUIRED_ENTRYPOINT_SECRET_ALIASES
  runtimeSecretValue?: string
  processEnv: EntrypointProcessEnv
}): string {
  const aliasValues = REQUIRED_ENTRYPOINT_SECRET_ALIASES[args.secretId].map(
    (alias) => args.processEnv[alias],
  )
  const resolved = firstNonEmpty([
    args.runtimeSecretValue,
    args.processEnv[args.secretId],
    ...aliasValues,
  ])

  if (!resolved) {
    throw new Error(`Missing required entrypoint secret: ${args.secretId}`)
  }

  return resolved
}

export { buildAutoRevealExecutionEnv }
