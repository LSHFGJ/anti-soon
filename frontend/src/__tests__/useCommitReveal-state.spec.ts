import { act, renderHook, waitFor } from "@testing-library/react";
import { keccak256, toBytes } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUseWallet = vi.fn();
const mockGenerateRandomSalt = vi.fn();
const mockComputeCommitHash = vi.fn();
const mockUploadEncryptedPoC = vi.fn();

vi.mock("../hooks/useWallet", () => ({
	useWallet: () => mockUseWallet(),
}));

vi.mock("../utils/encryption", () => ({
	generateRandomSalt: () => mockGenerateRandomSalt(),
	computeCommitHash: (...args: unknown[]) => mockComputeCommitHash(...args),
}));

vi.mock("../lib/oasisUpload", () => ({
	uploadEncryptedPoC: (...args: unknown[]) => mockUploadEncryptedPoC(...args),
}));

import {
	SUBMISSION_LIFECYCLE_PHASES,
	useCommitReveal,
} from "../hooks/useCommitReveal";
import { SUBMISSION_LIFECYCLE_PHASES as submissionLifecyclePhases } from "../hooks/usePoCSubmission";

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

const POC_COMMITTED_EVENT_TOPIC = keccak256(
	toBytes("PoCCommitted(uint256,uint256,address,bytes32)"),
);
const MOCK_AUDITOR_ADDRESS =
	"0x1111111111111111111111111111111111111111";
const MOCK_COMMIT_HASH =
	"0x1111111111111111111111111111111111111111111111111111111111111111";
const COMMIT_REVEAL_RECOVERY_KEY = "anti-soon:commit-reveal-recovery:v1";
const MOCK_SALT = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const ZERO_HEX_32 =
	"0x0000000000000000000000000000000000000000000000000000000000000000";
const MOCK_COMPUTED_COMMIT_HASH =
	"0x9999999999999999999999999999999999999999999999999999999999999999";

function toUintTopic(value: bigint): `0x${string}` {
	return `0x${value.toString(16).padStart(64, "0")}` as `0x${string}`;
}

function toAddressTopic(address: string): `0x${string}` {
	return `0x${address.toLowerCase().replace(/^0x/, "").padStart(64, "0")}` as `0x${string}`;
}

function buildPoCCommittedLog(submissionId: bigint = 1n): {
	data: `0x${string}`;
	topics: `0x${string}`[];
} {
	return {
		data: MOCK_COMMIT_HASH,
		topics: [
			POC_COMMITTED_EVENT_TOPIC,
			toUintTopic(submissionId),
			toUintTopic(1n),
			toAddressTopic(MOCK_AUDITOR_ADDRESS),
		],
	};
}

function buildSubmissionTuple(options?: {
	projectId?: bigint;
	commitHash?: `0x${string}`;
	salt?: `0x${string}`;
	revealTimestamp?: bigint;
}): readonly unknown[] {
	return [
		MOCK_AUDITOR_ADDRESS,
		options?.projectId ?? 1n,
		options?.commitHash ?? MOCK_COMPUTED_COMMIT_HASH,
		"oasis://oasis-sapphire-testnet/0x1111111111111111111111111111111111111111/slot-42#0xabc",
		options?.salt ?? ZERO_HEX_32,
		100n,
		options?.revealTimestamp ?? 0n,
		0,
		0n,
		0,
		0n,
		0n,
		false,
		"0x0000000000000000000000000000000000000000",
		0n,
	];
}

describe("commit/reveal lifecycle state model", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		window.localStorage.clear();

		mockUseWallet.mockReturnValue({
			address: null,
			walletClient: undefined,
			publicClient: undefined,
			isConnected: false,
		});

		mockGenerateRandomSalt.mockReturnValue(MOCK_SALT);
		mockComputeCommitHash.mockReturnValue(MOCK_COMPUTED_COMMIT_HASH);
		mockUploadEncryptedPoC.mockResolvedValue({
			cipherURI:
				"oasis://oasis-sapphire-testnet/0x1111111111111111111111111111111111111111/slot-42#0xabc",
			oasisTxHash:
				"0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
		});
	});

	it("blocks commit when Sapphire readback validation fails", async () => {
		const simulateContract = vi.fn();

		mockUseWallet.mockReturnValue({
			address: "0x1111111111111111111111111111111111111111",
			walletClient: {
				writeContract: vi.fn(),
			},
			publicClient: {
				simulateContract,
				waitForTransactionReceipt: vi.fn(),
			},
			isConnected: true,
		});

		mockUploadEncryptedPoC.mockRejectedValue(
			new Error(
				"Sapphire readback validation failed: envelope hash does not match cipherURI",
			),
		);

		const { result } = renderHook(() => useCommitReveal(1n, '{"poc":"json"}'));

		await act(async () => {
			await result.current.commit();
		});

		expect(result.current.state.phase).toBe("failed");
		expect(result.current.state.error).toContain(
			"Sapphire readback validation failed: envelope hash does not match cipherURI",
		);
		expect(simulateContract).not.toHaveBeenCalled();
	});

	it("keeps lifecycle phases aligned across both hooks", () => {
		expect(SUBMISSION_LIFECYCLE_PHASES).toEqual([
			"idle",
			"encrypting",
			"committing",
			"committed",
			"revealing",
			"revealed",
			"failed",
		]);
		expect(submissionLifecyclePhases).toEqual(SUBMISSION_LIFECYCLE_PHASES);
	});

	it("sets failed with actionable message when commit starts without wallet", async () => {
		const { result } = renderHook(() => useCommitReveal(1n, '{"poc":"json"}'));

		await act(async () => {
			await result.current.commit();
		});

		expect(result.current.state.phase).toBe("failed");
		expect(result.current.state.error).toContain("Wallet not connected");
	});

	it("accepts CAIP-formatted wallet addresses during commit", async () => {
		mockUseWallet.mockReturnValue({
			address: "eip155:11155111:0x1111111111111111111111111111111111111111",
			walletClient: {
				writeContract: vi.fn().mockResolvedValue("0xcommit"),
			},
			publicClient: {
				simulateContract: vi.fn().mockResolvedValue({ request: { to: "0xabc" } }),
				waitForTransactionReceipt:
					vi.fn().mockResolvedValue({ logs: [buildPoCCommittedLog()] }),
			},
			isConnected: true,
		});

		const { result } = renderHook(() => useCommitReveal(1n, '{"poc":"json"}'));

		await act(async () => {
			await result.current.commit();
		});

		expect(result.current.state.phase).toBe("committed");
		expect(mockUploadEncryptedPoC).toHaveBeenCalledWith(
			expect.objectContaining({
				auditor: "0x1111111111111111111111111111111111111111",
			}),
		);
	});

	it("submits ACL-only upload payload without legacy key fields", async () => {
		mockUseWallet.mockReturnValue({
			address: "0x1111111111111111111111111111111111111111",
			walletClient: {
				writeContract: vi.fn().mockResolvedValue("0xcommit"),
			},
			publicClient: {
				simulateContract: vi.fn().mockResolvedValue({ request: { to: "0xabc" } }),
				waitForTransactionReceipt:
					vi.fn().mockResolvedValue({ logs: [buildPoCCommittedLog()] }),
			},
			isConnected: true,
		});

		const { result } = renderHook(() => useCommitReveal(1n, '{"poc":"json"}'));

		await act(async () => {
			await result.current.commit();
		});

		expect(result.current.state.phase).toBe("committed");
		expect(mockUploadEncryptedPoC).toHaveBeenCalledTimes(1);
		const payload = mockUploadEncryptedPoC.mock.calls[0]?.[0] as Record<string, unknown>;
		expect(Object.keys(payload).sort()).toEqual(["auditor", "poc", "projectId"]);
		expect(payload).not.toHaveProperty("ciphertext");
		expect(payload).not.toHaveProperty("iv");
	});

	it("fails closed against legacy lifecycle phase drift", () => {
		expect(SUBMISSION_LIFECYCLE_PHASES).not.toContain("decrypting");
		expect(SUBMISSION_LIFECYCLE_PHASES).not.toContain("submitted");
		expect(SUBMISSION_LIFECYCLE_PHASES).not.toContain("revealing_with_key");
	});

	it("resolves wallet address from walletClient.getAddresses when hook address is malformed", async () => {
		mockUseWallet.mockReturnValue({
			address: "wallet:malformed",
			walletClient: {
				writeContract: vi.fn().mockResolvedValue("0xcommit"),
				getAddresses: vi
					.fn()
					.mockResolvedValue(["0x1111111111111111111111111111111111111111"]),
			},
			publicClient: {
				simulateContract: vi.fn().mockResolvedValue({ request: { to: "0xabc" } }),
				waitForTransactionReceipt:
					vi.fn().mockResolvedValue({ logs: [buildPoCCommittedLog()] }),
			},
			isConnected: true,
		});

		const { result } = renderHook(() => useCommitReveal(1n, '{"poc":"json"}'));

		await act(async () => {
			await result.current.commit();
		});

		expect(result.current.state.phase).toBe("committed");
		expect(mockUploadEncryptedPoC).toHaveBeenCalledWith(
			expect.objectContaining({
				auditor: "0x1111111111111111111111111111111111111111",
			}),
		);
	});

	it("maps provider-style non-Error objects to actionable commit errors", async () => {
		mockUseWallet.mockReturnValue({
			address: "0x1111111111111111111111111111111111111111",
			walletClient: {},
			publicClient: {},
			isConnected: true,
		});
		mockUploadEncryptedPoC.mockRejectedValue({
			shortMessage: "User rejected the request",
			code: 4001,
		});

		const { result } = renderHook(() => useCommitReveal(1n, '{"poc":"json"}'));

		await act(async () => {
			await result.current.commit();
		});

		expect(result.current.state.phase).toBe("failed");
		expect(result.current.state.error).toContain("User rejected the request");
		expect(result.current.state.error).not.toContain("unknown error");
	});

	it("normalizes invalid-address commit errors to actionable wallet guidance", async () => {
		mockUseWallet.mockReturnValue({
			address: "0x1111111111111111111111111111111111111111",
			walletClient: {},
			publicClient: {},
			isConnected: true,
		});
		mockUploadEncryptedPoC.mockRejectedValue({
			shortMessage: "Invalid parameters: must provide an Ethereum address.",
		});

		const { result } = renderHook(() => useCommitReveal(1n, '{"poc":"json"}'));

		await act(async () => {
			await result.current.commit();
		});

		expect(result.current.state.phase).toBe("failed");
		expect(result.current.state.error).toContain(
			"Wallet returned an invalid address (wallet=0x1111111111111111111111111111111111111111, bountyHub=",
		);
	});

	it("fails when commit receipt is missing PoCCommitted event", async () => {
		mockUseWallet.mockReturnValue({
			address: "0x1111111111111111111111111111111111111111",
			walletClient: {
				writeContract: vi.fn().mockResolvedValue("0xcommit"),
			},
			publicClient: {
				simulateContract: vi.fn().mockResolvedValue({ request: { to: "0xabc" } }),
				waitForTransactionReceipt: vi.fn().mockResolvedValue({ logs: [] }),
			},
			isConnected: true,
		});

		const { result } = renderHook(() => useCommitReveal(1n, '{"poc":"json"}'));

		await act(async () => {
			await result.current.commit();
		});

		expect(result.current.state.phase).toBe("failed");
		expect(result.current.state.error).toContain("PoCCommitted event was missing");
	});

	it("uses deterministic commit transition ordering and supports reset recovery", async () => {
		const waitReceiptDeferred = deferred<{
			logs: Array<{ data: `0x${string}`; topics: `0x${string}`[] }>;
		}>();
		const uploadDeferred = deferred<{
			cipherURI: string;
			oasisTxHash: `0x${string}`;
		}>();

		const publicClient = {
			simulateContract: vi.fn().mockResolvedValue({ request: { to: "0xabc" } }),
			waitForTransactionReceipt: vi
				.fn()
				.mockReturnValue(waitReceiptDeferred.promise),
		};
		const walletClient = {
			writeContract: vi.fn().mockResolvedValue("0xcommit"),
		};

		mockUseWallet.mockReturnValue({
			address: "0x1111111111111111111111111111111111111111",
			walletClient,
			publicClient,
			isConnected: true,
		});
		mockUploadEncryptedPoC.mockReturnValue(uploadDeferred.promise);

		const { result } = renderHook(() => useCommitReveal(1n, '{"poc":"json"}'));

		let commitPromise!: Promise<void>;
		await act(async () => {
			commitPromise = result.current.commit();
		});

		expect(result.current.state.phase).toBe("committing");

		await act(async () => {
			uploadDeferred.resolve(
				{
					cipherURI:
						"oasis://oasis-sapphire-testnet/0x1111111111111111111111111111111111111111/slot-42#0xabc",
					oasisTxHash:
						"0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
				},
			);
			await Promise.resolve();
		});

		expect(result.current.state.phase).toBe("committing");

		await act(async () => {
			waitReceiptDeferred.resolve({ logs: [buildPoCCommittedLog(42n)] });
			await commitPromise;
		});

		expect(mockComputeCommitHash).toHaveBeenCalledWith(
			keccak256(toBytes("oasis://oasis-sapphire-testnet/0x1111111111111111111111111111111111111111/slot-42#0xabc")),
			"0x1111111111111111111111111111111111111111",
			MOCK_SALT,
		);

		expect(mockUploadEncryptedPoC).toHaveBeenCalledWith(
			expect.objectContaining({
				poc: '{"poc":"json"}',
				projectId: 1n,
				auditor: "0x1111111111111111111111111111111111111111",
			}),
		);

		expect(result.current.state.phase).toBe("committed");

		await act(async () => {
			result.current.reset();
		});

		expect(result.current.state.phase).toBe("idle");
		expect(result.current.state.error).toBeUndefined();
	});

	it("restores persisted commit context on reload and continues reveal", async () => {
		const commitTxHash =
			"0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
		const revealTxHash =
			"0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

		const commitWalletClient = {
			writeContract: vi.fn().mockResolvedValue(commitTxHash),
		};
		const commitPublicClient = {
			simulateContract: vi.fn().mockResolvedValue({ request: { to: "0xabc" } }),
			waitForTransactionReceipt: vi
				.fn()
				.mockResolvedValue({ logs: [buildPoCCommittedLog(99n)] }),
			readContract: vi.fn().mockImplementation(({ functionName }: { functionName: string }) => {
				if (functionName === "submissions") {
					return buildSubmissionTuple();
				}
				if (functionName === "canReveal") {
					return true;
				}
				return true;
			}),
		};

		mockUseWallet.mockReturnValue({
			address: "0x1111111111111111111111111111111111111111",
			walletClient: commitWalletClient,
			publicClient: commitPublicClient,
			isConnected: true,
		});

		const first = renderHook(() => useCommitReveal(1n, '{"poc":"json"}'));
		await act(async () => {
			await first.result.current.commit();
		});

		expect(first.result.current.state.phase).toBe("committed");
		const persistedAfterCommit = window.localStorage.getItem(COMMIT_REVEAL_RECOVERY_KEY);
		expect(persistedAfterCommit).toContain('"projectId":"1"');
		expect(persistedAfterCommit).not.toContain('"poc"');

		first.unmount();

		const revealWalletClient = {
			writeContract: vi.fn().mockResolvedValue(revealTxHash),
		};
		const revealPublicClient = {
			simulateContract: vi.fn().mockResolvedValue({ request: { to: "0xreveal-req" } }),
			waitForTransactionReceipt: vi.fn().mockResolvedValue({ logs: [] }),
			readContract: vi.fn().mockImplementation(({ functionName }: { functionName: string }) => {
				if (functionName === "submissions") {
					return buildSubmissionTuple();
				}
				if (functionName === "canReveal") {
					return true;
				}
				return true;
			}),
		};

		mockUseWallet.mockReturnValue({
			address: "0x1111111111111111111111111111111111111111",
			walletClient: revealWalletClient,
			publicClient: revealPublicClient,
			isConnected: true,
		});

		const second = renderHook(() => useCommitReveal(1n, ""));

		await waitFor(() => {
			expect(second.result.current.state.phase).toBe("committed");
			expect(second.result.current.state.submissionId).toBe(99n);
		});

		await act(async () => {
			await second.result.current.reveal();
		});

		expect(second.result.current.state.phase).toBe("revealed");
		expect(mockUploadEncryptedPoC).toHaveBeenCalledTimes(1);
		expect(window.localStorage.getItem(COMMIT_REVEAL_RECOVERY_KEY)).toBeNull();
	});

	it("rejects mismatched recovery context safely", async () => {
		window.localStorage.setItem(
			COMMIT_REVEAL_RECOVERY_KEY,
			JSON.stringify({
				version: 1,
				projectId: "9",
				salt:
					"0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
				cipherURI:
					"oasis://oasis-sapphire-testnet/0x1111111111111111111111111111111111111111/slot-42#0x1111111111111111111111111111111111111111111111111111111111111111",
				commitHash:
					"0x2222222222222222222222222222222222222222222222222222222222222222",
				oasisTxHash:
					"0x3333333333333333333333333333333333333333333333333333333333333333",
			}),
		);

		mockUseWallet.mockReturnValue({
			address: "0x1111111111111111111111111111111111111111",
			walletClient: {
				writeContract: vi.fn().mockResolvedValue("0xcommit"),
			},
			publicClient: {
				simulateContract: vi.fn().mockResolvedValue({ request: { to: "0xabc" } }),
				waitForTransactionReceipt: vi
					.fn()
					.mockResolvedValue({ logs: [buildPoCCommittedLog(12n)] }),
			},
			isConnected: true,
		});

		const { result } = renderHook(() => useCommitReveal(1n, '{"poc":"json"}'));
		await act(async () => {
			await Promise.resolve();
		});

		expect(window.localStorage.getItem(COMMIT_REVEAL_RECOVERY_KEY)).toBeNull();

		await act(async () => {
			await result.current.commit();
		});

		expect(result.current.state.phase).toBe("committed");
		expect(mockUploadEncryptedPoC).toHaveBeenCalledTimes(1);
	});

	it("returns deterministic reveal retry state when canReveal is blocked", async () => {
		window.localStorage.setItem(
			COMMIT_REVEAL_RECOVERY_KEY,
			JSON.stringify({
				version: 1,
				projectId: "1",
				salt:
					"0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
				cipherURI:
					"oasis://oasis-sapphire-testnet/0x1111111111111111111111111111111111111111/slot-42#0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
				commitHash:
					"0x2222222222222222222222222222222222222222222222222222222222222222",
				oasisTxHash:
					"0x3333333333333333333333333333333333333333333333333333333333333333",
				submissionId: "55",
			}),
		);

		const publicClient = {
			readContract: vi.fn().mockImplementation(({ functionName }: { functionName: string }) => {
				if (functionName === "submissions") {
					return buildSubmissionTuple({
						commitHash:
							"0x2222222222222222222222222222222222222222222222222222222222222222",
					});
				}
				if (functionName === "canReveal") {
					return false;
				}
				return true;
			}),
			simulateContract: vi.fn(),
			waitForTransactionReceipt: vi.fn(),
		};

		mockUseWallet.mockReturnValue({
			address: "0x1111111111111111111111111111111111111111",
			walletClient: {
				writeContract: vi.fn(),
			},
			publicClient,
			isConnected: true,
		});

		const { result } = renderHook(() => useCommitReveal(1n, ""));
		await waitFor(() => {
			expect(result.current.state.phase).toBe("committed");
		});

		await act(async () => {
			await result.current.reveal();
		});

		expect(result.current.state.phase).toBe("failed");
		expect(result.current.state.revealRetry).toEqual({
			code: "REVEAL_RECHECK_REQUIRED",
			reason: "TIMING_OR_CANDIDATE_BLOCKED",
			policy: "POLL_CAN_REVEAL",
			submissionId: 55n,
			recheckIntervalMs: 15000,
		});
		expect(publicClient.simulateContract).not.toHaveBeenCalled();
	});

	it("rejects reveal when recovered submissionId/salt pair mismatches on-chain", async () => {
		window.localStorage.setItem(
			COMMIT_REVEAL_RECOVERY_KEY,
			JSON.stringify({
				version: 1,
				projectId: "1",
				salt:
					"0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
				cipherURI:
					"oasis://oasis-sapphire-testnet/0x1111111111111111111111111111111111111111/slot-42#0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
				commitHash:
					"0x2222222222222222222222222222222222222222222222222222222222222222",
				oasisTxHash:
					"0x3333333333333333333333333333333333333333333333333333333333333333",
				submissionId: "77",
			}),
		);

		const publicClient = {
			readContract: vi.fn().mockImplementation(({ functionName }: { functionName: string }) => {
				if (functionName === "submissions") {
					return buildSubmissionTuple({
						commitHash:
							"0x2222222222222222222222222222222222222222222222222222222222222222",
						salt:
							"0x4444444444444444444444444444444444444444444444444444444444444444",
					});
				}
				return true;
			}),
			simulateContract: vi.fn(),
			waitForTransactionReceipt: vi.fn(),
		};

		mockUseWallet.mockReturnValue({
			address: "0x1111111111111111111111111111111111111111",
			walletClient: {
				writeContract: vi.fn(),
			},
			publicClient,
			isConnected: true,
		});

		const { result } = renderHook(() => useCommitReveal(1n, ""));
		await waitFor(() => {
			expect(result.current.state.phase).toBe("failed");
		});

		expect(result.current.state.error).toContain("salt does not match on-chain submission");
		expect(window.localStorage.getItem(COMMIT_REVEAL_RECOVERY_KEY)).toBeNull();
		expect(publicClient.simulateContract).not.toHaveBeenCalled();
	});

});
