import {
	DEMO_OPERATOR_HELP_TEXT,
	getDefaultArgv,
	getDefaultCwd,
	parseDemoOperatorCliArgs,
	type EnvRecord,
} from "./operator/config"
import {
	executeDemoOperatorService,
	loadDemoOperatorServiceConfig,
	type DemoOperatorServiceDependencies,
} from "./operator/service"

type Io = {
	stdout: (line: string) => void
	stderr: (line: string) => void
}

const defaultIo: Io = {
	stdout: (line) => console.log(line),
	stderr: (line) => console.error(line),
}

function getDefaultEnv(): EnvRecord {
	const runtime = globalThis as {
		process?: {
			env?: EnvRecord
		}
	}

	return runtime.process?.env ?? {}
}

function stringifyJson(value: unknown): string {
	return JSON.stringify(value, null, 2)
}

export async function runDemoOperatorCommand(
	argv: string[] = getDefaultArgv(),
	env: EnvRecord = getDefaultEnv(),
	io: Io = defaultIo,
	deps: DemoOperatorServiceDependencies = {},
): Promise<number> {
	try {
		const cliArgs = parseDemoOperatorCliArgs(argv)
		if (cliArgs.help) {
			io.stdout(DEMO_OPERATOR_HELP_TEXT)
			return 0
		}

		const config = loadDemoOperatorServiceConfig(
			{
				command: cliArgs.command,
				scenario: cliArgs.scenario ?? "",
				stateFile: cliArgs.stateFile,
				evidenceDir: cliArgs.evidenceDir,
			},
			env,
			getDefaultCwd(),
		)
		const result = await executeDemoOperatorService({ config, env, deps })
		io.stdout(stringifyJson(result))
		return 0
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		io.stderr(message)
		return 1
	}
}

function isMainModule(): boolean {
	const moduleMeta = import.meta as { main?: boolean }
	return moduleMeta.main === true
}

if (isMainModule()) {
	void runDemoOperatorCommand().then((exitCode) => {
		const runtime = globalThis as {
			process?: {
				exitCode?: number
			}
		}

		if (runtime.process) {
			runtime.process.exitCode = exitCode
		}
	})
}
