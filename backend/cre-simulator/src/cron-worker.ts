import { resolve } from "node:path"

import { executeCreSimulatorCronTick } from "./service"
import { resolveCreSimulatorRuntimeEnv } from "./runtime-env"

const HELP_TEXT = [
	"Usage: bun ./src/cron-worker.ts [options]",
	"",
	"Run the cre-simulator CRON trigger worker.",
	"",
	"Options:",
	"  --help              Show this help message",
	"  --config <path>     Override trigger config path",
	"  --once              Run one scheduler tick and exit",
	"  --interval-ms <n>   Loop interval in milliseconds (default: 60000)",
].join("\n")

function parseArgs(argv: string[]) {
	let configPath: string | undefined
	let once = false
	let intervalMs = 60000

	for (let index = 0; index < argv.length; index += 1) {
		const token = argv[index]
		if (token === "--help" || token === "-h") {
			return { help: true, configPath, once, intervalMs }
		}
		if (token === "--once") {
			once = true
			continue
		}
		if (token === "--config") {
			configPath = argv[index + 1]
			index += 1
			continue
		}
		if (token === "--interval-ms") {
			intervalMs = Number.parseInt(String(argv[index + 1]), 10)
			index += 1
			continue
		}
		throw new Error(`Unknown option: ${token}`)
	}

	return { help: false, configPath, once, intervalMs }
}

export function createCreSimulatorCronWorkerRunner(
	runTick: () => Promise<unknown>,
): { runTick: () => Promise<"completed" | "skipped"> } {
	let inFlight: Promise<"completed"> | null = null

	return {
		runTick: async () => {
			if (inFlight) {
				return "skipped"
			}

			inFlight = (async () => {
				try {
					await runTick()
					return "completed" as const
				} finally {
					inFlight = null
				}
			})()

			return await inFlight
		},
	}
}

export function getCreSimulatorCronWorkerHelpText(): string {
	return HELP_TEXT
}

export async function startCreSimulatorCronWorker(argv: string[] = process.argv.slice(2)) {
	const args = parseArgs(argv)
	if (args.help) {
		console.log(HELP_TEXT)
		return null
	}
	if (!Number.isInteger(args.intervalMs) || args.intervalMs <= 0) {
		throw new Error("--interval-ms must be a positive integer")
	}
	const repoRoot = resolve(import.meta.dir, "../../..")
	const env = resolveCreSimulatorRuntimeEnv({
		repoRoot,
		env: process.env as Record<string, string | undefined>,
	})
	const runner = createCreSimulatorCronWorkerRunner(async () => {
		await executeCreSimulatorCronTick(
			{ ...(args.configPath ? { configPath: args.configPath } : {}) },
			env,
		)
	})
	if (args.once) {
		await runner.runTick()
		return null
	}
	const timer = setInterval(() => {
		void runner.runTick().catch((error) => {
			console.error(error instanceof Error ? error.message : String(error))
		})
	}, args.intervalMs)
	return { stop: () => clearInterval(timer) }
}

if (import.meta.main) {
	void startCreSimulatorCronWorker()
}
