import { describe, expect, it } from "bun:test"

import { startCreSimulatorEvmLogWorker } from "./evm-log-worker"

describe("cre-simulator EVM-log worker", () => {
	it("subscribes configured listeners and dispatches incoming log notifications", async () => {
		const messages: string[] = []
		let dispatched = 0
		const worker = await startCreSimulatorEvmLogWorker(
			["--config", "/repo/backend/cre-simulator/triggers.json", "--listener", "poc-revealed"],
			{
				loadConfig: () => ({
					configPath: "/repo/backend/cre-simulator/triggers.json",
					stateFilePath: "/repo/backend/cre-simulator/.trigger-state.json",
					httpTriggers: [],
					cronTriggers: [],
					evmLogTriggers: [
						{
							triggerName: "poc-revealed",
							command: "verify",
							wsRpcUrlEnvVar: "DEMO_OPERATOR_WS_RPC_URL",
							contractAddress: "0x1111111111111111111111111111111111111111",
							topic0:
								"0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
						},
					],
				}),
				env: { DEMO_OPERATOR_WS_RPC_URL: "wss://example.test/ws" },
				createSubscription: async ({ onEvent }) => {
					messages.push("connected")
					await onEvent({
						address: "0x1111111111111111111111111111111111111111",
						topic0:
							"0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
						txHash:
							"0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
						logIndex: 1,
						blockNumber: 88n,
					})
					return { close: () => messages.push("closed") }
				},
				dispatchEvent: async () => {
					dispatched += 1
				},
			},
		)

		expect(messages).toContain("connected")
		expect(dispatched).toBe(1)
		worker?.stop()
		expect(messages).toContain("closed")
	})
})
