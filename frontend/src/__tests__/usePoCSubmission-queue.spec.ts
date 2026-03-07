import { act, renderHook, waitFor } from "@testing-library/react";
import { keccak256, toBytes } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUseWallet = vi.fn();
const mockGenerateRandomSalt = vi.fn();
const mockComputeCommitHash = vi.fn();
const mockUploadEncryptedPoC = vi.fn();
const mockReadContractWithRpcFallback = vi.fn();

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

vi.mock("../lib/publicClient", () => ({
	readContractWithRpcFallback: (...args: unknown[]) =>
		mockReadContractWithRpcFallback(...args),
}));

import { usePoCSubmission } from "../hooks/usePoCSubmission";

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
const MOCK_AUDITOR_ADDRESS = "0x1111111111111111111111111111111111111111";
const MOCK_COMMIT_HASH =
	"0x1111111111111111111111111111111111111111111111111111111111111111";
const COMMIT_REVEAL_RECOVERY_KEY = "anti-soon:commit-reveal-recovery:v2";
const MOCK_SALT =
	"0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
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

function buildQueuedRevealTuple(options?: {
	auditor?: `0x${string}`;
	salt?: `0x${string}`;
	deadline?: bigint;
	queued?: boolean;
}): readonly unknown[] {
	return [
		options?.auditor ?? "0x0000000000000000000000000000000000000000",
		options?.salt ?? ZERO_HEX_32,
		options?.deadline ?? 0n,
		options?.queued ?? false,
	] as const;
}

describe("usePoCSubmission lifecycle", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		window.localStorage.clear();

		mockUseWallet.mockReturnValue({
			address: "0x1111111111111111111111111111111111111111",
			walletClient: {
				writeContract: vi.fn().mockResolvedValue("0xcommit"),
				signTypedData: vi.fn().mockResolvedValue("0xsigned"),
			},
			publicClient: {
				readContract: vi
					.fn()
					.mockImplementation(({ functionName }: { functionName: string }) => {
						if (functionName === "submissions") {
							return buildSubmissionTuple();
						}
						if (functionName === "sigNonces") {
							return 0n;
						}
						if (functionName === "queuedReveals") {
							return buildQueuedRevealTuple();
						}
						return true;
					}),
				simulateContract: vi
					.fn()
					.mockResolvedValue({ request: { to: "0xabc" } }),
				waitForTransactionReceipt: vi.fn(),
			},
			isConnected: true,
		});

		mockGenerateRandomSalt.mockReturnValue(MOCK_SALT);
		mockComputeCommitHash.mockReturnValue(MOCK_COMPUTED_COMMIT_HASH);
		mockReadContractWithRpcFallback.mockImplementation((args: unknown) => {
			const walletState = mockUseWallet();
			return walletState.publicClient.readContract(args);
		});
		mockUploadEncryptedPoC.mockResolvedValue({
			cipherURI:
				"oasis://oasis-sapphire-testnet/0x1111111111111111111111111111111111111111/slot-42#0xabc",
			oasisTxHash:
				"0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
		});
	});

	it("blocks submission when Sapphire readback validation fails", async () => {
		const simulateContract = vi.fn();

		mockUseWallet.mockReturnValue({
			address: "0x1111111111111111111111111111111111111111",
			walletClient: {
				writeContract: vi.fn(),
				signTypedData: vi.fn(),
			},
			publicClient: {
				readContract: vi.fn(),
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

		const { result } = renderHook(() => usePoCSubmission(1n));

		await act(async () => {
			await result.current.submitPoC(1n, '{"poc":"json"}');
		});

		expect(result.current.state.phase).toBe("failed");
		expect(result.current.state.error).toContain(
			"Sapphire readback validation failed: envelope hash does not match cipherURI",
		);
		expect(simulateContract).not.toHaveBeenCalled();
	});

	it("finishes after commit receipt and returns only the Sepolia commit hash", async () => {
		const receiptDeferred = deferred<{
			logs: Array<{ data: `0x${string}`; topics: `0x${string}`[] }>;
		}>();

		const walletClient = {
			writeContract: vi.fn().mockResolvedValueOnce("0xcommit"),
			signTypedData: vi.fn(),
		};
		const publicClient = {
			readContract: vi.fn(),
			simulateContract: vi.fn().mockResolvedValue({ request: { to: "0xabc" } }),
			waitForTransactionReceipt: vi
				.fn()
				.mockReturnValueOnce(receiptDeferred.promise),
		};

		mockUseWallet.mockReturnValue({
			address: "0x1111111111111111111111111111111111111111",
			walletClient,
			publicClient,
			isConnected: true,
		});

		mockReadContractWithRpcFallback.mockImplementation(({ functionName, args }: { functionName: string; args?: unknown[] }) => {
			if (functionName === "getAuditorSubmissionIds") {
				return [[8n], 0n];
			}
			if (functionName === "submissions") {
				const submissionId = Array.isArray(args) ? (args[0] as bigint) : 0n;
				if (submissionId === 8n) {
					return buildSubmissionTuple({
						projectId: 1n,
						commitHash: MOCK_COMPUTED_COMMIT_HASH,
					});
				}
				return buildSubmissionTuple();
			}
			return true;
		});

		const { result } = renderHook(() => usePoCSubmission(1n));

		let submitPromise!: Promise<
			| {
					submissionId?: bigint;
					commitTxHash?: `0x${string}`;
			  }
			| undefined
		>;
		await act(async () => {
			submitPromise = result.current.submitPoC(1n, '{"poc":"json"}');
		});

		await act(async () => {
			receiptDeferred.resolve({ logs: [buildPoCCommittedLog(7n)] });
		});

		let submitResult:
			| {
					submissionId?: bigint;
					commitTxHash?: `0x${string}`;
			  }
			| undefined;
		await act(async () => {
			submitResult = await submitPromise;
		});

		expect(result.current.state.phase).toBe("committed");
		expect(submitResult?.commitTxHash).toBe("0xcommit");
		expect(walletClient.signTypedData).not.toHaveBeenCalled();
		expect(publicClient.readContract).not.toHaveBeenCalled();
		expect(mockUploadEncryptedPoC).toHaveBeenCalledWith(
			expect.objectContaining({
				poc: '{"poc":"json"}',
				projectId: 1n,
				auditor: "0x1111111111111111111111111111111111111111",
			}),
		);
	});

	it("stays in encrypting until Sapphire upload finishes, then advances to committing", async () => {
		const uploadDeferred = deferred<{ cipherURI: string; oasisTxHash: `0x${string}` }>();
		const receiptDeferred = deferred<{
			logs: Array<{ data: `0x${string}`; topics: `0x${string}`[] }>;
		}>();
		const walletClient = {
			writeContract: vi
				.fn()
				.mockResolvedValueOnce("0xcommit"),
			signTypedData: vi.fn(),
		};
		const publicClient = {
			readContract: vi.fn(),
			simulateContract: vi.fn().mockResolvedValue({ request: { to: "0xabc" } }),
			waitForTransactionReceipt: vi
				.fn()
				.mockReturnValueOnce(receiptDeferred.promise),
		};

		mockUseWallet.mockReturnValue({
			address: "0x1111111111111111111111111111111111111111",
			walletClient,
			publicClient,
			isConnected: true,
		});
		mockUploadEncryptedPoC.mockReturnValue(uploadDeferred.promise);

		const { result } = renderHook(() => usePoCSubmission(1n));

		await act(async () => {
			void result.current.submitPoC(1n, '{"poc":"json"}');
		});

		expect(result.current.state.phase).toBe("encrypting");
		expect(publicClient.simulateContract).not.toHaveBeenCalled();

		await act(async () => {
			uploadDeferred.resolve({
				cipherURI:
					"oasis://oasis-sapphire-testnet/0x1111111111111111111111111111111111111111/slot-42#0xabc",
				oasisTxHash:
					"0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
			});
		});

		await waitFor(() => {
			expect(result.current.state.phase).toBe("committing");
		});

		await act(async () => {
			receiptDeferred.resolve({ logs: [buildPoCCommittedLog(7n)] });
		});

		await waitFor(() => {
			expect(result.current.state.phase).toBe("committed");
		});
	});

	it("surfaces shortMessage when submission throws provider-style object", async () => {
		mockUploadEncryptedPoC.mockRejectedValue({
			shortMessage: "Execution reverted: commit window closed",
		});

		const { result } = renderHook(() => usePoCSubmission(1n));

		let submitResult:
			| {
					submissionId?: bigint;
					commitTxHash?: `0x${string}`;
			  }
			| undefined;

		await act(async () => {
			submitResult = await result.current.submitPoC(1n, '{"poc":"json"}');
		});

		expect(submitResult).toBeUndefined();
		expect(result.current.state.phase).toBe("failed");
		expect(result.current.state.error).toContain(
			"Execution reverted: commit window closed",
		);
		expect(result.current.state.error).not.toContain("unknown error");
	});

	it("normalizes invalid-address submission errors to wallet guidance", async () => {
		mockUploadEncryptedPoC.mockRejectedValue({
			shortMessage: "Invalid parameters: must provide an Ethereum address.",
		});

		const { result } = renderHook(() => usePoCSubmission(1n));

		await act(async () => {
			await result.current.submitPoC(1n, '{"poc":"json"}');
		});

		expect(result.current.state.phase).toBe("failed");
		expect(result.current.state.error).toContain(
			"Wallet returned an invalid address (wallet=0x1111111111111111111111111111111111111111, bountyHub=",
		);
	});

	it("resolves signer address from wallet client when hook address is malformed", async () => {
		const walletClient = {
			writeContract: vi
				.fn()
				.mockResolvedValueOnce("0xcommit")
				.mockResolvedValueOnce("0xqueue"),
			signTypedData: vi.fn().mockResolvedValue("0xsigned"),
			getAddresses: vi
				.fn()
				.mockResolvedValue(["0x1111111111111111111111111111111111111111"]),
		};

		const publicClient = {
			readContract: vi
				.fn()
				.mockImplementation(({ functionName }: { functionName: string }) => {
					if (functionName === "submissions") {
						return buildSubmissionTuple();
					}
					if (functionName === "sigNonces") {
						return 0n;
					}
					if (functionName === "queuedReveals") {
						return buildQueuedRevealTuple();
					}
					return true;
				}),
			simulateContract: vi.fn().mockResolvedValue({ request: { to: "0xabc" } }),
			waitForTransactionReceipt: vi
				.fn()
				.mockResolvedValueOnce({ logs: [buildPoCCommittedLog(8n)] })
				.mockResolvedValueOnce({ logs: [] }),
		};

		mockUseWallet.mockReturnValue({
			address: "wallet:malformed",
			walletClient,
			publicClient,
			isConnected: true,
		});

		const { result } = renderHook(() => usePoCSubmission(1n));

		await act(async () => {
			await result.current.submitPoC(1n, '{"poc":"json"}');
		});

		expect(result.current.state.phase).toBe("committed");
		expect(mockUploadEncryptedPoC).toHaveBeenCalledWith(
			expect.objectContaining({
				auditor: "0x1111111111111111111111111111111111111111",
			}),
		);
	});

	it("clears persisted committed context on reload instead of auto-resuming terminal state", async () => {
		window.localStorage.setItem(
			COMMIT_REVEAL_RECOVERY_KEY,
			JSON.stringify({
				version: 1,
				projectId: "1",
				auditor: MOCK_AUDITOR_ADDRESS,
				salt: "0x1111111111111111111111111111111111111111111111111111111111111111",
				cipherURI:
					"oasis://oasis-sapphire-testnet/0x1111111111111111111111111111111111111111/slot-42#0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
				commitHash:
					"0x2222222222222222222222222222222222222222222222222222222222222222",
				oasisTxHash:
					"0x3333333333333333333333333333333333333333333333333333333333333333",
				submissionId: "8",
			}),
		);

		const walletClient = {
			writeContract: vi.fn(),
			signTypedData: vi.fn(),
		};
		const publicClient = {
			readContract: vi
				.fn()
				.mockImplementation(({ functionName }: { functionName: string }) => {
					if (functionName === "submissions") {
						return buildSubmissionTuple({
							commitHash:
								"0x2222222222222222222222222222222222222222222222222222222222222222",
						});
					}
					return true;
				}),
			simulateContract: vi.fn(),
			waitForTransactionReceipt: vi.fn(),
		};

		mockUseWallet.mockReturnValue({
			address: "0x1111111111111111111111111111111111111111",
			walletClient,
			publicClient,
			isConnected: true,
		});

		const { result } = renderHook(() => usePoCSubmission(1n));

		await waitFor(() => {
			expect(window.localStorage.getItem(COMMIT_REVEAL_RECOVERY_KEY)).toBeNull();
		});
		expect(result.current.state.phase).toBe("idle");
		expect(mockUploadEncryptedPoC).not.toHaveBeenCalled();
		expect(publicClient.simulateContract).not.toHaveBeenCalled();
		expect(walletClient.writeContract).not.toHaveBeenCalled();
	});

	it("ignores stale committed recovery context and allows a fresh submit", async () => {
		window.localStorage.setItem(
			COMMIT_REVEAL_RECOVERY_KEY,
			JSON.stringify({
				version: 1,
				projectId: "1",
				auditor: MOCK_AUDITOR_ADDRESS,
				salt: "0x1111111111111111111111111111111111111111111111111111111111111111",
				cipherURI:
					"oasis://oasis-sapphire-testnet/0x1111111111111111111111111111111111111111/slot-42#0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
				commitHash:
					"0x2222222222222222222222222222222222222222222222222222222222222222",
				oasisTxHash:
					"0x3333333333333333333333333333333333333333333333333333333333333333",
				commitTxHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
				submissionId: "8",
			}),
		);

		const walletClient = {
			writeContract: vi.fn().mockResolvedValue("0xcommit"),
			signTypedData: vi.fn(),
		};
		const publicClient = {
			readContract: vi.fn().mockImplementation(({ functionName }: { functionName: string }) => {
				if (functionName === "submissions") {
					return buildSubmissionTuple({
						commitHash:
							"0x2222222222222222222222222222222222222222222222222222222222222222",
					});
				}
				return true;
			}),
			simulateContract: vi.fn().mockResolvedValue({ request: { to: "0xabc" } }),
			waitForTransactionReceipt: vi.fn().mockResolvedValue({
				logs: [buildPoCCommittedLog(13n)],
			}),
		};

		mockUseWallet.mockReturnValue({
			address: "0x1111111111111111111111111111111111111111",
			walletClient,
			publicClient,
			isConnected: true,
		});

		const { result } = renderHook(() => usePoCSubmission(1n));

		await waitFor(() => {
			expect(window.localStorage.getItem(COMMIT_REVEAL_RECOVERY_KEY)).toBeNull();
		});
		expect(result.current.state.phase).toBe("idle");

		await act(async () => {
			await result.current.submitPoC(1n, '{"poc":"json"}');
		});

		expect(result.current.state.phase).toBe("committed");
		expect(walletClient.writeContract).toHaveBeenCalledTimes(1);
		expect(mockUploadEncryptedPoC).toHaveBeenCalledTimes(1);
	});

	it("rejects mismatched recovery context before fresh submission", async () => {
		window.localStorage.setItem(
			COMMIT_REVEAL_RECOVERY_KEY,
			JSON.stringify({
				version: 1,
				projectId: "9",
				auditor: MOCK_AUDITOR_ADDRESS,
				salt: "0x1111111111111111111111111111111111111111111111111111111111111111",
				cipherURI:
					"oasis://oasis-sapphire-testnet/0x1111111111111111111111111111111111111111/slot-42#0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
				commitHash:
					"0x2222222222222222222222222222222222222222222222222222222222222222",
				oasisTxHash:
					"0x3333333333333333333333333333333333333333333333333333333333333333",
			}),
		);

		const walletClient = {
			writeContract: vi
				.fn()
				.mockResolvedValueOnce("0xcommit")
				.mockResolvedValueOnce("0xqueue"),
			signTypedData: vi.fn().mockResolvedValue("0xsigned"),
		};
		const publicClient = {
			readContract: vi
				.fn()
				.mockImplementation(({ functionName }: { functionName: string }) => {
					if (functionName === "submissions") {
						return buildSubmissionTuple();
					}
					if (functionName === "sigNonces") {
						return 0n;
					}
					if (functionName === "queuedReveals") {
						return buildQueuedRevealTuple();
					}
					return true;
				}),
			simulateContract: vi.fn().mockResolvedValue({ request: { to: "0xabc" } }),
			waitForTransactionReceipt: vi
				.fn()
				.mockResolvedValueOnce({ logs: [buildPoCCommittedLog(11n)] })
				.mockResolvedValueOnce({ logs: [] }),
		};

		mockUseWallet.mockReturnValue({
			address: "0x1111111111111111111111111111111111111111",
			walletClient,
			publicClient,
			isConnected: true,
		});

		const { result } = renderHook(() => usePoCSubmission(1n));

		await act(async () => {
			await result.current.submitPoC(1n, '{"poc":"json"}');
		});

		expect(result.current.state.phase).toBe("committed");
		expect(mockUploadEncryptedPoC).toHaveBeenCalledTimes(1);
	});

	it("rejects recovered context when auditor wallet mismatches before submission", async () => {
		window.localStorage.setItem(
			COMMIT_REVEAL_RECOVERY_KEY,
			JSON.stringify({
				version: 1,
				projectId: "1",
				auditor: "0x2222222222222222222222222222222222222222",
				salt:
					"0x1111111111111111111111111111111111111111111111111111111111111111",
				cipherURI:
					"oasis://oasis-sapphire-testnet/0x1111111111111111111111111111111111111111/slot-42#0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
				commitHash:
					"0x2222222222222222222222222222222222222222222222222222222222222222",
				oasisTxHash:
					"0x3333333333333333333333333333333333333333333333333333333333333333",
				submissionId: "8",
			}),
		);

		const walletClient = {
			writeContract: vi
				.fn()
				.mockResolvedValueOnce("0xcommit")
				.mockResolvedValueOnce("0xqueue"),
			signTypedData: vi.fn().mockResolvedValue("0xsigned"),
		};
		const publicClient = {
			readContract: vi.fn().mockImplementation(({ functionName }: { functionName: string }) => {
				if (functionName === "submissions") {
					return buildSubmissionTuple();
				}
				if (functionName === "sigNonces") {
					return 0n;
				}
				if (functionName === "queuedReveals") {
					return buildQueuedRevealTuple();
				}
				return true;
			}),
			simulateContract: vi.fn().mockResolvedValue({ request: { to: "0xabc" } }),
			waitForTransactionReceipt: vi
				.fn()
				.mockResolvedValueOnce({ logs: [buildPoCCommittedLog(17n)] })
				.mockResolvedValueOnce({ logs: [] }),
		};

		mockUseWallet.mockReturnValue({
			address: MOCK_AUDITOR_ADDRESS,
			walletClient,
			publicClient,
			isConnected: true,
		});

		const { result } = renderHook(() => usePoCSubmission(1n));

		await act(async () => {
			await result.current.submitPoC(1n, '{"poc":"json"}');
		});

		expect(result.current.state.phase).toBe("committed");
		expect(mockUploadEncryptedPoC).toHaveBeenCalledTimes(1);
	});

	it("rejects recovered context when persisted chainId does not match Sepolia flow", async () => {
		window.localStorage.setItem(
			COMMIT_REVEAL_RECOVERY_KEY,
			JSON.stringify({
				version: 1,
				projectId: "1",
				auditor: MOCK_AUDITOR_ADDRESS,
				chainId: 23295,
				salt:
					"0x1111111111111111111111111111111111111111111111111111111111111111",
				cipherURI:
					"oasis://oasis-sapphire-testnet/0x1111111111111111111111111111111111111111/slot-42#0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
				commitHash:
					"0x2222222222222222222222222222222222222222222222222222222222222222",
				oasisTxHash:
					"0x3333333333333333333333333333333333333333333333333333333333333333",
				submissionId: "8",
			}),
		);

		const walletClient = {
			writeContract: vi
				.fn()
				.mockResolvedValueOnce("0xcommit")
				.mockResolvedValueOnce("0xqueue"),
			signTypedData: vi.fn().mockResolvedValue("0xsigned"),
		};
		const publicClient = {
			readContract: vi
				.fn()
				.mockImplementation(({ functionName }: { functionName: string }) => {
					if (functionName === "submissions") {
						return buildSubmissionTuple();
					}
					if (functionName === "sigNonces") {
						return 0n;
					}
					if (functionName === "queuedReveals") {
						return buildQueuedRevealTuple();
					}
					return true;
				}),
			simulateContract: vi.fn().mockResolvedValue({ request: { to: "0xabc" } }),
			waitForTransactionReceipt: vi
				.fn()
				.mockResolvedValueOnce({ logs: [buildPoCCommittedLog(21n)] })
				.mockResolvedValueOnce({ logs: [] }),
		};

		mockUseWallet.mockReturnValue({
			address: MOCK_AUDITOR_ADDRESS,
			walletClient,
			publicClient,
			isConnected: true,
		});

		const { result } = renderHook(() => usePoCSubmission(1n));

		await act(async () => {
			await result.current.submitPoC(1n, '{"poc":"json"}');
		});

		expect(result.current.state.phase).toBe("committed");
		expect(mockUploadEncryptedPoC).toHaveBeenCalledTimes(1);
	});

	it("rejects expired recovery context and proceeds with fresh submission", async () => {
		window.localStorage.setItem(
			COMMIT_REVEAL_RECOVERY_KEY,
			JSON.stringify({
				version: 1,
				projectId: "1",
				auditor: MOCK_AUDITOR_ADDRESS,
				salt:
					"0x1111111111111111111111111111111111111111111111111111111111111111",
				cipherURI:
					"oasis://oasis-sapphire-testnet/0x1111111111111111111111111111111111111111/slot-42#0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
				commitHash:
					"0x2222222222222222222222222222222222222222222222222222222222222222",
				oasisTxHash:
					"0x3333333333333333333333333333333333333333333333333333333333333333",
				expiresAt: Date.now() - 1000,
			}),
		);

		const walletClient = {
			writeContract: vi
				.fn()
				.mockResolvedValueOnce("0xcommit")
				.mockResolvedValueOnce("0xqueue"),
			signTypedData: vi.fn().mockResolvedValue("0xsigned"),
		};
		const publicClient = {
			readContract: vi
				.fn()
				.mockImplementation(({ functionName }: { functionName: string }) => {
					if (functionName === "submissions") {
						return buildSubmissionTuple();
					}
					if (functionName === "sigNonces") {
						return 0n;
					}
					if (functionName === "queuedReveals") {
						return buildQueuedRevealTuple();
					}
					return true;
				}),
			simulateContract: vi.fn().mockResolvedValue({ request: { to: "0xabc" } }),
			waitForTransactionReceipt: vi
				.fn()
				.mockResolvedValueOnce({ logs: [buildPoCCommittedLog(25n)] })
				.mockResolvedValueOnce({ logs: [] }),
		};

		mockUseWallet.mockReturnValue({
			address: MOCK_AUDITOR_ADDRESS,
			walletClient,
			publicClient,
			isConnected: true,
		});

		const { result } = renderHook(() => usePoCSubmission(1n));

		await act(async () => {
			await result.current.submitPoC(1n, '{"poc":"json"}');
		});

		expect(result.current.state.phase).toBe("committed");
		expect(mockUploadEncryptedPoC).toHaveBeenCalledTimes(1);
	});

	it("ignores committed recovery context even if queued reveal data exists", async () => {
		window.localStorage.setItem(
			COMMIT_REVEAL_RECOVERY_KEY,
			JSON.stringify({
				version: 1,
				projectId: "1",
				auditor: MOCK_AUDITOR_ADDRESS,
				salt: "0x1111111111111111111111111111111111111111111111111111111111111111",
				cipherURI:
					"oasis://oasis-sapphire-testnet/0x1111111111111111111111111111111111111111/slot-42#0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
				commitHash:
					"0x2222222222222222222222222222222222222222222222222222222222222222",
				oasisTxHash:
					"0x3333333333333333333333333333333333333333333333333333333333333333",
				submissionId: "8",
			}),
		);

		const walletClient = {
			writeContract: vi.fn().mockResolvedValue("0xcommit"),
			signTypedData: vi.fn(),
		};

		const publicClient = {
			readContract: vi
				.fn()
				.mockImplementation(({ functionName }: { functionName: string }) => {
					if (functionName === "submissions") {
						return buildSubmissionTuple({
							commitHash:
								"0x2222222222222222222222222222222222222222222222222222222222222222",
						});
					}
					if (functionName === "queuedReveals") {
						return buildQueuedRevealTuple({
							auditor: MOCK_AUDITOR_ADDRESS,
							salt: "0x1111111111111111111111111111111111111111111111111111111111111111",
							deadline: 9999999999n,
							queued: true,
						});
					}
					return true;
				}),
			simulateContract: vi.fn().mockResolvedValue({ request: { to: "0xabc" } }),
			waitForTransactionReceipt: vi.fn().mockResolvedValue({
				logs: [buildPoCCommittedLog(8n)],
			}),
		};

		mockUseWallet.mockReturnValue({
			address: "0x1111111111111111111111111111111111111111",
			walletClient,
			publicClient,
			isConnected: true,
		});

		const { result } = renderHook(() => usePoCSubmission(1n));

		await act(async () => {
			await result.current.submitPoC(1n, '{"poc":"json"}');
		});

		expect(result.current.state.phase).toBe("committed");
		expect(mockUploadEncryptedPoC).toHaveBeenCalledTimes(1);
		expect(publicClient.simulateContract).toHaveBeenCalledTimes(1);
		expect(walletClient.writeContract).toHaveBeenCalledTimes(1);
		expect(window.localStorage.getItem(COMMIT_REVEAL_RECOVERY_KEY)).toBeNull();
	});

	it("ignores committed recovery context even when on-chain salt mismatches", async () => {
		window.localStorage.setItem(
			COMMIT_REVEAL_RECOVERY_KEY,
			JSON.stringify({
				version: 1,
				projectId: "1",
				auditor: MOCK_AUDITOR_ADDRESS,
				salt: "0x1111111111111111111111111111111111111111111111111111111111111111",
				cipherURI:
					"oasis://oasis-sapphire-testnet/0x1111111111111111111111111111111111111111/slot-42#0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
				commitHash:
					"0x2222222222222222222222222222222222222222222222222222222222222222",
				oasisTxHash:
					"0x3333333333333333333333333333333333333333333333333333333333333333",
				submissionId: "8",
			}),
		);

		const walletClient = {
			writeContract: vi.fn().mockResolvedValue("0xcommit"),
			signTypedData: vi.fn(),
		};

		const publicClient = {
			readContract: vi
				.fn()
				.mockImplementation(({ functionName }: { functionName: string }) => {
					if (functionName === "submissions") {
						return buildSubmissionTuple({
							commitHash:
								"0x2222222222222222222222222222222222222222222222222222222222222222",
							salt: "0x4444444444444444444444444444444444444444444444444444444444444444",
						});
					}
					return true;
				}),
			simulateContract: vi.fn().mockResolvedValue({ request: { to: "0xabc" } }),
			waitForTransactionReceipt: vi.fn().mockResolvedValue({
				logs: [buildPoCCommittedLog(8n)],
			}),
		};

		mockUseWallet.mockReturnValue({
			address: "0x1111111111111111111111111111111111111111",
			walletClient,
			publicClient,
			isConnected: true,
		});

		const { result } = renderHook(() => usePoCSubmission(1n));

		await waitFor(() => {
			expect(window.localStorage.getItem(COMMIT_REVEAL_RECOVERY_KEY)).toBeNull();
		});

		await act(async () => {
			await result.current.submitPoC(1n, '{"poc":"json"}');
		});

		expect(result.current.state.phase).toBe("committed");
		expect(publicClient.simulateContract).toHaveBeenCalledTimes(1);
		expect(walletClient.writeContract).toHaveBeenCalledTimes(1);
	});

	it("fails when commit receipt is missing PoCCommitted event", async () => {
		const walletClient = {
			writeContract: vi.fn().mockResolvedValue("0xcommit"),
			signTypedData: vi.fn().mockResolvedValue("0xsigned"),
		};

		const publicClient = {
			readContract: vi
				.fn()
				.mockImplementation(({ functionName }: { functionName: string }) => {
					if (functionName === "submissions") {
						return buildSubmissionTuple();
					}
					if (functionName === "sigNonces") {
						return 0n;
					}
					if (functionName === "queuedReveals") {
						return buildQueuedRevealTuple();
					}
					return true;
				}),
			simulateContract: vi.fn().mockResolvedValue({ request: { to: "0xabc" } }),
			waitForTransactionReceipt: vi.fn().mockResolvedValue({ logs: [] }),
		};

		mockUseWallet.mockReturnValue({
			address: "0x1111111111111111111111111111111111111111",
			walletClient,
			publicClient,
			isConnected: true,
		});

		const { result } = renderHook(() => usePoCSubmission(1n));

		let submitResult:
			| {
					submissionId?: bigint;
					commitTxHash?: `0x${string}`;
			  }
			| undefined;

		await act(async () => {
			submitResult = await result.current.submitPoC(1n, '{"poc":"json"}');
		});

	expect(submitResult).toBeUndefined();
	expect(result.current.state.phase).toBe("failed");
	expect(result.current.state.error).toContain(
		"PoCCommitted event was missing",
	);
	});

	it("recovers committed state from on-chain indexes when retry hits cooldown after a successful commit", async () => {
		const walletClient = {
			writeContract: vi.fn(),
			signTypedData: vi.fn().mockResolvedValue("0xsigned"),
		};

		const publicClient = {
			readContract: vi
				.fn()
				.mockImplementation(({ functionName, args }: { functionName: string; args?: unknown[] }) => {
					if (functionName === "getAuditorSubmissionIds") {
						return [[8n], 0n];
					}
					if (functionName === "submissions") {
						const submissionId = Array.isArray(args) ? (args[0] as bigint) : 0n;
						if (submissionId === 8n) {
							return buildSubmissionTuple({
								projectId: 1n,
								commitHash: MOCK_COMPUTED_COMMIT_HASH,
							});
						}
						return buildSubmissionTuple();
					}
					if (functionName === "sigNonces") {
						return 0n;
					}
					if (functionName === "queuedReveals") {
						return buildQueuedRevealTuple();
					}
					return true;
				}),
			simulateContract: vi.fn().mockRejectedValue(new Error("Cooldown active")),
			waitForTransactionReceipt: vi.fn(),
		};

		mockUseWallet.mockReturnValue({
			address: "0x1111111111111111111111111111111111111111",
			walletClient,
			publicClient,
			isConnected: true,
		});

		const { result } = renderHook(() => usePoCSubmission(1n));

		let submitResult:
			| {
					submissionId?: bigint;
					commitTxHash?: `0x${string}`;
			  }
			| undefined;

		await act(async () => {
			submitResult = await result.current.submitPoC(1n, '{"poc":"json"}');
		});

		expect(submitResult).toEqual({ submissionId: 8n });
		expect(result.current.state.phase).toBe("committed");
		expect(result.current.state.submissionId).toBe(8n);
		expect(result.current.state.error).toBeUndefined();
		expect(walletClient.writeContract).not.toHaveBeenCalled();
		expect(publicClient.readContract).toHaveBeenCalledWith(
			expect.objectContaining({ functionName: "getAuditorSubmissionIds" }),
		);
	});
});
