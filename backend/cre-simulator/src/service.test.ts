import { describe, expect, it } from "bun:test"
import { existsSync } from "node:fs"
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

describe("cre-simulator service", () => {
	it("defaults to the checked-in async demo scenario path", () => {
		expect(buildDefaultCreSimulatorScenarioPath(REPO_ROOT)).toBe(
			join(REPO_ROOT, "demo-data/operator/multi-fast-happy-path.json"),
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
						join(REPO_ROOT, "demo-data/operator/multi-fast-happy-path.json"),
					)
					return { command: "status", healthy: true }
				},
			},
		)

		expect(result).toEqual({
			command: "status",
			scenarioPath: join(REPO_ROOT, "demo-data/operator/multi-fast-happy-path.json"),
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
			scenarioPath: join(REPO_ROOT, "demo-data/operator/multi-fast-happy-path.json"),
			result: { command: "run", stages: { register: { projectId: "77" } } },
		})
	})

	it("dispatches configured manual triggers through the shared backend service", async () => {
		const result = await executeCreSimulatorTrigger(
			{
				triggerName: "manual-run",
				repoRoot: REPO_ROOT,
				configPath: join(REPO_ROOT, "backend/cre-simulator/triggers.json"),
			},
			{},
			{
				executeCommand: async (request) => {
					expect(request.command).toBe("run")
					return {
						command: "run",
						scenarioPath: join(REPO_ROOT, "demo-data/operator/multi-fast-happy-path.json"),
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

	it("builds trigger status through the shared backend service layer", async () => {
		const result = await getCreSimulatorTriggerStatus(
			{
				repoRoot: REPO_ROOT,
				configPath: join(REPO_ROOT, "backend/cre-simulator/triggers.json"),
			},
			{},
		)

		expect(result).toMatchObject({
			healthy: true,
			configPath: join(REPO_ROOT, "backend/cre-simulator/triggers.json"),
			httpTriggers: {
				0: { triggerName: "manual-run", command: "run" },
			},
			cronTriggers: {
				0: { triggerName: "demo-run", command: "run" },
			},
			evmLogTriggers: {
				0: { triggerName: "poc-revealed", command: "verify" },
			},
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
			join(REPO_ROOT, "demo-data/operator/multi-fast-happy-path.json"),
		).json()) as { stateFilePath: string }

		expect(scenario.stateFilePath).toBe(
			"backend/cre-simulator/.demo-operator-state.json",
		)
	})
})
