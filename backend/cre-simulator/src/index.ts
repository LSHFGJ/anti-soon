import { resolve } from "node:path"

import { createCreSimulatorHttpHandler } from "./server"

const HELP_TEXT = [
	"Usage: bun ./src/index.ts [options]",
	"",
	"Demo-only backend surface for triggering the async CRE simulator.",
	"",
	"Options:",
	"  --help              Show this help message",
	"  --host <host>       Bind host (default: 127.0.0.1)",
	"  --port <port>       Bind port (default: 8787)",
].join("\n")

function parseArgValue(argv: string[], index: number, flag: string): string {
	const value = argv[index + 1]
	if (!value || value.startsWith("--")) {
		throw new Error(`Missing value for ${flag}`)
	}
	return value
}

function parseArgs(argv: string[]) {
	let host = "127.0.0.1"
	let port = 8787

	for (let index = 0; index < argv.length; index += 1) {
		const token = argv[index]
		if (token === "--help" || token === "-h") {
			return { help: true, host, port }
		}
		if (token === "--host") {
			host = parseArgValue(argv, index, token)
			index += 1
			continue
		}
		if (token === "--port") {
			port = Number.parseInt(parseArgValue(argv, index, token), 10)
			if (!Number.isInteger(port) || port <= 0) {
				throw new Error("--port must be a positive integer")
			}
			index += 1
			continue
		}
		throw new Error(`Unknown option: ${token}`)
	}

	return { help: false, host, port }
}

export function getCreSimulatorHelpText(): string {
	return HELP_TEXT
}

export function startCreSimulatorServer(argv: string[] = process.argv.slice(2)) {
	const args = parseArgs(argv)
	if (args.help) {
		console.log(HELP_TEXT)
		return null
	}

	const repoRoot = resolve(import.meta.dir, "../../..")
	const server = Bun.serve({
		hostname: args.host,
		port: args.port,
		fetch: createCreSimulatorHttpHandler({ repoRoot }),
	})
	console.log(
		`cre-simulator listening on http://${server.hostname}:${server.port}`,
	)
	return server
}

if (import.meta.main) {
	startCreSimulatorServer()
}
