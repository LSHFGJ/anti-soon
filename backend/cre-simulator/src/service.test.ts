import { describe, expect, it } from "bun:test"
import { existsSync, rmSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"

import {
	buildDefaultCreSimulatorScenarioPath,
	buildDefaultCreSimulatorTriggerConfigPath,
	executeCreSimulatorCommand,
	executeCreSimulatorTrigger,
	getCreSimulatorTriggerStatus,
} from "./service"

const REPO_ROOT = resolve(import.meta.dir, "../../..")
const LEGACY_DEMO_OPERATOR_PATH = join(REPO_ROOT, "workflow", "demo-operator")
const LEGACY_PATH_FRAGMENT = ["workflow", "demo-operator"].join("/")

function withTempTriggerConfig(
	run: (configPath: string) => Promise<void> | void,
): Promise<void> {
	const configPath = join(
		REPO_ROOT,
		"backend/cre-simulator/.service-trigger-config.test.json",
	)
	const stateFilePath = "backend/cre-simulator/.service-trigger-state.test.json"
	writeFileSync(
		configPath,
		`${JSON.stringify(
			{
				schemaVersion: "anti-soon.cre-simulator.trigger-config.v1",
				stateFilePath,
				httpTriggers: {
					"manual-run": { command: "run" },
					"manual-verify": { command: "verify" },
				},
				cronTriggers: {
					"demo-run": { intervalMs: 60000, command: "run" },
				},
				evmLogTriggers: {
					"poc-revealed": {
						command: "verify",
						wsRpcUrlEnvVar: "DEMO_OPERATOR_WS_RPC_URL",
						contractAddress: "0x17797b473864806072186f6997801d4473aaf6e8",
						topic0:
							"0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
					},
				},
			},
			null,
			2,
		)}\n`,
		"utf8",
	)

	return Promise.resolve()
		.then(() => run(configPath))
		.finally(() => {
			rmSync(configPath, { force: true })
			rmSync(join(REPO_ROOT, stateFilePath), { force: true })
		})
}

describe("cre-simulator service", () => {
	it("defaults to the checked-in async demo scenario path", () => {
		expect(buildDefaultCreSimulatorScenarioPath(REPO_ROOT)).toBe(
			join(REPO_ROOT, "backend/cre-simulator/default-scenario.json"),
		)
	})

	it("defaults to the checked-in backend trigger config path", () => {
		expect(buildDefaultCreSimulatorTriggerConfigPath(REPO_ROOT)).toBe(
			join(REPO_ROOT, "backend/cre-simulator/triggers.json"),
		)
	})

	it("delegates command execution to the shared demo-operator service", async () => {
		const result = await executeCreSimulatorCommand(
			{
				command: "status",
				repoRoot: REPO_ROOT,
			},
			{},
			{
				executeDemoOperator: async ({ request }) => {
					expect(request.command).toBe("status")
					expect(request.scenario).toBe(
						join(REPO_ROOT, "backend/cre-simulator/default-scenario.json"),
					)
					return { command: "status", healthy: true }
				},
			},
		)

		expect(result).toEqual({
			command: "status",
			scenarioPath: join(REPO_ROOT, "backend/cre-simulator/default-scenario.json"),
			result: { command: "status", healthy: true },
		})
	})

	it("accepts run as a backend command and delegates it like other commands", async () => {
		const result = await executeCreSimulatorCommand(
			{
				command: "run",
				repoRoot: REPO_ROOT,
			},
			{},
			{
				executeDemoOperator: async ({ request }) => {
					expect(request.command).toBe("run")
					return { command: "run", stages: { register: { projectId: "77" } } }
				},
			},
		)

		expect(result).toEqual({
			command: "run",
			scenarioPath: join(REPO_ROOT, "backend/cre-simulator/default-scenario.json"),
			result: { command: "run", stages: { register: { projectId: "77" } } },
		})
	})

	it("dispatches configured manual triggers through the shared backend service", async () => {
		await withTempTriggerConfig(async (configPath) => {
			const result = await executeCreSimulatorTrigger(
				{
					triggerName: "manual-run",
					repoRoot: REPO_ROOT,
					configPath,
				},
				{},
				{
					executeCommand: async (request) => {
						expect(request.command).toBe("run")
						return {
							command: "run",
							scenarioPath: join(REPO_ROOT, "backend/cre-simulator/default-scenario.json"),
							result: { command: "run", stages: { register: { projectId: "77" } } },
						}
					},
				},
			)

			expect(result).toMatchObject({
				triggerType: "http",
				triggerName: "manual-run",
				command: "run",
			})
		})
	})

	it("builds trigger status through the shared backend service layer", async () => {
		await withTempTriggerConfig(async (configPath) => {
			const result = await getCreSimulatorTriggerStatus(
				{
					repoRoot: REPO_ROOT,
					configPath,
				},
				{},
			)

			expect(result).toMatchObject({
				healthy: true,
				configPath,
				httpTriggers: {
					0: { triggerName: "manual-run", command: "run" },
					1: { triggerName: "manual-verify", command: "verify" },
				},
				cronTriggers: {
					0: { triggerName: "demo-run", command: "run" },
				},
				evmLogTriggers: {
					0: { triggerName: "poc-revealed", command: "verify" },
				},
			})
		})
	})

	it("rejects override paths that escape the repo root", async () => {
		await expect(
			executeCreSimulatorCommand(
				{
					command: "status",
					repoRoot: REPO_ROOT,
					scenarioPath: "/tmp/outside.json",
				},
				{},
			),
		).rejects.toThrow("scenarioPath must stay within repoRoot")
	})

	it("owns the operator core under backend instead of importing workflow internals", async () => {
		expect(
			existsSync(join(REPO_ROOT, "backend/cre-simulator/src/operator/service.ts")),
		).toBe(true)

		const serviceSource = await Bun.file(
			join(REPO_ROOT, "backend/cre-simulator/src/service.ts"),
		).text()
		const typesSource = await Bun.file(
			join(REPO_ROOT, "backend/cre-simulator/src/types.ts"),
		).text()

		expect(serviceSource).not.toContain(LEGACY_PATH_FRAGMENT)
		expect(typesSource).not.toContain(LEGACY_PATH_FRAGMENT)
	})

	it("removes the legacy workflow demo-operator path from checked-in defaults", async () => {
		expect(existsSync(LEGACY_DEMO_OPERATOR_PATH)).toBe(false)

		const scenario = (await Bun.file(
			join(REPO_ROOT, "backend/cre-simulator/default-scenario.json"),
		).json()) as { stateFilePath: string }

		expect(scenario.stateFilePath).toBe(
			"backend/cre-simulator/.demo-operator-state.json",
		)
	})
})
