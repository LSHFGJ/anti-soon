import { describe, expect, it } from "bun:test"

import { getCreSimulatorModeRequiredEnv } from "./deploy-preflight"
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
							adapter: "cre-workflow-simulate",
							adapterConfig: {
								workflowPath: "workflow/verify-poc",
								target: "staging-settings",
								triggerIndex: 0,
								evmInput: "event-coordinates",
							},
							wsRpcUrlEnvVar: "CRE_SIM_WS_RPC_URL",
							contractAddress: "0x1111111111111111111111111111111111111111",
							topic0:
								"0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
						},
					],
				}),
				env: { CRE_SIM_WS_RPC_URL: "wss://example.test/ws" },
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

	it("requires the ws rpc env in deployment mode", () => {
		expect(getCreSimulatorModeRequiredEnv("evm-log")).toContain(
			"CRE_SIM_WS_RPC_URL",
		)
	})

	it("fails closed when the listener contract disagrees with the configured live bounty hub address", async () => {
		await expect(
			startCreSimulatorEvmLogWorker(
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
								adapter: "cre-workflow-simulate",
								adapterConfig: {
									workflowPath: "workflow/verify-poc",
									target: "staging-settings",
									triggerIndex: 0,
									evmInput: "event-coordinates",
								},
								wsRpcUrlEnvVar: "CRE_SIM_WS_RPC_URL",
								contractAddress: "0x1111111111111111111111111111111111111111",
								topic0:
									"0xc3c91f25332a5a28defde601c6ccdf9ba0eeb99c94ef7a6cc5fb5a7e7737643f",
							},
						],
					}),
					env: {
						CRE_SIM_WS_RPC_URL: "wss://example.test/ws",
						CRE_SIM_BOUNTY_HUB_ADDRESS:
							"0x2222222222222222222222222222222222222222",
					},
				},
			),
		).rejects.toThrow("does not match CRE_SIM_BOUNTY_HUB_ADDRESS")
	})
})
