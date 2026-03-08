import { resolve } from "node:path"

import { loadCreSimulatorTriggerConfig } from "./triggers/config"
import { dispatchEvmLogTriggerEvent } from "./triggers/evmLog"
import type { CreSimulatorEvmLogEvent, CreSimulatorTriggerConfig } from "./triggers/types"

const HELP_TEXT = [
	"Usage: bun ./src/evm-log-worker.ts [options]",
	"",
	"Run the cre-simulator EVM-log trigger worker.",
	"",
	"Options:",
	"  --help              Show this help message",
	"  --config <path>     Override trigger config path",
	"  --listener <name>   Limit startup to one EVM-log trigger name",
	"  --reconnect-ms <n>  Reconnect delay in milliseconds (default: 5000)",
].join("\n")

function parseArgs(argv: string[]) {
	let configPath: string | undefined
	let listenerName: string | undefined
	let reconnectMs = 5000

	for (let index = 0; index < argv.length; index += 1) {
		const token = argv[index]
		if (token === "--help" || token === "-h") {
			return { help: true, configPath, listenerName, reconnectMs }
		}
		if (token === "--config") {
			configPath = argv[index + 1]
			index += 1
			continue
		}
		if (token === "--listener") {
			listenerName = argv[index + 1]
			index += 1
			continue
		}
		if (token === "--reconnect-ms") {
			reconnectMs = Number.parseInt(String(argv[index + 1]), 10)
			index += 1
			continue
		}
		throw new Error(`Unknown option: ${token}`)
	}

	return { help: false, configPath, listenerName, reconnectMs }
}

type EvmLogWorkerHandle = {
	close: () => void
}

type CreateSubscriptionArgs = {
	listener: CreSimulatorTriggerConfig["evmLogTriggers"][number]
	wsUrl: string
	onEvent: (event: CreSimulatorEvmLogEvent) => Promise<void>
	onClose: () => void
}

type StartCreSimulatorEvmLogWorkerDeps = {
	loadConfig?: (configPath: string) => CreSimulatorTriggerConfig
	env?: Record<string, string | undefined>
	createSubscription?: (args: CreateSubscriptionArgs) => Promise<EvmLogWorkerHandle>
	dispatchEvent?: (args: {
		configPath: string
		triggerName: string
		event: CreSimulatorEvmLogEvent
	}) => Promise<void>
}

function normalizeHexNumber(value: string | undefined): bigint {
	if (!value) {
		throw new Error("Missing hex numeric field in EVM log notification")
	}
	return BigInt(value)
}

async function defaultCreateSubscription(args: CreateSubscriptionArgs): Promise<EvmLogWorkerHandle> {
	const socket = new WebSocket(args.wsUrl)
	let subscriptionId: string | undefined
	const requestId = 1
	let closed = false

	const close = () => {
		if (!closed) {
			closed = true
			socket.close()
		}
	}

	await new Promise<void>((resolve, reject) => {
		socket.addEventListener("open", () => {
			socket.send(
				JSON.stringify({
					jsonrpc: "2.0",
					id: requestId,
					method: "eth_subscribe",
					params: [
						"logs",
						{
							address: args.listener.contractAddress,
							topics: [args.listener.topic0],
						},
					],
				}),
			)
		})
		socket.addEventListener("message", (message) => {
			const parsed = JSON.parse(String(message.data)) as Record<string, unknown>
			if (parsed.id === requestId && typeof parsed.result === "string") {
				subscriptionId = parsed.result
				resolve()
				return
			}
			if (
				parsed.method === "eth_subscription"
				&& parsed.params
				&& typeof parsed.params === "object"
				&& (parsed.params as Record<string, unknown>).subscription === subscriptionId
			) {
				const result = ((parsed.params as Record<string, unknown>).result ?? {}) as Record<string, string>
				void args.onEvent({
					address: String(result.address).toLowerCase() as `0x${string}`,
					topic0: String(result.topics?.[0] ?? result.topic0).toLowerCase() as `0x${string}`,
					txHash: String(result.transactionHash).toLowerCase() as `0x${string}`,
					logIndex: Number(normalizeHexNumber(result.logIndex)),
					blockNumber: normalizeHexNumber(result.blockNumber),
				})
			}
		})
		socket.addEventListener("close", () => {
			args.onClose()
			if (!subscriptionId) {
				reject(new Error("EVM log subscription closed before confirmation"))
			}
		})
		socket.addEventListener("error", () => {
			args.onClose()
			if (!subscriptionId) {
				reject(new Error("EVM log subscription failed"))
			}
		})
	})

	return { close }
}

export function getCreSimulatorEvmLogWorkerHelpText(): string {
	return HELP_TEXT
}

export async function startCreSimulatorEvmLogWorker(
	argv: string[] = process.argv.slice(2),
	deps: StartCreSimulatorEvmLogWorkerDeps = {},
) {
	const args = parseArgs(argv)
	if (args.help) {
		console.log(HELP_TEXT)
		return null
	}
	if (!Number.isInteger(args.reconnectMs) || args.reconnectMs <= 0) {
		throw new Error("--reconnect-ms must be a positive integer")
	}
	const repoRoot = resolve(import.meta.dir, "../../..")
	const configPath = args.configPath ?? `${repoRoot}/backend/cre-simulator/triggers.json`
	const env = deps.env ?? (process.env as Record<string, string | undefined>)
	const config = deps.loadConfig
		? deps.loadConfig(configPath)
		: loadCreSimulatorTriggerConfig(configPath, repoRoot)
	const listeners = config.evmLogTriggers.filter((listener) =>
		args.listenerName ? listener.triggerName === args.listenerName : true,
	)
	const handles: EvmLogWorkerHandle[] = []
	let stopped = false

	for (const listener of listeners) {
		const wsUrl = env[listener.wsRpcUrlEnvVar]
		if (!wsUrl || wsUrl.trim().length === 0) {
			throw new Error(`Missing required environment variable: ${listener.wsRpcUrlEnvVar}`)
		}

		const connect = async (): Promise<void> => {
			if (stopped) {
				return
			}
			const handle = await (deps.createSubscription ?? defaultCreateSubscription)({
				listener,
				wsUrl,
				onEvent: async (event) => {
					await (deps.dispatchEvent
						? deps.dispatchEvent({ configPath, triggerName: listener.triggerName, event })
						: dispatchEvmLogTriggerEvent(
							{ configPath, repoRoot, triggerName: listener.triggerName, event },
							env,
						))
				},
				onClose: () => {
					if (!stopped) {
						setTimeout(() => {
							void connect()
						}, args.reconnectMs)
					}
				},
			})
			handles.push(handle)
		}

		await connect()
	}

	return {
		stop: () => {
			stopped = true
			for (const handle of handles) {
				handle.close()
			}
		},
	}
}

if (import.meta.main) {
	void startCreSimulatorEvmLogWorker()
}
