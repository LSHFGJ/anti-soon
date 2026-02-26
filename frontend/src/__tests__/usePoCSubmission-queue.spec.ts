import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUseWallet = vi.fn();
const mockGenerateRandomSalt = vi.fn();
const mockComputeCommitHash = vi.fn();
const mockUploadEncryptedPoC = vi.fn();
const mockQueueRevealIfEnabled = vi.fn();

vi.mock("../hooks/useWallet", () => ({
	useWallet: () => mockUseWallet(),
}));

vi.mock("../utils/encryption", () => ({
	generateRandomSalt: () => mockGenerateRandomSalt(),
	computeCommitHash: (...args: unknown[]) => mockComputeCommitHash(...args),
}));

vi.mock("../lib/ipfsUpload", () => ({
	uploadEncryptedPoC: (...args: unknown[]) => mockUploadEncryptedPoC(...args),
}));

vi.mock("../lib/revealQueue", () => ({
	queueRevealIfEnabled: (...args: unknown[]) =>
		mockQueueRevealIfEnabled(...args),
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

describe("usePoCSubmission queue fallback", () => {
	beforeEach(() => {
		vi.clearAllMocks();

		mockUseWallet.mockReturnValue({
			address: "0x1111111111111111111111111111111111111111",
			walletClient: {
				writeContract: vi.fn().mockResolvedValue("0xcommit"),
			},
			publicClient: {
				readContract: vi.fn().mockResolvedValue([]),
				simulateContract: vi.fn().mockResolvedValue({ request: { to: "0xabc" } }),
				waitForTransactionReceipt: vi.fn(),
			},
			isConnected: true,
		});

		mockGenerateRandomSalt.mockReturnValue("0x1234");
		mockComputeCommitHash.mockReturnValue("0x9abc");
		mockUploadEncryptedPoC.mockResolvedValue(
			"oasis://oasis-sapphire-testnet/0x1111111111111111111111111111111111111111/slot-42#0xabc",
		);
		mockQueueRevealIfEnabled.mockResolvedValue(null);
	});

	it("keeps commit result when optional queueing fails", async () => {
		const receiptDeferred = deferred<{
			logs: Array<{ data: `0x${string}`; topics: `0x${string}`[] }>;
		}>();

		const walletClient = {
			writeContract: vi.fn().mockResolvedValue("0xcommit"),
		};
		const publicClient = {
			readContract: vi.fn().mockResolvedValue([]),
			simulateContract: vi.fn().mockResolvedValue({ request: { to: "0xabc" } }),
			waitForTransactionReceipt: vi.fn().mockReturnValue(receiptDeferred.promise),
		};

		mockUseWallet.mockReturnValue({
			address: "0x1111111111111111111111111111111111111111",
			walletClient,
			publicClient,
			isConnected: true,
		});

		mockQueueRevealIfEnabled.mockRejectedValue(new Error("queue unavailable"));

		const { result } = renderHook(() => usePoCSubmission());

		let submitPromise!: Promise<
			| { submissionId?: bigint; commitTxHash?: `0x${string}`; revealTxHash?: `0x${string}` }
			| undefined
		>;
		await act(async () => {
			submitPromise = result.current.submitPoC(1n, '{"poc":"json"}');
		});

		await act(async () => {
			receiptDeferred.resolve({ logs: [] });
		});

		let submitResult:
			| { submissionId?: bigint; commitTxHash?: `0x${string}`; revealTxHash?: `0x${string}` }
			| undefined;
		await act(async () => {
			submitResult = await submitPromise;
		});

		expect(result.current.state.phase).toBe("committed");
		expect(submitResult?.commitTxHash).toBe("0xcommit");
		expect(mockUploadEncryptedPoC).toHaveBeenCalledWith(
			expect.objectContaining({
				poc: '{"poc":"json"}',
				projectId: 1n,
				auditor: "0x1111111111111111111111111111111111111111",
			}),
		);
	});
});
