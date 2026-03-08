import { describe, expect, it } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { resolveCreSimulatorRuntimeEnv } from "./runtime-env"

describe("cre-simulator runtime env", () => {
	it("resolves the small shared env model into the legacy backend env names", () => {
		const repoRoot = mkdtempSync(join(tmpdir(), "cre-simulator-runtime-env-"))

		const env = resolveCreSimulatorRuntimeEnv({
			repoRoot,
			env: {
				CRE_SIM_PRIVATE_KEY:
					"0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
				CRE_SIM_TENDERLY_API_KEY: "tenderly-secret",
				CRE_SIM_SEPOLIA_RPC_URL: "https://rpc.public.test",
				CRE_SIM_ADMIN_RPC_URL: "https://rpc.admin.test",
				CRE_SIM_WS_RPC_URL: "wss://rpc.ws.test",
				CRE_SIM_SAPPHIRE_RPC_URL: "https://sapphire.test",
				CRE_SIM_BOUNTY_HUB_ADDRESS:
					"0x4444444444444444444444444444444444444444",
				CRE_SIM_OASIS_STORAGE_CONTRACT:
					"0x5555555555555555555555555555555555555555",
			},
		})

		expect(env.TENDERLY_API_KEY).toBe("tenderly-secret")
		expect(env.CRE_ETH_PRIVATE_KEY).toBe(
			"0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
		)
		expect(env.DEMO_OPERATOR_PUBLIC_RPC_URL).toBe("https://rpc.public.test")
		expect(env.DEMO_OPERATOR_ADMIN_RPC_URL).toBe("https://rpc.admin.test")
		expect(env.DEMO_OPERATOR_WS_RPC_URL).toBe("wss://rpc.ws.test")
		expect(env.DEMO_OPERATOR_PRIVATE_KEY).toBe(
			"0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
		)
		expect(env.DEMO_OPERATOR_OASIS_RPC_URL).toBe("https://sapphire.test")
		expect(env.AUTO_REVEAL_BOUNTY_HUB_ADDRESS).toBe(
			"0x4444444444444444444444444444444444444444",
		)
		expect(env.VITE_OASIS_STORAGE_CONTRACT).toBe(
			"0x5555555555555555555555555555555555555555",
		)

		rmSync(repoRoot, { recursive: true, force: true })
	})

	it("does not backfill runtime aliases from deprecated user-facing env names", () => {
		const repoRoot = mkdtempSync(join(tmpdir(), "cre-simulator-runtime-aliases-"))
		const env = resolveCreSimulatorRuntimeEnv({
			repoRoot,
			env: {
				PRIVATE_KEY:
					"0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
				TENDERLY_API_KEY_VALUE: "tenderly-secret",
				VITE_SEPOLIA_RPC_URL: "https://rpc.public.test",
				CRE_SIM_ADMIN_RPC_URL: "https://rpc.admin.test",
				CRE_SIM_WS_RPC_URL: "wss://rpc.ws.test",
				SAPPHIRE_TESTNET_RPC_URL: "https://sapphire.test",
				AUTO_REVEAL_BOUNTY_HUB_ADDRESS:
					"0x4444444444444444444444444444444444444444",
			},
		})

		expect(env.CRE_ETH_PRIVATE_KEY).toBeUndefined()
		expect(env.TENDERLY_API_KEY).toBeUndefined()
		expect(env.DEMO_OPERATOR_PUBLIC_RPC_URL).toBeUndefined()
		expect(env.DEMO_OPERATOR_ADMIN_RPC_URL).toBe("https://rpc.admin.test")
		expect(env.DEMO_OPERATOR_WS_RPC_URL).toBe("wss://rpc.ws.test")
		expect(env.DEMO_OPERATOR_PRIVATE_KEY).toBeUndefined()
		expect(env.DEMO_OPERATOR_OASIS_RPC_URL).toBeUndefined()
		expect(env.AUTO_REVEAL_BOUNTY_HUB_ADDRESS).toBeUndefined()

		rmSync(repoRoot, { recursive: true, force: true })
	})

	it("ignores removed runtime-config fallback keys", () => {
		const repoRoot = mkdtempSync(join(tmpdir(), "cre-simulator-runtime-json-"))
		const env = resolveCreSimulatorRuntimeEnv({
			repoRoot,
			env: {
				CRE_SIM_PRIVATE_KEY:
					"0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
				CRE_SIM_TENDERLY_API_KEY: "tenderly-secret",
				CRE_SIM_SEPOLIA_RPC_URL: "https://rpc.public.test",
				CRE_SIM_ADMIN_RPC_URL: "https://rpc.admin.test",
				CRE_SIM_WS_RPC_URL: "wss://rpc.ws.test",
				CRE_SIM_RUNTIME_CONFIG_JSON: JSON.stringify({
					operator: {
						adminRpcUrl: "https://wrong.test",
						wsRpcUrl: "wss://wrong.test",
					},
				}),
				CRE_SIM_RUNTIME_CONFIG_PATH: "backend/cre-simulator/.runtime.local.json",
			},
		})

			expect(env.DEMO_OPERATOR_ADMIN_RPC_URL).toBe("https://rpc.admin.test")
			expect(env.DEMO_OPERATOR_WS_RPC_URL).toBe("wss://rpc.ws.test")
			expect(env.DEMO_OPERATOR_PRIVATE_KEY).toBe(
				"0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
			)
			expect(env.CRE_SIM_RUNTIME_CONFIG_JSON).toBeDefined()
			expect(env.CRE_SIM_RUNTIME_CONFIG_PATH).toBe("backend/cre-simulator/.runtime.local.json")

			rmSync(repoRoot, { recursive: true, force: true })
	})
})
