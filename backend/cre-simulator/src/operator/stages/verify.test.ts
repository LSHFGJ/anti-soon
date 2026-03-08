import { describe, expect, it } from "bun:test"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

import { runDemoOperatorCommand } from "../../operator-cli"
import type { DemoOperatorConfig, EnvRecord } from "../config"
import {
	BOUNTY_HUB_SUBMISSION_STATUS,
	type BountyHubSubmission,
	type HexString,
	type TerminalPayoutEvidence,
} from "../bountyHubClient"
import { loadScenarioFromFile } from "../scenario"
import { DEMO_OPERATOR_STATE_STORE_SCHEMA_VERSION } from "../stateStore"
import {
	runVerifyStage,
	type VerifyStageResult,
} from "./verify"

const REAL_REPO_ROOT = resolve(import.meta.dir, "../../../../..")
const REAL_SCENARIO_PATH = resolve(
	REAL_REPO_ROOT,
	"demo-data/operator/multi-fast-happy-path.json",
)
const AUDITOR_ADDRESS =
	"0x5555555555555555555555555555555555555555" as const
const REVEAL_TX_HASH =
	"0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const
const PAYOUT_TX_HASH =
	"0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as const
const FINALIZED_TX_HASH =
	"0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc" as const
const COMMIT_TX_HASH =
	"0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd" as const
const OASIS_TX_HASH =
	"0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" as const

function withTempDir(run: (tempDir: string) => Promise<void> | void): Promise<void> {
	const tempDir = mkdtempSync(join(tmpdir(), "demo-operator-verify-"))

	return Promise.resolve()
		.then(() => run(tempDir))
		.finally(() => {
			rmSync(tempDir, { recursive: true, force: true })
		})
}

function buildConfig(tempDir: string): DemoOperatorConfig {
	return {
		command: "verify",
		repoRoot: REAL_REPO_ROOT,
		cwd: join(REAL_REPO_ROOT, "backend/cre-simulator"),
		scenarioPath: REAL_SCENARIO_PATH,
		stateFilePath: join(tempDir, ".demo-operator-state.json"),
		evidenceDir: join(tempDir, "evidence"),
		scenario: loadScenarioFromFile(REAL_SCENARIO_PATH, {
			repoRoot: REAL_REPO_ROOT,
		}),
	}
}

function buildEnv(): EnvRecord {
	return {
		DEMO_OPERATOR_PUBLIC_RPC_URL: "https://rpc.public.test",
		DEMO_AUDITOR_ADDRESS: AUDITOR_ADDRESS,
		CRE_ETH_PRIVATE_KEY:
			"0x9999999999999999999999999999999999999999999999999999999999999999",
	}
}

function buildRegisterStageData(projectId: string): Record<string, unknown> {
	return {
		projectId,
		registrationTxHash:
			"0x1111111111111111111111111111111111111111111111111111111111111111",
		registrationEventIndex: 0,
		simulateCommand: ["cre", "workflow", "simulate"],
		vnetStatus: 2,
		vnetRpcUrl: "https://rpc.tenderly.co/vnet/77",
	}
}

function buildSubmitStageData(submissionId: string): Record<string, unknown> {
	return {
		submissionId,
		commitTxHash: COMMIT_TX_HASH,
		commitHash:
			"0x2222222222222222222222222222222222222222222222222222222222222222",
		cipherURI:
			"oasis://oasis-sapphire-testnet/0x000000000000000000000000000000000000dead/slot-fixed#0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		salt:
			"0x3333333333333333333333333333333333333333333333333333333333333333",
		oasisTxHash: OASIS_TX_HASH,
	}
}

function buildRevealStageData(submissionId: string): Record<string, unknown> {
	return {
		submissionId,
		revealTxHash: REVEAL_TX_HASH,
		revealEventIndex: 7,
	}
}

function buildFinalizedSubmission(): BountyHubSubmission {
	return {
		auditor: AUDITOR_ADDRESS,
		projectId: 77n,
		commitHash:
			"0x2222222222222222222222222222222222222222222222222222222222222222",
		cipherURI:
			"oasis://oasis-sapphire-testnet/0x000000000000000000000000000000000000dead/slot-fixed#0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		salt:
			"0x3333333333333333333333333333333333333333333333333333333333333333",
		commitTimestamp: 1_700_000_100n,
		revealTimestamp: 1_700_000_400n,
		status: BOUNTY_HUB_SUBMISSION_STATUS.Finalized,
		drainAmountWei: 900_000_000_000_000_000n,
		severity: 3,
		payoutAmount: 600_000_000_000_000_000n,
		disputeDeadline: 0n,
		challenged: false,
		challenger: "0x0000000000000000000000000000000000000000",
		challengeBond: 0n,
	}
}

function buildTerminalPayoutEvidence(submissionId: string): TerminalPayoutEvidence {
	return {
		submissionId: BigInt(submissionId),
		auditor: AUDITOR_ADDRESS,
		payoutAmount: 600_000_000_000_000_000n,
		payoutTxHash: PAYOUT_TX_HASH,
		payoutEventIndex: 8,
		finalizedTxHash: FINALIZED_TX_HASH,
		finalizedEventIndex: 9,
	}
}

function encodeRpcWord(value: bigint): string {
	return value.toString(16).padStart(64, "0")
}

function encodeRpcBool(value: boolean): string {
	return encodeRpcWord(value ? 1n : 0n)
}

function encodeRpcAddress(value: string): string {
	return value.toLowerCase().replace(/^0x/, "").padStart(64, "0")
}

function encodeRpcResult(words: string[]): string {
	return `0x${words.join("")}`
}

function encodeRpcTopicUint(value: bigint): HexString {
	return `0x${encodeRpcWord(value)}` as HexString
}

function writeStateFile(
	config: DemoOperatorConfig,
	options: {
		register?: Record<string, unknown>
		submit?: Record<string, unknown>
		reveal?: Record<string, unknown>
		verify?: Record<string, unknown>
		verifyStatus?: "pending" | "completed"
	} = {},
): void {
	writeFileSync(
		config.stateFilePath,
		`${JSON.stringify(
			{
				schemaVersion: DEMO_OPERATOR_STATE_STORE_SCHEMA_VERSION,
				binding: {
					scenarioId: config.scenario.scenarioId,
					scenarioPath: config.scenarioPath,
					evidenceDir: config.evidenceDir,
				},
				stageStateByName: {
					register: {
						status: options.register ? "completed" : "pending",
						updatedAtMs: 1,
					},
					submit: {
						status: options.submit ? "completed" : "pending",
						updatedAtMs: 1,
					},
					reveal: {
						status: options.reveal ? "completed" : "pending",
						updatedAtMs: 1,
					},
					verify: {
						status: options.verifyStatus ?? "pending",
						updatedAtMs: 1,
					},
				},
				...(options.register || options.submit || options.reveal || options.verify
					? {
							stageData: {
								...(options.register ? { register: options.register } : {}),
								...(options.submit ? { submit: options.submit } : {}),
								...(options.reveal ? { reveal: options.reveal } : {}),
								...(options.verify ? { verify: options.verify } : {}),
							},
						}
					: {}),
			},
			null,
			2,
		)}\n`,
		"utf8",
	)
}

function readStateFile(config: DemoOperatorConfig): Record<string, unknown> {
	return JSON.parse(readFileSync(config.stateFilePath, "utf8")) as Record<string, unknown>
}

describe("runDemoOperatorCommand verify", () => {
	it("delegates verify to the real stage instead of returning the scaffold error", async () => {
		await withTempDir(async (tempDir) => {
			const stateFilePath = join(tempDir, ".demo-operator-state.json")
			const evidenceDir = join(tempDir, "evidence")
			const stdout: string[] = []
			const stderr: string[] = []
			const verifyCalls: unknown[] = []

			const exitCode = await (
				runDemoOperatorCommand as unknown as (
					argv: string[],
					env: Record<string, string | undefined>,
					io: { stdout: (line: string) => void; stderr: (line: string) => void },
					deps: {
						verify: {
							runVerify: (args: { config: { command: string; scenarioPath: string } }) => Promise<unknown>
						}
					},
				) => Promise<number>
			)(
				[
					"verify",
					"--scenario",
					REAL_SCENARIO_PATH,
					"--state-file",
					stateFilePath,
					"--evidence-dir",
					evidenceDir,
				],
				{},
				{
					stdout: (line) => stdout.push(line),
					stderr: (line) => stderr.push(line),
				},
				{
					verify: {
						runVerify: async (args) => {
							verifyCalls.push(args)
							return {
								submissionId: "12",
								simulateCommand: ["cre", "workflow", "simulate"],
								outputPath: join(evidenceDir, "output.txt"),
								resultPath: join(evidenceDir, "verify-result.json"),
								terminalSubmission: {
									status: "Finalized",
									payoutAmount: "1",
								},
								payoutEvidence: {
									payoutTxHash: PAYOUT_TX_HASH,
									payoutEventIndex: 8,
									finalizedTxHash: FINALIZED_TX_HASH,
									finalizedEventIndex: 9,
									payoutAmount: "1",
								},
								auditorStats: {
									paidCount: "1",
									totalPaidWei: "1",
								},
							}
						},
					},
				},
			)

			expect(exitCode).toBe(0)
			expect(verifyCalls).toHaveLength(1)
			expect(stdout).toEqual([
				JSON.stringify(
					{
						submissionId: "12",
						simulateCommand: ["cre", "workflow", "simulate"],
						outputPath: join(evidenceDir, "output.txt"),
						resultPath: join(evidenceDir, "verify-result.json"),
						terminalSubmission: {
							status: "Finalized",
							payoutAmount: "1",
						},
						payoutEvidence: {
							payoutTxHash: PAYOUT_TX_HASH,
							payoutEventIndex: 8,
							finalizedTxHash: FINALIZED_TX_HASH,
							finalizedEventIndex: 9,
							payoutAmount: "1",
						},
						auditorStats: {
							paidCount: "1",
							totalPaidWei: "1",
						},
					},
					null,
					2,
				),
			])
			expect(stderr).toEqual([])
		})
	})
})

describe("runVerifyStage", () => {
	it("runs verify-poc simulate from persisted reveal coordinates and persists terminal payout evidence", async () => {
		await withTempDir(async (tempDir) => {
			const config = buildConfig(tempDir)
			writeStateFile(config, {
				register: buildRegisterStageData("77"),
				submit: buildSubmitStageData("12"),
				reveal: buildRevealStageData("12"),
			})

			const commandCalls: Array<{ command: string; args: string[]; env: EnvRecord }> = []
			const submission = buildFinalizedSubmission()
			const payoutEvidence = buildTerminalPayoutEvidence("12")

			const result = await runVerifyStage({
				config,
				env: buildEnv(),
				deps: {
					createClient: async () => ({
						readSubmission: async (submissionId) => {
							expect(submissionId).toBe(12n)
							return submission
						},
						readAuditorStats: async (auditor) => {
							expect(auditor).toBe(AUDITOR_ADDRESS)
							return {
								paidCount: 1n,
								totalPaidWei: 600_000_000_000_000_000n,
							}
						},
						readTerminalPayoutEvidence: async (input) => {
							expect(input).toEqual({
								submissionId: 12n,
								auditor: AUDITOR_ADDRESS,
								auditorStats: {
									paidCount: 1n,
									totalPaidWei: 600_000_000_000_000_000n,
								},
							})
							return payoutEvidence
						},
					}),
					runCommand: async (spec) => {
						commandCalls.push({
							command: spec.command,
							args: spec.args,
							env: spec.env,
						})
						return {
							exitCode: 0,
							stdout: "REPORT_WRITTEN\n",
							stderr: "",
						}
					},
				},
			})

			expect(commandCalls).toEqual([
				{
					command: "cre",
					args: [
						"workflow",
						"simulate",
						"workflow/verify-poc",
						"--target",
						"staging-settings",
						"--non-interactive",
						"--trigger-index",
						"0",
						"--evm-tx-hash",
						REVEAL_TX_HASH,
						"--evm-event-index",
						"7",
						"--broadcast",
					],
					env: {
						VERIFY_POC_IDEMPOTENCY_STORE_PATH: join(
							config.evidenceDir,
							"verify-poc-idempotency-store.json",
						),
					},
				},
			])

			expect(result).toEqual({
				submissionId: "12",
				simulateCommand: [
					"cre",
					"workflow",
					"simulate",
					"workflow/verify-poc",
					"--target",
					"staging-settings",
					"--non-interactive",
					"--trigger-index",
					"0",
					"--evm-tx-hash",
					REVEAL_TX_HASH,
					"--evm-event-index",
					"7",
					"--broadcast",
				],
				outputPath: join(config.evidenceDir, "output.txt"),
				resultPath: join(config.evidenceDir, "verify-result.json"),
				terminalSubmission: {
					auditor: AUDITOR_ADDRESS,
					status: "Finalized",
					drainAmountWei: "900000000000000000",
					severity: 3,
					payoutAmount: "600000000000000000",
				},
				payoutEvidence: {
					payoutTxHash: PAYOUT_TX_HASH,
					payoutEventIndex: 8,
					finalizedTxHash: FINALIZED_TX_HASH,
					finalizedEventIndex: 9,
					payoutAmount: "600000000000000000",
				},
				auditorStats: {
					paidCount: "1",
					totalPaidWei: "600000000000000000",
				},
			} satisfies VerifyStageResult)

			const persisted = readStateFile(config)
			expect((persisted.stageStateByName as Record<string, { status: string }>).verify.status).toBe(
				"completed",
			)
			expect(((persisted.stageData as Record<string, unknown>).verify) as VerifyStageResult).toEqual(
				result,
			)

			expect(readFileSync(join(config.evidenceDir, "output.txt"), "utf8")).toContain(
				"REPORT_WRITTEN",
			)
			expect(
				JSON.parse(readFileSync(join(config.evidenceDir, "verify-result.json"), "utf8")) as VerifyStageResult,
			).toEqual(result)
		})
	})

	it("uses the default RPC-backed verify client without importing viem", async () => {
		await withTempDir(async (tempDir) => {
			const config = buildConfig(tempDir)
			writeStateFile(config, {
				register: buildRegisterStageData("77"),
				submit: buildSubmitStageData("12"),
				reveal: buildRevealStageData("12"),
			})

			const originalFetch = globalThis.fetch
			const fetchCalls: Array<{ method: string; params: unknown[] }> = []
			globalThis.fetch = (async (_input, init) => {
				const payload = JSON.parse(String(init?.body ?? "{}")) as {
					method: string
					params?: unknown[]
					id: number
				}
				fetchCalls.push({
					method: payload.method,
					params: payload.params ?? [],
				})

				if (payload.method === "eth_call") {
					return new Response(
						JSON.stringify({
							jsonrpc: "2.0",
							id: payload.id,
							result: encodeRpcResult([
								encodeRpcWord(1n),
								encodeRpcWord(0n),
								encodeRpcWord(0n),
								encodeRpcWord(1n),
								encodeRpcWord(0n),
								encodeRpcWord(0n),
								encodeRpcWord(600_000_000_000_000_000n),
								encodeRpcWord(0n),
							]),
						}),
					)
				}

				if (payload.method === "eth_getLogs") {
					const [filter] = payload.params ?? []
					const topic0 = String((filter as { topics?: string[] }).topics?.[0] ?? "")

					if (
						topic0
						=== "0x8ca29c5b8c9a03411724f63ee4afcc6aa2da39768f4034ad1bbc92dea35b7d21"
					) {
						return new Response(
							JSON.stringify({
								jsonrpc: "2.0",
								id: payload.id,
								result: [
									{
										address: "0x17797b473864806072186f6997801d4473aaf6e8",
										blockNumber: "0x10",
										logIndex: "0x02",
										transactionHash:
											"0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
										topics: [
											topic0,
											encodeRpcTopicUint(12n),
										],
										data: encodeRpcResult([
											encodeRpcBool(true),
											encodeRpcWord(900_000_000_000_000_000n),
											encodeRpcWord(3n),
										]),
									},
								],
							}),
						)
					}

					if (
						topic0
						=== "0x07e339a02227d9329089b11d9cdeea1af6caea87244864b70935aca91d7dc7fd"
					) {
						return new Response(
							JSON.stringify({
								jsonrpc: "2.0",
								id: payload.id,
								result: [
									{
										address: "0x17797b473864806072186f6997801d4473aaf6e8",
										blockNumber: "0x11",
										logIndex: "0x03",
										transactionHash: PAYOUT_TX_HASH,
										topics: [
											topic0,
											encodeRpcTopicUint(12n),
											`0x${encodeRpcAddress(AUDITOR_ADDRESS)}`,
										],
										data: encodeRpcResult([
											encodeRpcWord(600_000_000_000_000_000n),
										]),
									},
								],
							}),
						)
					}

					if (
						topic0
						=== "0xa971cb2445df8cf3f569d40414eebb7e4608c21404b60b6072cf1f2bd3a0dd6e"
					) {
						return new Response(
							JSON.stringify({
								jsonrpc: "2.0",
								id: payload.id,
								result: [
									{
										address: "0x17797b473864806072186f6997801d4473aaf6e8",
										blockNumber: "0x12",
										logIndex: "0x04",
										transactionHash: FINALIZED_TX_HASH,
										topics: [
											topic0,
											encodeRpcTopicUint(12n),
										],
										data: "0x",
									},
								],
							}),
						)
					}

					return new Response(
						JSON.stringify({ jsonrpc: "2.0", id: payload.id, result: [] }),
					)
				}

				throw new Error(`Unexpected RPC method: ${payload.method}`)
			}) as typeof globalThis.fetch

			try {
				const result = await runVerifyStage({
					config,
					env: buildEnv(),
					deps: {
						runCommand: async () => ({
							exitCode: 0,
							stdout: "REPORT_WRITTEN\n",
							stderr: "",
						}),
					},
				})

				expect(result.terminalSubmission).toEqual({
					auditor: AUDITOR_ADDRESS,
					status: "Finalized",
					drainAmountWei: "900000000000000000",
					severity: 3,
					payoutAmount: "600000000000000000",
				})
				expect(result.payoutEvidence).toEqual({
					payoutTxHash: PAYOUT_TX_HASH,
					payoutEventIndex: 3,
					finalizedTxHash: FINALIZED_TX_HASH,
					finalizedEventIndex: 4,
					payoutAmount: "600000000000000000",
				})
				expect(result.auditorStats).toEqual({
					paidCount: "1",
					totalPaidWei: "600000000000000000",
				})
				expect(fetchCalls.map((call) => call.method)).toEqual([
					"eth_getLogs",
					"eth_getLogs",
					"eth_getLogs",
					"eth_call",
					"eth_getLogs",
					"eth_getLogs",
				])
			} finally {
				globalThis.fetch = originalFetch
			}
		})
	})

	it("rejects missing broadcast prerequisites before simulate", async () => {
		await withTempDir(async (tempDir) => {
			const config = buildConfig(tempDir)
			writeStateFile(config, {
				register: buildRegisterStageData("77"),
				submit: buildSubmitStageData("12"),
				reveal: buildRevealStageData("12"),
			})

			let createClientCalled = false
			let runCommandCalled = false
			const env = buildEnv()
			delete env.CRE_ETH_PRIVATE_KEY

			await expect(
				runVerifyStage({
					config,
					env,
					deps: {
						createClient: async () => {
							createClientCalled = true
							throw new Error("createClient should not run")
						},
						runCommand: async () => {
							runCommandCalled = true
							return { exitCode: 0, stdout: "", stderr: "" }
						},
					},
				}),
			).rejects.toThrow(
				"Missing broadcast prerequisite: CRE_ETH_PRIVATE_KEY must be a 32-byte hex private key",
			)

			expect(createClientCalled).toBe(false)
			expect(runCommandCalled).toBe(false)

			const persisted = readStateFile(config)
			expect((persisted.stageStateByName as Record<string, { status: string }>).verify.status).toBe(
				"pending",
			)
			expect((persisted.stageData as Record<string, unknown> | undefined)?.verify).toBeUndefined()
		})
	})

	it("fails closed when verification does not reach Finalized payout state", async () => {
		await withTempDir(async (tempDir) => {
			const config = buildConfig(tempDir)
			writeStateFile(config, {
				register: buildRegisterStageData("77"),
				submit: buildSubmitStageData("12"),
				reveal: buildRevealStageData("12"),
			})

			await expect(
				runVerifyStage({
					config,
					env: buildEnv(),
					deps: {
						createClient: async () => ({
							readSubmission: async () => ({
								...buildFinalizedSubmission(),
								status: BOUNTY_HUB_SUBMISSION_STATUS.Verified,
							}),
							readAuditorStats: async () => ({
								paidCount: 0n,
								totalPaidWei: 0n,
							}),
							readTerminalPayoutEvidence: async () => {
								throw new Error("Submission 12 is not finalized on-chain")
							},
						}),
						runCommand: async () => ({
							exitCode: 0,
							stdout: "WORKFLOW_VERIFIED\n",
							stderr: "",
						}),
					},
				}),
			).rejects.toThrow("Submission 12 is not finalized on-chain")

			const persisted = readStateFile(config)
			expect((persisted.stageStateByName as Record<string, { status: string }>).verify.status).toBe(
				"quarantined",
			)
		})
	})

	it("reuses the persisted verify result on rerun instead of simulating again", async () => {
		await withTempDir(async (tempDir) => {
			const config = buildConfig(tempDir)
			const persistedVerify: VerifyStageResult = {
				submissionId: "12",
				simulateCommand: ["cre", "workflow", "simulate"],
				outputPath: join(config.evidenceDir, "output.txt"),
				resultPath: join(config.evidenceDir, "verify-result.json"),
				terminalSubmission: {
					auditor: AUDITOR_ADDRESS,
					status: "Finalized",
					drainAmountWei: "900000000000000000",
					severity: 3,
					payoutAmount: "600000000000000000",
				},
				payoutEvidence: {
					payoutTxHash: PAYOUT_TX_HASH as HexString,
					payoutEventIndex: 8,
					finalizedTxHash: FINALIZED_TX_HASH as HexString,
					finalizedEventIndex: 9,
					payoutAmount: "600000000000000000",
				},
				auditorStats: {
					paidCount: "1",
					totalPaidWei: "600000000000000000",
				},
			}

			writeStateFile(config, {
				register: buildRegisterStageData("77"),
				submit: buildSubmitStageData("12"),
				reveal: buildRevealStageData("12"),
				verify: persistedVerify,
				verifyStatus: "completed",
			})

			let createClientCallCount = 0
			let runCommandCallCount = 0

			await expect(
				runVerifyStage({
					config,
					env: buildEnv(),
					deps: {
						createClient: async () => {
							createClientCallCount += 1
							throw new Error("client should not be created on replay")
						},
						runCommand: async () => {
							runCommandCallCount += 1
							throw new Error("verify simulate should not rerun on replay")
						},
					},
				}),
			).resolves.toEqual(persistedVerify)

			expect(createClientCallCount).toBe(0)
			expect(runCommandCallCount).toBe(0)
		})
	})
})
