import {
	getCreSimulatorModeRequiredEnv,
	type CreSimulatorDeployMode,
	validateCreSimulatorDeployEnv,
} from "./deploy-preflight"

const HELP_TEXT = [
	"Usage: bun ./src/deploy-preflight-cli.ts --mode <http|cron|evm-log>",
	"",
	"Validate whether the current environment is ready for a Railway-style cre-simulator deployment.",
].join("\n")

function parseArgValue(argv: string[], index: number, flag: string): string {
	const value = argv[index + 1]
	if (!value || value.startsWith("--")) {
		throw new Error(`Missing value for ${flag}`)
	}
	return value
}

function isDeployMode(value: string): value is CreSimulatorDeployMode {
	return value === "http" || value === "cron" || value === "evm-log"
}

export function parseCreSimulatorDeployPreflightArgs(argv: string[]): {
	help: boolean
	mode: CreSimulatorDeployMode
} {
	let mode: CreSimulatorDeployMode = "http"

	for (let index = 0; index < argv.length; index += 1) {
		const token = argv[index]
		if (token === "--help" || token === "-h") {
			return { help: true, mode }
		}
		if (token === "--mode") {
			const value = parseArgValue(argv, index, token)
			if (!isDeployMode(value)) {
				throw new Error("--mode must be one of: http, cron, evm-log")
			}
			mode = value
			index += 1
			continue
		}
		throw new Error(`Unknown option: ${token}`)
	}

	return { help: false, mode }
}

export function runCreSimulatorDeployPreflight(
	argv: string[],
	env: Record<string, string | undefined> = process.env as Record<
		string,
		string | undefined
	>,
): {
	exitCode: number
	payload:
		| { ok: true; mode: CreSimulatorDeployMode; required: string[] }
		| { ok: false; mode: CreSimulatorDeployMode; required: string[]; missing: string[] }
		| { ok: true; help: string }
} {
	const args = parseCreSimulatorDeployPreflightArgs(argv)
	if (args.help) {
		return {
			exitCode: 0,
			payload: { ok: true, help: HELP_TEXT },
		}
	}

	const required = getCreSimulatorModeRequiredEnv(args.mode)
	const validation = validateCreSimulatorDeployEnv(args.mode, env)
	if (!validation.ok) {
		return {
			exitCode: 1,
			payload: {
				ok: false,
				mode: args.mode,
				required,
				missing: validation.missing,
			},
		}
	}

	return {
		exitCode: 0,
		payload: {
			ok: true,
			mode: args.mode,
			required,
		},
	}
}

if (import.meta.main) {
	const result = runCreSimulatorDeployPreflight(process.argv.slice(2))
	if ("help" in result.payload) {
		console.log(result.payload.help)
	} else {
		console.log(JSON.stringify(result.payload, null, 2))
	}
	process.exitCode = result.exitCode
}
