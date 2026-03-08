import { describe, expect, it } from "bun:test"
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

import {
	getCreSimulatorBaseRequiredEnv,
	getCreSimulatorModeRequiredEnv,
	validateCreSimulatorDeployEnv,
} from "./deploy-preflight"
import { runCreSimulatorDeployPreflight } from "./deploy-preflight-cli"

const REPO_ROOT = resolve(import.meta.dir, "../../..")

describe("cre-simulator deploy preflight", () => {
	it("lists the base env required for a full run deployment", () => {
		expect(getCreSimulatorBaseRequiredEnv()).toEqual([
			"CRE_SIM_PRIVATE_KEY",
			"CRE_SIM_TENDERLY_API_KEY",
			"CRE_SIM_SEPOLIA_RPC_URL",
			"CRE_SIM_ADMIN_RPC_URL",
			"CRE_SIM_BOUNTY_HUB_ADDRESS",
			"CRE_SIM_OASIS_STORAGE_CONTRACT",
		])
	})

	it("adds ws rpc requirement for evm-log mode", () => {
		expect(getCreSimulatorModeRequiredEnv("evm-log")).toContain(
			"CRE_SIM_WS_RPC_URL",
		)
	})

	it("accepts direct Sapphire write mode when storage contract is configured", () => {
		const validation = validateCreSimulatorDeployEnv(
			"http",
			{
				CRE_SIM_PRIVATE_KEY: "x",
				CRE_SIM_TENDERLY_API_KEY: "x",
				CRE_SIM_SEPOLIA_RPC_URL: "https://rpc.public.test",
				CRE_SIM_ADMIN_RPC_URL: "https://rpc.admin.test",
				CRE_SIM_BOUNTY_HUB_ADDRESS: "0x4444444444444444444444444444444444444444",
				CRE_SIM_OASIS_STORAGE_CONTRACT: "x",
			},
			REPO_ROOT,
		)

		expect(validation.ok).toBe(true)
		expect(validation.missing).toEqual([])
	})

	it("requires the canonical storage contract env instead of legacy upload-api mode", () => {
		const validation = validateCreSimulatorDeployEnv(
			"cron",
			{
				CRE_SIM_PRIVATE_KEY: "x",
				CRE_SIM_TENDERLY_API_KEY: "x",
				CRE_SIM_SEPOLIA_RPC_URL: "https://rpc.public.test",
				CRE_SIM_ADMIN_RPC_URL: "https://rpc.admin.test",
				CRE_SIM_BOUNTY_HUB_ADDRESS: "0x4444444444444444444444444444444444444444",
				DEMO_OPERATOR_OASIS_UPLOAD_API_URL: "https://upload.test",
			},
			REPO_ROOT,
		)

		expect(validation.ok).toBe(false)
		expect(validation.missing).toEqual(["CRE_SIM_OASIS_STORAGE_CONTRACT"])
	})

	it("reports missing base and mode-specific env variables", () => {
		const validation = validateCreSimulatorDeployEnv("evm-log", {}, REPO_ROOT)

		expect(validation.ok).toBe(false)
		expect(validation.missing).toEqual([
			"CRE_SIM_PRIVATE_KEY",
			"CRE_SIM_TENDERLY_API_KEY",
			"CRE_SIM_SEPOLIA_RPC_URL",
			"CRE_SIM_ADMIN_RPC_URL",
			"CRE_SIM_BOUNTY_HUB_ADDRESS",
			"CRE_SIM_OASIS_STORAGE_CONTRACT",
			"CRE_SIM_WS_RPC_URL",
		])
	})

	it("returns a non-zero result and missing env list for http mode", () => {
		const result = runCreSimulatorDeployPreflight(["--mode", "http"], {}, REPO_ROOT)

		expect(result.exitCode).toBe(1)
		expect(result.payload.ok).toBe(false)
		expect(result.payload.mode).toBe("http")
		expect(result.payload.missing).toContain("CRE_SIM_SEPOLIA_RPC_URL")
	})

	it("returns evm-log specific requirements in listener mode", () => {
		const result = runCreSimulatorDeployPreflight(
			["--mode", "evm-log"],
			{
				CRE_SIM_PRIVATE_KEY: "x",
				CRE_SIM_TENDERLY_API_KEY: "x",
				CRE_SIM_SEPOLIA_RPC_URL: "https://rpc.public.test",
				CRE_SIM_ADMIN_RPC_URL: "https://rpc.admin.test",
				CRE_SIM_BOUNTY_HUB_ADDRESS: "0x4444444444444444444444444444444444444444",
				CRE_SIM_OASIS_STORAGE_CONTRACT: "x",
			},
			REPO_ROOT,
		)

		expect(result.exitCode).toBe(1)
		expect(result.payload.missing).toEqual(["CRE_SIM_WS_RPC_URL"])
	})

	it("returns zero and the required env set for a valid cron deploy", () => {
		const result = runCreSimulatorDeployPreflight(
			["--mode", "cron"],
			{
				CRE_SIM_PRIVATE_KEY: "x",
				CRE_SIM_TENDERLY_API_KEY: "x",
				CRE_SIM_SEPOLIA_RPC_URL: "https://rpc.public.test",
				CRE_SIM_ADMIN_RPC_URL: "https://rpc.admin.test",
				CRE_SIM_BOUNTY_HUB_ADDRESS: "0x4444444444444444444444444444444444444444",
				CRE_SIM_OASIS_STORAGE_CONTRACT: "x",
			},
			REPO_ROOT,
		)

		expect(result.exitCode).toBe(0)
		expect(result.payload.ok).toBe(true)
		expect(result.payload.mode).toBe("cron")
		expect(result.payload.required).toEqual(getCreSimulatorModeRequiredEnv("cron"))
	})

	it("requires flat envs instead of runtime-config fallback for evm-log", () => {
		const result = runCreSimulatorDeployPreflight(
			["--mode", "evm-log"],
			{
				CRE_SIM_PRIVATE_KEY: "x",
				CRE_SIM_TENDERLY_API_KEY: "x",
				CRE_SIM_SEPOLIA_RPC_URL: "https://rpc.public.test",
				CRE_SIM_BOUNTY_HUB_ADDRESS: "0x4444444444444444444444444444444444444444",
				CRE_SIM_OASIS_STORAGE_CONTRACT: "x",
			},
			REPO_ROOT,
		)

		expect(result.exitCode).toBe(1)
		expect(result.payload.ok).toBe(false)
		expect(result.payload.missing).toEqual([
			"CRE_SIM_ADMIN_RPC_URL",
			"CRE_SIM_WS_RPC_URL",
		])
	})

	it("checks in the Railway env template and service templates", () => {
		const envTemplatePath = resolve(
			REPO_ROOT,
			"backend/cre-simulator/.env.example",
		)
		const railwayReadmePath = resolve(
			REPO_ROOT,
			"backend/cre-simulator/railway/README.md",
		)
		const httpServicePath = resolve(
			REPO_ROOT,
			"backend/cre-simulator/railway/http-service.json",
		)
		const cronServicePath = resolve(
			REPO_ROOT,
			"backend/cre-simulator/railway/cron-service.json",
		)
		const evmLogServicePath = resolve(
			REPO_ROOT,
			"backend/cre-simulator/railway/evm-log-service.json",
		)

		expect(existsSync(envTemplatePath)).toBe(true)
		expect(existsSync(resolve(REPO_ROOT, "backend/cre-simulator/.runtime.example.json"))).toBe(false)
		expect(existsSync(railwayReadmePath)).toBe(true)
		expect(existsSync(httpServicePath)).toBe(true)
		expect(existsSync(cronServicePath)).toBe(true)
		expect(existsSync(evmLogServicePath)).toBe(true)

		expect(readFileSync(railwayReadmePath, "utf8")).toContain("bun run start:http")
		expect(readFileSync(railwayReadmePath, "utf8")).toContain("bun run start:cron")
		expect(readFileSync(railwayReadmePath, "utf8")).toContain("bun run start:evm-log")
		expect(readFileSync(railwayReadmePath, "utf8")).toContain("bun run preflight:http")
		expect(readFileSync(railwayReadmePath, "utf8")).toContain("bun run preflight:cron")
		expect(readFileSync(railwayReadmePath, "utf8")).toContain("bun run preflight:evm-log")
		expect(readFileSync(railwayReadmePath, "utf8")).toContain("CRE_SIM_ADMIN_RPC_URL")
		expect(readFileSync(railwayReadmePath, "utf8")).toContain("CRE_SIM_WS_RPC_URL")
		expect(readFileSync(envTemplatePath, "utf8")).not.toContain("CRE_SIM_RUNTIME_CONFIG_JSON")
	})

	it("documents smoke tests and writable state paths in the Railway runbook", () => {
		const railwayReadmePath = resolve(
			REPO_ROOT,
			"backend/cre-simulator/railway/README.md",
		)
		const readme = readFileSync(railwayReadmePath, "utf8")

		expect(readme).toContain("curl -sS http://127.0.0.1:8787/health")
		expect(readme).toContain(
			'curl -sS -X POST http://127.0.0.1:8787/api/cre-simulator/triggers/manual-reveal',
		)
		expect(readme).toContain('curl -sS -X POST http://127.0.0.1:8787/api/cre-simulator/triggers/manual-verify')
		expect(readme).toContain("bun run start:cron -- --once")
		expect(readme).toContain("CRE_SIM_WS_RPC_URL")
		expect(readme).not.toContain("CRE_SIM_RUNTIME_CONFIG_JSON")
		expect(readme).not.toContain("CRE_SIM_RUNTIME_CONFIG_PATH")
		expect(readme).toContain("backend/cre-simulator/.trigger-state.json")
		expect(readme).toContain(".sisyphus/evidence/live-verify")
		expect(readme).toContain("workflow/verify-poc/.verify-poc-idempotency-store.json")
		expect(readme).toContain("workflow/auto-reveal-relayer/.auto-reveal-cursor.json")
	})
})
