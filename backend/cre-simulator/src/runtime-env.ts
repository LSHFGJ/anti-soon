import type { EnvRecord } from "./env"

function applyAlias(
	env: EnvRecord,
	targetKey: string,
	sourceValue: string | undefined,
): void {
	if (env[targetKey]?.trim()) {
		return
	}
	if (sourceValue?.trim()) {
		env[targetKey] = sourceValue.trim()
	}
}

const DEPRECATED_RUNTIME_ENV_KEYS = [
	"TENDERLY_API_KEY",
	"TENDERLY_API_KEY_VALUE",
	"CRE_ETH_PRIVATE_KEY",
	"PRIVATE_KEY",
	"DEMO_OPERATOR_PRIVATE_KEY",
	"DEMO_OPERATOR_PUBLIC_RPC_URL",
	"VITE_CRE_SIM_SEPOLIA_RPC_URL",
	"VITE_SEPOLIA_RPC_URL",
	"DEMO_OPERATOR_OASIS_RPC_URL",
	"SAPPHIRE_TESTNET_RPC_URL",
	"DEMO_OPERATOR_ADMIN_RPC_URL",
	"DEMO_OPERATOR_WS_RPC_URL",
	"AUTO_REVEAL_BOUNTY_HUB_ADDRESS",
	"VITE_OASIS_STORAGE_CONTRACT",
	"VITE_CRE_SIM_OASIS_STORAGE_CONTRACT",
	"CRE_SIM_OASIS_UPLOAD_API_URL",
	"DEMO_OPERATOR_OASIS_UPLOAD_API_URL",
	"VITE_OASIS_UPLOAD_API_URL",
] as const

export function resolveCreSimulatorRuntimeEnv(args: {
	repoRoot: string
	env: EnvRecord
}): EnvRecord {
	const resolved: EnvRecord = { ...args.env }
	void args.repoRoot
	for (const key of DEPRECATED_RUNTIME_ENV_KEYS) {
		delete resolved[key]
	}

	applyAlias(
		resolved,
		"TENDERLY_API_KEY",
		args.env.CRE_SIM_TENDERLY_API_KEY,
	)
	applyAlias(
		resolved,
		"CRE_ETH_PRIVATE_KEY",
		args.env.CRE_SIM_PRIVATE_KEY,
	)
	applyAlias(
		resolved,
		"DEMO_OPERATOR_PRIVATE_KEY",
		args.env.CRE_SIM_PRIVATE_KEY,
	)
	applyAlias(
		resolved,
		"DEMO_OPERATOR_PUBLIC_RPC_URL",
		args.env.CRE_SIM_SEPOLIA_RPC_URL,
	)
	applyAlias(
		resolved,
		"DEMO_OPERATOR_OASIS_RPC_URL",
		args.env.CRE_SIM_SAPPHIRE_RPC_URL,
	)
	applyAlias(
		resolved,
		"DEMO_OPERATOR_ADMIN_RPC_URL",
		args.env.CRE_SIM_ADMIN_RPC_URL,
	)
	applyAlias(
		resolved,
		"DEMO_OPERATOR_WS_RPC_URL",
		args.env.CRE_SIM_WS_RPC_URL,
	)
	applyAlias(
		resolved,
		"AUTO_REVEAL_BOUNTY_HUB_ADDRESS",
		args.env.CRE_SIM_BOUNTY_HUB_ADDRESS,
	)
	applyAlias(
		resolved,
		"VITE_OASIS_STORAGE_CONTRACT",
		args.env.CRE_SIM_OASIS_STORAGE_CONTRACT,
	)

	return resolved
}
