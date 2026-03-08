export type CreSimulatorDeployMode = "http" | "cron" | "evm-log"

type EnvRecord = Record<string, string | undefined>

const BASE_REQUIRED_ENV = [
	"CRE_SIM_PRIVATE_KEY",
	"CRE_SIM_TENDERLY_API_KEY",
	"CRE_SIM_SEPOLIA_RPC_URL",
	"CRE_SIM_ADMIN_RPC_URL",
	"CRE_SIM_BOUNTY_HUB_ADDRESS",
	"CRE_SIM_OASIS_STORAGE_CONTRACT",
] as const

const MODE_REQUIRED_ENV: Record<CreSimulatorDeployMode, readonly string[]> = {
	http: [],
	cron: [],
	"evm-log": ["CRE_SIM_WS_RPC_URL"],
}
function hasNonEmptyEnv(env: EnvRecord, key: string): boolean {
	return (env[key]?.trim().length ?? 0) > 0
}

export function getCreSimulatorBaseRequiredEnv(): string[] {
	return [...BASE_REQUIRED_ENV]
}

export function getCreSimulatorModeRequiredEnv(
	mode: CreSimulatorDeployMode,
): string[] {
	return [...BASE_REQUIRED_ENV, ...MODE_REQUIRED_ENV[mode]]
}

export function validateCreSimulatorDeployEnv(
	mode: CreSimulatorDeployMode,
	env: EnvRecord,
	repoRoot: string,
): {
	ok: boolean
	missing: string[]
} {
	void repoRoot
	const missing = [...BASE_REQUIRED_ENV, ...MODE_REQUIRED_ENV[mode]].filter(
		(key) => !hasNonEmptyEnv(env, key),
	)

	return {
		ok: missing.length === 0,
		missing,
	}
}
