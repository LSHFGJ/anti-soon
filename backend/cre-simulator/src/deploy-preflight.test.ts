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
		])
	})

	it("adds ws rpc requirement for evm-log mode", () => {
		expect(getCreSimulatorModeRequiredEnv("evm-log")).toContain(
			"DEMO_OPERATOR_WS_RPC_URL",
		)
	})

	it("accepts direct Sapphire write mode when storage contract is configured", () => {
		const validation = validateCreSimulatorDeployEnv("http", {
			CRE_ETH_PRIVATE_KEY: "x",
			DEMO_AUDITOR_ADDRESS: "x",
			DEMO_AUDITOR_PRIVATE_KEY: "x",
			DEMO_OPERATOR_ADDRESS: "x",
			DEMO_OPERATOR_ADMIN_RPC_URL: "x",
			DEMO_OPERATOR_PRIVATE_KEY: "x",
			DEMO_OPERATOR_PUBLIC_RPC_URL: "x",
			DEMO_PROJECT_OWNER_ADDRESS: "x",
			DEMO_PROJECT_OWNER_PRIVATE_KEY: "x",
			TENDERLY_API_KEY: "x",
			VITE_OASIS_STORAGE_CONTRACT: "x",
		})

		expect(validation.ok).toBe(true)
		expect(validation.missing).toEqual([])
	})

	it("accepts upload api mode when deploy upload api url is configured", () => {
		const validation = validateCreSimulatorDeployEnv("cron", {
			CRE_ETH_PRIVATE_KEY: "x",
			DEMO_AUDITOR_ADDRESS: "x",
			DEMO_AUDITOR_PRIVATE_KEY: "x",
			DEMO_OPERATOR_ADDRESS: "x",
			DEMO_OPERATOR_ADMIN_RPC_URL: "x",
			DEMO_OPERATOR_PRIVATE_KEY: "x",
			DEMO_OPERATOR_PUBLIC_RPC_URL: "x",
			DEMO_PROJECT_OWNER_ADDRESS: "x",
			DEMO_PROJECT_OWNER_PRIVATE_KEY: "x",
			TENDERLY_API_KEY: "x",
			DEMO_OPERATOR_OASIS_UPLOAD_API_URL: "https://upload.test",
		})

		expect(validation.ok).toBe(true)
		expect(validation.missing).toEqual([])
	})

	it("reports missing base and mode-specific env variables", () => {
		const validation = validateCreSimulatorDeployEnv("evm-log", {})

		expect(validation.ok).toBe(false)
		expect(validation.missing).toEqual([
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
			"DEMO_OPERATOR_WS_RPC_URL",
			"OASIS_UPLOAD_MODE",
		])
	})

	it("returns a non-zero result and missing env list for http mode", () => {
		const result = runCreSimulatorDeployPreflight(["--mode", "http"], {})

		expect(result.exitCode).toBe(1)
		expect(result.payload.ok).toBe(false)
		expect(result.payload.mode).toBe("http")
		expect(result.payload.missing).toContain("DEMO_OPERATOR_PUBLIC_RPC_URL")
	})

	it("returns evm-log specific requirements in listener mode", () => {
		const result = runCreSimulatorDeployPreflight(["--mode", "evm-log"], {
			CRE_ETH_PRIVATE_KEY: "x",
			DEMO_AUDITOR_ADDRESS: "x",
			DEMO_AUDITOR_PRIVATE_KEY: "x",
			DEMO_OPERATOR_ADDRESS: "x",
			DEMO_OPERATOR_ADMIN_RPC_URL: "x",
			DEMO_OPERATOR_PRIVATE_KEY: "x",
			DEMO_OPERATOR_PUBLIC_RPC_URL: "x",
			DEMO_PROJECT_OWNER_ADDRESS: "x",
			DEMO_PROJECT_OWNER_PRIVATE_KEY: "x",
			TENDERLY_API_KEY: "x",
			VITE_OASIS_STORAGE_CONTRACT: "x",
		})

		expect(result.exitCode).toBe(1)
		expect(result.payload.missing).toEqual(["DEMO_OPERATOR_WS_RPC_URL"])
	})

	it("returns zero and the required env set for a valid cron deploy", () => {
		const result = runCreSimulatorDeployPreflight(["--mode", "cron"], {
			CRE_ETH_PRIVATE_KEY: "x",
			DEMO_AUDITOR_ADDRESS: "x",
			DEMO_AUDITOR_PRIVATE_KEY: "x",
			DEMO_OPERATOR_ADDRESS: "x",
			DEMO_OPERATOR_ADMIN_RPC_URL: "x",
			DEMO_OPERATOR_PRIVATE_KEY: "x",
			DEMO_OPERATOR_PUBLIC_RPC_URL: "x",
			DEMO_PROJECT_OWNER_ADDRESS: "x",
			DEMO_PROJECT_OWNER_PRIVATE_KEY: "x",
			TENDERLY_API_KEY: "x",
			DEMO_OPERATOR_OASIS_UPLOAD_API_URL: "https://upload.test",
		})

		expect(result.exitCode).toBe(0)
		expect(result.payload.ok).toBe(true)
		expect(result.payload.mode).toBe("cron")
		expect(result.payload.required).toEqual(getCreSimulatorModeRequiredEnv("cron"))
	})

	it("checks in the Railway env template and service templates", () => {
		const envTemplatePath = resolve(
			REPO_ROOT,
			"backend/cre-simulator/.env.railway.example",
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
	})

	it("documents smoke tests and writable state paths in the Railway runbook", () => {
		const railwayReadmePath = resolve(
			REPO_ROOT,
			"backend/cre-simulator/railway/README.md",
		)
		const readme = readFileSync(railwayReadmePath, "utf8")

		expect(readme).toContain("curl -sS http://127.0.0.1:8787/health")
		expect(readme).toContain(
			'curl -sS -X POST http://127.0.0.1:8787/api/cre-simulator/triggers/manual-run',
		)
		expect(readme).toContain("bun run start:cron -- --once")
		expect(readme).toContain("DEMO_OPERATOR_WS_RPC_URL")
		expect(readme).toContain("backend/cre-simulator/.demo-operator-state.json")
		expect(readme).toContain("backend/cre-simulator/.trigger-state.json")
		expect(readme).toContain("workflow/auto-reveal-relayer/.auto-reveal-cursor.json")
	})
})
