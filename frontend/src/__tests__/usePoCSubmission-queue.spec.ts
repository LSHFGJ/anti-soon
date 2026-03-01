import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { keccak256, toBytes } from "viem";

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
const MOCK_AUDITOR_ADDRESS =
	"0x1111111111111111111111111111111111111111";
const MOCK_COMMIT_HASH =
	"0x1111111111111111111111111111111111111111111111111111111111111111";

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

describe("usePoCSubmission lifecycle", () => {
	beforeEach(() => {
		vi.clearAllMocks();

		mockUseWallet.mockReturnValue({
			address: "0x1111111111111111111111111111111111111111",
			walletClient: {
				writeContract: vi.fn().mockResolvedValue("0xcommit"),
			},
			publicClient: {
				readContract: vi.fn().mockResolvedValue(true),
				simulateContract: vi.fn().mockResolvedValue({ request: { to: "0xabc" } }),
				waitForTransactionReceipt: vi.fn(),
			},
			isConnected: true,
		});

		mockGenerateRandomSalt.mockReturnValue("0x1234");
		mockComputeCommitHash.mockReturnValue("0x9abc");
		mockUploadEncryptedPoC.mockResolvedValue(
			{
				cipherURI:
					"oasis://oasis-sapphire-testnet/0x1111111111111111111111111111111111111111/slot-42#0xabc",
				oasisTxHash:
					"0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
			},
		);
	});

	it("commits then reveals and returns both transaction hashes", async () => {
		const receiptDeferred = deferred<{
			logs: Array<{ data: `0x${string}`; topics: `0x${string}`[] }>;
		}>();
		const revealReceiptDeferred = deferred<{ logs: Array<{ data: `0x${string}`; topics: `0x${string}`[] }> }>();

		const walletClient = {
			writeContract: vi
				.fn()
				.mockResolvedValueOnce("0xcommit")
				.mockResolvedValueOnce("0xreveal"),
		};
		const publicClient = {
			readContract: vi.fn().mockResolvedValue(true),
			simulateContract: vi.fn().mockResolvedValue({ request: { to: "0xabc" } }),
			waitForTransactionReceipt: vi
				.fn()
				.mockReturnValueOnce(receiptDeferred.promise)
				.mockReturnValueOnce(revealReceiptDeferred.promise),
		};

		mockUseWallet.mockReturnValue({
			address: "0x1111111111111111111111111111111111111111",
			walletClient,
			publicClient,
			isConnected: true,
		});

		const { result } = renderHook(() => usePoCSubmission());

		let submitPromise!: Promise<
			| { submissionId?: bigint; commitTxHash?: `0x${string}`; revealTxHash?: `0x${string}` }
			| undefined
		>;
		await act(async () => {
			submitPromise = result.current.submitPoC(1n, '{"poc":"json"}');
		});

		await act(async () => {
			receiptDeferred.resolve({ logs: [buildPoCCommittedLog(7n)] });
		});
		await act(async () => {
			revealReceiptDeferred.resolve({ logs: [] });
		});

		let submitResult:
			| { submissionId?: bigint; commitTxHash?: `0x${string}`; revealTxHash?: `0x${string}` }
			| undefined;
		await act(async () => {
			submitResult = await submitPromise;
		});

		expect(result.current.state.phase).toBe("revealed");
		expect(submitResult?.commitTxHash).toBe("0xcommit");
		expect(submitResult?.revealTxHash).toBe("0xreveal");
		expect(mockUploadEncryptedPoC).toHaveBeenCalledWith(
			expect.objectContaining({
				poc: '{"poc":"json"}',
				projectId: 1n,
				auditor: "0x1111111111111111111111111111111111111111",
			}),
		);
	});

	it("surfaces shortMessage when submission throws provider-style object", async () => {
		mockUploadEncryptedPoC.mockRejectedValue({
			shortMessage: "Execution reverted: commit window closed",
		});

		const { result } = renderHook(() => usePoCSubmission());

		let submitResult:
			| { submissionId?: bigint; commitTxHash?: `0x${string}`; revealTxHash?: `0x${string}` }
			| undefined;

		await act(async () => {
			submitResult = await result.current.submitPoC(1n, '{"poc":"json"}');
		});

		expect(submitResult).toBeUndefined();
		expect(result.current.state.phase).toBe("failed");
		expect(result.current.state.error).toContain("Execution reverted: commit window closed");
		expect(result.current.state.error).not.toContain("unknown error");
	});

	it("normalizes invalid-address submission errors to wallet guidance", async () => {
		mockUploadEncryptedPoC.mockRejectedValue({
			shortMessage: "Invalid parameters: must provide an Ethereum address.",
		});

		const { result } = renderHook(() => usePoCSubmission());

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
				.mockResolvedValueOnce("0xreveal"),
			getAddresses: vi
				.fn()
				.mockResolvedValue(["0x1111111111111111111111111111111111111111"]),
		};

		const publicClient = {
			readContract: vi.fn().mockResolvedValue(true),
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

		const { result } = renderHook(() => usePoCSubmission());

		await act(async () => {
			await result.current.submitPoC(1n, '{"poc":"json"}');
		});

		expect(result.current.state.phase).toBe("revealed");
		expect(mockUploadEncryptedPoC).toHaveBeenCalledWith(
			expect.objectContaining({
				auditor: "0x1111111111111111111111111111111111111111",
			}),
		);
	});

	it("fails when commit receipt is missing PoCCommitted event", async () => {
		const walletClient = {
			writeContract: vi.fn().mockResolvedValue("0xcommit"),
		};

		const publicClient = {
			readContract: vi.fn().mockResolvedValue(true),
			simulateContract: vi.fn().mockResolvedValue({ request: { to: "0xabc" } }),
			waitForTransactionReceipt: vi.fn().mockResolvedValue({ logs: [] }),
		};

		mockUseWallet.mockReturnValue({
			address: "0x1111111111111111111111111111111111111111",
			walletClient,
			publicClient,
			isConnected: true,
		});

		const { result } = renderHook(() => usePoCSubmission());

		let submitResult:
			| { submissionId?: bigint; commitTxHash?: `0x${string}`; revealTxHash?: `0x${string}` }
			| undefined;

		await act(async () => {
			submitResult = await result.current.submitPoC(1n, '{"poc":"json"}');
		});

		expect(submitResult).toBeUndefined();
		expect(result.current.state.phase).toBe("failed");
		expect(result.current.state.error).toContain("PoCCommitted event was missing");
	});
});
