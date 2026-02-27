import { act, renderHook } from "@testing-library/react";
import { keccak256, toBytes } from "viem";
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

vi.mock("../lib/oasisUpload", () => ({
	uploadEncryptedPoC: (...args: unknown[]) => mockUploadEncryptedPoC(...args),
}));

vi.mock("../lib/revealQueue", () => ({
	queueRevealIfEnabled: (...args: unknown[]) =>
		mockQueueRevealIfEnabled(...args),
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

describe("commit/reveal lifecycle state model", () => {
	beforeEach(() => {
		vi.clearAllMocks();

		mockUseWallet.mockReturnValue({
			address: null,
			walletClient: undefined,
			publicClient: undefined,
			isConnected: false,
		});

		mockGenerateRandomSalt.mockReturnValue("0x1234");
		mockComputeCommitHash.mockReturnValue("0x9abc");
		mockUploadEncryptedPoC.mockResolvedValue({
			cipherURI:
				"oasis://oasis-sapphire-testnet/0x1111111111111111111111111111111111111111/slot-42#0xabc",
			decryptionKey:
				"0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
			oasisTxHash:
				"0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
		});
		mockQueueRevealIfEnabled.mockResolvedValue(null);
	});

	it("keeps lifecycle phases aligned across both hooks", () => {
		expect(SUBMISSION_LIFECYCLE_PHASES).toEqual([
			"idle",
			"encrypting",
			"committing",
			"committed",
			"queued",
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
				waitForTransactionReceipt: vi.fn().mockResolvedValue({ logs: [] }),
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
				waitForTransactionReceipt: vi.fn().mockResolvedValue({ logs: [] }),
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

	it("uses deterministic commit transition ordering and supports reset recovery", async () => {
		const waitReceiptDeferred = deferred<{
			logs: Array<{ data: `0x${string}`; topics: `0x${string}`[] }>;
		}>();
		const uploadDeferred = deferred<{
			cipherURI: string;
			decryptionKey: `0x${string}`;
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
					decryptionKey:
						"0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
					oasisTxHash:
						"0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
				},
			);
			await Promise.resolve();
		});

		expect(result.current.state.phase).toBe("committing");

		await act(async () => {
			waitReceiptDeferred.resolve({ logs: [] });
			await commitPromise;
		});

		expect(mockComputeCommitHash).toHaveBeenCalledWith(
			keccak256(toBytes("oasis://oasis-sapphire-testnet/0x1111111111111111111111111111111111111111/slot-42#0xabc")),
			"0x1111111111111111111111111111111111111111",
			"0x1234",
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

	it("keeps committed phase when optional queueing fails", async () => {
		const waitReceiptDeferred = deferred<{
			logs: Array<{ data: `0x${string}`; topics: `0x${string}`[] }>;
		}>();
		const uploadDeferred = deferred<{
			cipherURI: string;
			decryptionKey: `0x${string}`;
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
		mockQueueRevealIfEnabled.mockRejectedValue(new Error("queue unavailable"));

		const { result } = renderHook(() => useCommitReveal(1n, '{"poc":"json"}'));

		let commitPromise!: Promise<void>;
		await act(async () => {
			commitPromise = result.current.commit();
		});

		await act(async () => {
			uploadDeferred.resolve(
				{
					cipherURI:
						"oasis://oasis-sapphire-testnet/0x1111111111111111111111111111111111111111/slot-42#0xabc",
					decryptionKey:
						"0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
					oasisTxHash:
						"0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
				},
			);
			await Promise.resolve();
		});

		await act(async () => {
			waitReceiptDeferred.resolve({ logs: [] });
			await commitPromise;
		});

		expect(result.current.state.phase).toBe("committed");
	});
});
