export type CreSimulatorDeployMode = "http" | "cron" | "evm-log"

type EnvRecord = Record<string, string | undefined>

const BASE_REQUIRED_ENV = [
	"CRE_ETH_PRIVATE_KEY",
	"DEMO_AUDITOR_ADDRESS",
	"DEMO_AUDITOR_PRIVATE_KEY",
	"DEMO_OPERATOR_ADDRESS",
	"DEMO_OPERATOR_ADMIN_RPC_URL",
	"DEMO_OPERATOR_PRIVATE_KEY",
	"DEMO_OPERATOR_PUBLIC_RPC_URL",
	"DEMO_PROJECT_OWNER_ADDRESS",
	"DEMO_PROJECT_OWNER_PRIVATE_KEY",
	"TENDERLY_API_KEY",
] as const

const MODE_REQUIRED_ENV: Record<CreSimulatorDeployMode, readonly string[]> = {
	http: [],
	cron: [],
	"evm-log": ["DEMO_OPERATOR_WS_RPC_URL"],
}

const OASIS_UPLOAD_ENV_ALTERNATIVES = [
	"VITE_OASIS_STORAGE_CONTRACT",
	"DEMO_OPERATOR_OASIS_UPLOAD_API_URL",
	"VITE_OASIS_UPLOAD_API_URL",
] as const

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
): {
	ok: boolean
	missing: string[]
} {
	const missing = getCreSimulatorModeRequiredEnv(mode).filter(
		(key) => !hasNonEmptyEnv(env, key),
	)

	const hasOasisUploadMode = OASIS_UPLOAD_ENV_ALTERNATIVES.some((key) =>
		hasNonEmptyEnv(env, key),
	)
	if (!hasOasisUploadMode) {
		missing.push("OASIS_UPLOAD_MODE")
	}

	return {
		ok: missing.length === 0,
		missing,
	}
}
