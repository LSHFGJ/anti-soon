import {
	decodeFunctionData,
	encodeAbiParameters,
	encodeEventTopics,
	keccak256,
	parseAbi,
	parseAbiParameters,
	toBytes,
} from "viem";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@oasisprotocol/sapphire-paratime", () => ({
	wrapEthereumProvider: (provider: unknown) => provider,
}));

import { uploadEncryptedPoC } from "../lib/oasisUpload";

const OASIS_STORAGE_ABI = parseAbi([
	"function write(string slotId, string payload)",
	"function read(string slotId) view returns (string payload)",
	"function readMeta(string slotId) view returns (address writer, uint256 storedAt)",
	"event PoCStored(bytes32 indexed slotKey, address indexed writer, uint256 storedAt, bytes32 payloadHash)",
]);

type ProviderRequest = {
	method: string;
	params?: unknown[];
};

function createMockProvider(
	txHash: `0x${string}`,
	account = "0x1111111111111111111111111111111111111111",
	options?: {
		readPayloadBySlot?: Record<string, string>;
		readWriterBySlot?: Record<string, `0x${string}`>;
		enforceReadAuthorization?: boolean;
		readAuthorizationErrorMessage?: string;
		forceReadErrorMessage?: string;
		forceReadMetaErrorMessage?: string;
		writeAuthorizationErrorMessage?: string;
		forceWriteErrorMessage?: string;
		forceGetTxByHashErrorMessage?: string;
		returnNullTransactionByHash?: boolean;
		failReceiptAfterFirstLookup?: boolean;
		receiptOverride?: {
			status?: string;
			transactionHash?: `0x${string}`;
			to?: string | null;
			logs?: unknown;
		};
		transactionByHashOverride?: {
			to?: string;
			input?: string;
			from?: string;
		};
	},
) {
	const calls: ProviderRequest[] = [];
	const slotPayloads = new Map<string, string>();
	const slotWriters = new Map<string, `0x${string}`>();
	let latestTxRequest:
		| { data?: `0x${string}`; from?: string; to?: string }
		| undefined;
	let receiptLookupCount = 0;

	if (options?.readPayloadBySlot) {
		for (const [slotId, payload] of Object.entries(options.readPayloadBySlot)) {
			slotPayloads.set(slotId, payload);
		}
	}

	if (options?.readWriterBySlot) {
		for (const [slotId, writer] of Object.entries(options.readWriterBySlot)) {
			slotWriters.set(slotId, writer.toLowerCase() as `0x${string}`);
		}
	}

	const provider = {
		request: vi.fn(async ({ method, params }: ProviderRequest) => {
			calls.push({ method, params });
			if (method === "eth_chainId") return "0x5aff";
			if (method === "eth_accounts") return [account];
			if (method === "eth_requestAccounts") return [account];
			if (method === "eth_sendTransaction") {
				const txRequest = params?.[0] as
					| { data?: `0x${string}`; from?: string }
					| undefined;
				latestTxRequest = txRequest;
				if (txRequest?.data) {
					const decodedWrite = decodeFunctionData({
						abi: OASIS_STORAGE_ABI,
						data: txRequest.data,
					});

					if (decodedWrite.functionName === "write") {
						const slotId = decodedWrite.args?.[0] as string;
						const payload = decodedWrite.args?.[1] as string;
						const writer = (
							txRequest.from ?? account
						).toLowerCase() as `0x${string}`;

						if (options?.forceWriteErrorMessage) {
							throw new Error(options.forceWriteErrorMessage);
						}

						const existingWriter = slotWriters.get(slotId);
						if (existingWriter && existingWriter !== writer) {
							throw new Error(
								options?.writeAuthorizationErrorMessage ??
									"execution reverted: Not authorized",
							);
						}

						slotPayloads.set(slotId, payload);
						slotWriters.set(slotId, writer);
					}
				}
				return txHash;
			}

			if (method === "eth_call") {
				const call = params?.[0] as
					| { data?: `0x${string}`; from?: string }
					| undefined;
				if (!call?.data) throw new Error("eth_call missing data");

				const decodedRead = decodeFunctionData({
					abi: OASIS_STORAGE_ABI,
					data: call.data,
				});

				if (decodedRead.functionName === "read") {
					if (options?.forceReadErrorMessage) {
						throw new Error(options.forceReadErrorMessage);
					}

					const slotId = decodedRead.args?.[0] as string;
					const payload = slotPayloads.get(slotId);
					if (!payload) {
						throw new Error(`No payload in mock provider for slot ${slotId}`);
					}

					const writer = slotWriters.get(slotId);
					const callFrom =
						typeof call.from === "string" ? call.from.toLowerCase() : undefined;
					if (
						options?.enforceReadAuthorization &&
						writer &&
						callFrom !== writer.toLowerCase()
					) {
						throw new Error(
							options.readAuthorizationErrorMessage ??
								"execution reverted: Not authorized",
						);
					}

					return encodeAbiParameters(parseAbiParameters("string"), [payload]);
				}

				if (decodedRead.functionName === "readMeta") {
					if (options?.forceReadMetaErrorMessage) {
						throw new Error(options.forceReadMetaErrorMessage);
					}

					const slotId = decodedRead.args?.[0] as string;
					const writer =
						slotWriters.get(slotId) ?? (account.toLowerCase() as `0x${string}`);
					return encodeAbiParameters(parseAbiParameters("address, uint256"), [
						writer,
						1n,
					]);
				}

				throw new Error(
					`Unexpected eth_call function: ${decodedRead.functionName}`,
				);
			}

			if (method === "eth_getTransactionReceipt") {
				receiptLookupCount += 1;
				if (options?.failReceiptAfterFirstLookup && receiptLookupCount > 1) {
					throw new Error("receipt lookup unavailable");
				}

				const derivedReceiptLogs = (() => {
					if (!latestTxRequest?.data || !latestTxRequest?.to) {
						return undefined;
					}

					try {
						const decodedWrite = decodeFunctionData({
							abi: OASIS_STORAGE_ABI,
							data: latestTxRequest.data,
						});
						if (decodedWrite.functionName !== "write") {
							return undefined;
						}

						const slotId = decodedWrite.args?.[0];
						const payload = decodedWrite.args?.[1];
						if (typeof slotId !== "string" || typeof payload !== "string") {
							return undefined;
						}

						const writer = (
							latestTxRequest.from ?? account
						).toLowerCase() as `0x${string}`;
						const topics = encodeEventTopics({
							abi: OASIS_STORAGE_ABI,
							eventName: "PoCStored",
							args: {
								slotKey: keccak256(toBytes(slotId)),
								writer,
							},
						}) as readonly `0x${string}`[];
						const data = encodeAbiParameters(
							parseAbiParameters("uint256, bytes32"),
							[1n, keccak256(toBytes(payload))],
						);

						return [
							{
								address: latestTxRequest.to,
								topics,
								data,
							},
						];
					} catch {
						return undefined;
					}
				})();

				return {
					status: "0x1",
					transactionHash: txHash,
					to: latestTxRequest?.to ?? null,
					logs: derivedReceiptLogs,
					...(options?.receiptOverride ?? {}),
				};
			}

			if (method === "eth_getTransactionByHash") {
				if (options?.forceGetTxByHashErrorMessage) {
					throw new Error(options.forceGetTxByHashErrorMessage);
				}

				if (options?.returnNullTransactionByHash) {
					return null;
				}

				const override = options?.transactionByHashOverride;
				return {
					hash: txHash,
					to: override?.to ?? latestTxRequest?.to,
					from: override?.from ?? latestTxRequest?.from ?? account,
					input: override?.input ?? latestTxRequest?.data,
				};
			}

			if (method === "wallet_switchEthereumChain") return null;
			if (method === "wallet_addEthereumChain") return null;
			throw new Error(`Unexpected method: ${method}`);
		}),
	};

	return { provider, calls };
}

function setRuntimeStorageContract(value?: string) {
	const runtime = globalThis as {
		__ANTI_SOON_OASIS_STORAGE_CONTRACT__?: string;
	};
	const previous = runtime.__ANTI_SOON_OASIS_STORAGE_CONTRACT__;

	if (typeof value === "string") {
		runtime.__ANTI_SOON_OASIS_STORAGE_CONTRACT__ = value;
	} else {
		delete runtime.__ANTI_SOON_OASIS_STORAGE_CONTRACT__;
	}

	return () => {
		if (typeof previous === "string") {
			runtime.__ANTI_SOON_OASIS_STORAGE_CONTRACT__ = previous;
		} else {
			delete runtime.__ANTI_SOON_OASIS_STORAGE_CONTRACT__;
		}
	};
}

describe("oasis upload helper", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("uses relayer API when VITE_OASIS_UPLOAD_API_URL is configured", async () => {
		const previousFetch = globalThis.fetch;
		const previousRuntimeUrl = (
			globalThis as { __ANTI_SOON_OASIS_UPLOAD_API_URL__?: string }
		).__ANTI_SOON_OASIS_UPLOAD_API_URL__;
		(
			globalThis as { __ANTI_SOON_OASIS_UPLOAD_API_URL__?: string }
		).__ANTI_SOON_OASIS_UPLOAD_API_URL__ = "https://relay.example/upload";

		const fetchMock = vi.fn(async () => ({
			ok: true,
			status: 200,
			json: async () => ({
				cipherURI:
					"oasis://oasis-sapphire-testnet/0x000000000000000000000000000000000000dead/slot-1#0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
				oasisTxHash: `0x${"a".repeat(64)}`,
			}),
			text: async () => "",
		}));

		vi.stubGlobal("fetch", fetchMock);

		const envelopeHash = `0x${"a".repeat(64)}`;
		const { provider, calls } = createMockProvider(
			`0x${"f".repeat(64)}` as const,
			"0x1111111111111111111111111111111111111111",
			{
				readPayloadBySlot: {
					"slot-1": JSON.stringify({
						envelopeHash,
						pointer: {
							slotId: "slot-1",
							contract: "0x000000000000000000000000000000000000dead",
						},
					}),
				},
			},
		);

		try {
			const result = await uploadEncryptedPoC({
				poc: '{"target":"dummy"}',
				projectId: 7n,
				auditor: "0x2222222222222222222222222222222222222222",
				ethereumProvider: provider as unknown,
			});

			expect(fetchMock).toHaveBeenCalledWith(
				"https://relay.example/upload",
				expect.objectContaining({ method: "POST" }),
			);
			expect(result.cipherURI).toContain("oasis://");
			expect(
				calls.some((call) => call.method === "eth_getTransactionReceipt"),
			).toBe(true);
			expect(calls.some((call) => call.method === "eth_call")).toBe(true);
		} finally {
			(
				globalThis as { __ANTI_SOON_OASIS_UPLOAD_API_URL__?: string }
			).__ANTI_SOON_OASIS_UPLOAD_API_URL__ = previousRuntimeUrl;
			if (previousFetch) {
				globalThis.fetch = previousFetch;
			} else {
				delete (globalThis as { fetch?: typeof fetch }).fetch;
			}
		}
	});

	it("falls back to storage writer identity when relayer readback returns Not authorized for wallet caller", async () => {
		const previousFetch = globalThis.fetch;
		const previousRuntimeUrl = (
			globalThis as { __ANTI_SOON_OASIS_UPLOAD_API_URL__?: string }
		).__ANTI_SOON_OASIS_UPLOAD_API_URL__;
		(
			globalThis as { __ANTI_SOON_OASIS_UPLOAD_API_URL__?: string }
		).__ANTI_SOON_OASIS_UPLOAD_API_URL__ = "https://relay.example/upload";

		const fetchMock = vi.fn(async () => ({
			ok: true,
			status: 200,
			json: async () => ({
				cipherURI:
					"oasis://oasis-sapphire-testnet/0x000000000000000000000000000000000000dead/slot-1#0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
				oasisTxHash: `0x${"a".repeat(64)}`,
			}),
			text: async () => "",
		}));

		vi.stubGlobal("fetch", fetchMock);

		const relayerWriter = "0x9999999999999999999999999999999999999999";
		const { provider, calls } = createMockProvider(
			`0x${"f".repeat(64)}` as const,
			"0x1111111111111111111111111111111111111111",
			{
				enforceReadAuthorization: true,
				readWriterBySlot: {
					"slot-1": relayerWriter,
				},
				readPayloadBySlot: {
					"slot-1": JSON.stringify({
						envelopeHash: `0x${"a".repeat(64)}`,
						pointer: {
							slotId: "slot-1",
							contract: "0x000000000000000000000000000000000000dead",
						},
					}),
				},
			},
		);

		try {
			const result = await uploadEncryptedPoC({
				poc: '{"target":"dummy"}',
				projectId: 7n,
				auditor: "0x2222222222222222222222222222222222222222",
				ethereumProvider: provider as unknown,
			});

			expect(result.cipherURI).toContain("oasis://");

			const readCalls = calls.filter((call) => call.method === "eth_call");
			const firstRead = readCalls[0]?.params?.[0] as
				| { from?: string }
				| undefined;
			const secondRead = readCalls[2]?.params?.[0] as
				| { from?: string }
				| undefined;

			expect(readCalls.length).toBeGreaterThanOrEqual(3);
			expect(firstRead?.from?.toLowerCase()).toBe(
				"0x1111111111111111111111111111111111111111",
			);
			expect(secondRead?.from?.toLowerCase()).toBe(relayerWriter);
		} finally {
			(
				globalThis as { __ANTI_SOON_OASIS_UPLOAD_API_URL__?: string }
			).__ANTI_SOON_OASIS_UPLOAD_API_URL__ = previousRuntimeUrl;
			if (previousFetch) {
				globalThis.fetch = previousFetch;
			} else {
				delete (globalThis as { fetch?: typeof fetch }).fetch;
			}
		}
	});

	it("falls back to storage writer identity when wallet reports generic Internal JSON-RPC error for read authorization revert", async () => {
		const previousFetch = globalThis.fetch;
		const previousRuntimeUrl = (
			globalThis as { __ANTI_SOON_OASIS_UPLOAD_API_URL__?: string }
		).__ANTI_SOON_OASIS_UPLOAD_API_URL__;
		(
			globalThis as { __ANTI_SOON_OASIS_UPLOAD_API_URL__?: string }
		).__ANTI_SOON_OASIS_UPLOAD_API_URL__ = "https://relay.example/upload";

		const fetchMock = vi.fn(async () => ({
			ok: true,
			status: 200,
			json: async () => ({
				cipherURI:
					"oasis://oasis-sapphire-testnet/0x000000000000000000000000000000000000dead/slot-1#0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
				oasisTxHash: `0x${"a".repeat(64)}`,
			}),
			text: async () => "",
		}));

		vi.stubGlobal("fetch", fetchMock);

		const relayerWriter = "0x9999999999999999999999999999999999999999";
		const { provider, calls } = createMockProvider(
			`0x${"f".repeat(64)}` as const,
			"0x1111111111111111111111111111111111111111",
			{
				enforceReadAuthorization: true,
				readAuthorizationErrorMessage: "Internal JSON-RPC error.",
				readWriterBySlot: {
					"slot-1": relayerWriter,
				},
				readPayloadBySlot: {
					"slot-1": JSON.stringify({
						envelopeHash: `0x${"a".repeat(64)}`,
						pointer: {
							slotId: "slot-1",
							contract: "0x000000000000000000000000000000000000dead",
						},
					}),
				},
			},
		);

		try {
			const result = await uploadEncryptedPoC({
				poc: '{"target":"dummy"}',
				projectId: 7n,
				auditor: "0x2222222222222222222222222222222222222222",
				ethereumProvider: provider as unknown,
			});

			expect(result.cipherURI).toContain("oasis://");

			const readCalls = calls.filter((call) => call.method === "eth_call");
			const firstRead = readCalls[0]?.params?.[0] as
				| { from?: string }
				| undefined;
			const secondRead = readCalls[2]?.params?.[0] as
				| { from?: string }
				| undefined;

			expect(readCalls.length).toBeGreaterThanOrEqual(3);
			expect(firstRead?.from?.toLowerCase()).toBe(
				"0x1111111111111111111111111111111111111111",
			);
			expect(secondRead?.from?.toLowerCase()).toBe(relayerWriter);
		} finally {
			(
				globalThis as { __ANTI_SOON_OASIS_UPLOAD_API_URL__?: string }
			).__ANTI_SOON_OASIS_UPLOAD_API_URL__ = previousRuntimeUrl;
			if (previousFetch) {
				globalThis.fetch = previousFetch;
			} else {
				delete (globalThis as { fetch?: typeof fetch }).fetch;
			}
		}
	});

	it("fails closed when relayer readback payload does not match cipherURI envelope hash", async () => {
		const previousFetch = globalThis.fetch;
		const previousRuntimeUrl = (
			globalThis as { __ANTI_SOON_OASIS_UPLOAD_API_URL__?: string }
		).__ANTI_SOON_OASIS_UPLOAD_API_URL__;

		(
			globalThis as { __ANTI_SOON_OASIS_UPLOAD_API_URL__?: string }
		).__ANTI_SOON_OASIS_UPLOAD_API_URL__ = "https://relay.example/upload";

		const fetchMock = vi.fn(async () => ({
			ok: true,
			status: 200,
			json: async () => ({
				cipherURI:
					"oasis://oasis-sapphire-testnet/0x000000000000000000000000000000000000dead/slot-1#0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
				oasisTxHash: `0x${"a".repeat(64)}`,
			}),
			text: async () => "",
		}));

		vi.stubGlobal("fetch", fetchMock);

		const { provider } = createMockProvider(
			`0x${"f".repeat(64)}` as const,
			"0x1111111111111111111111111111111111111111",
			{
				readPayloadBySlot: {
					"slot-1": JSON.stringify({
						envelopeHash: `0x${"b".repeat(64)}`,
						pointer: {
							slotId: "slot-1",
							contract: "0x000000000000000000000000000000000000dead",
						},
					}),
				},
			},
		);

		try {
			await expect(
				uploadEncryptedPoC({
					poc: '{"target":"dummy"}',
					projectId: 7n,
					auditor: "0x2222222222222222222222222222222222222222",
					ethereumProvider: provider as unknown,
				}),
			).rejects.toThrow(
				"Sapphire readback validation failed: envelope hash does not match cipherURI",
			);
		} finally {
			(
				globalThis as { __ANTI_SOON_OASIS_UPLOAD_API_URL__?: string }
			).__ANTI_SOON_OASIS_UPLOAD_API_URL__ = previousRuntimeUrl;
			if (previousFetch) {
				globalThis.fetch = previousFetch;
			} else {
				delete (globalThis as { fetch?: typeof fetch }).fetch;
			}
		}
	});

	it("avoids initial write collision by choosing a collision-safe slot before direct Sapphire write", async () => {
		const restoreStorageContract = setRuntimeStorageContract(
			"0x000000000000000000000000000000000000dEaD",
		);

		const projectId = 7n;
		const poc = '{"target":"dummy"}';
		const walletAddress = "0x1111111111111111111111111111111111111111";
		const firstSlotSeed = `${projectId.toString()}:${walletAddress.toLowerCase()}:${poc}`;
		const firstSlotId = `slot-${keccak256(toBytes(firstSlotSeed)).slice(2, 18)}`;

		const { provider, calls } = createMockProvider(
			`0x${"f".repeat(64)}` as const,
			walletAddress,
			{
				readWriterBySlot: {
					[firstSlotId]: "0x9999999999999999999999999999999999999999",
				},
			},
		);

		try {
			const result = await uploadEncryptedPoC({
				poc,
				projectId,
				auditor: "0x2222222222222222222222222222222222222222",
				ethereumProvider: provider as unknown,
			});

			expect(result.cipherURI).toContain("oasis://");

			const sendCalls = calls.filter(
				(call) => call.method === "eth_sendTransaction",
			);
			expect(sendCalls).toHaveLength(1);

			const firstSendData = (
				sendCalls[0]?.params?.[0] as { data?: `0x${string}` } | undefined
			)?.data;
			expect(firstSendData).toBeTypeOf("string");

			const firstWrite = decodeFunctionData({
				abi: OASIS_STORAGE_ABI,
				data: firstSendData as `0x${string}`,
			});

			expect(firstWrite.args?.[0]).not.toBe(firstSlotId);
		} finally {
			restoreStorageContract();
		}
	});

	it("continues to commit flow when readback returns Not authorized but write tx proof matches", async () => {
		const restoreStorageContract = setRuntimeStorageContract(
			"0x000000000000000000000000000000000000dEaD",
		);

		const { provider, calls } = createMockProvider(
			`0x${"f".repeat(64)}` as const,
			"0x1111111111111111111111111111111111111111",
			{
				forceReadErrorMessage: "execution reverted: Not authorized",
			},
		);

		try {
			const result = await uploadEncryptedPoC({
				poc: '{"target":"dummy"}',
				projectId: 7n,
				auditor: "0x2222222222222222222222222222222222222222",
				ethereumProvider: provider as unknown,
			});

			expect(result.cipherURI).toContain("oasis://");

			const sendCalls = calls.filter(
				(call) => call.method === "eth_sendTransaction",
			);
			expect(sendCalls).toHaveLength(1);
			expect(
				calls.some((call) => call.method === "eth_getTransactionByHash"),
			).toBe(true);
		} finally {
			restoreStorageContract();
		}
	});

	it("continues to commit flow when tx lookup returns no object but receipt confirms success", async () => {
		const restoreStorageContract = setRuntimeStorageContract(
			"0x000000000000000000000000000000000000dEaD",
		);

		const { provider, calls } = createMockProvider(
			`0x${"f".repeat(64)}` as const,
			"0x1111111111111111111111111111111111111111",
			{
				forceReadErrorMessage: "execution reverted: Not authorized",
				returnNullTransactionByHash: true,
			},
		);

		try {
			const result = await uploadEncryptedPoC({
				poc: '{"target":"dummy"}',
				projectId: 7n,
				auditor: "0x2222222222222222222222222222222222222222",
				ethereumProvider: provider as unknown,
			});

			expect(result.cipherURI).toContain("oasis://");
			expect(
				calls.some((call) => call.method === "eth_getTransactionByHash"),
			).toBe(true);
			expect(
				calls.filter((call) => call.method === "eth_sendTransaction"),
			).toHaveLength(1);
		} finally {
			restoreStorageContract();
		}
	});

	it("continues when tx lookup calldata is undecodable but receipt logs prove write", async () => {
		const restoreStorageContract = setRuntimeStorageContract(
			"0x000000000000000000000000000000000000dEaD",
		);

		const { provider, calls } = createMockProvider(
			`0x${"f".repeat(64)}` as const,
			"0x1111111111111111111111111111111111111111",
			{
				forceReadErrorMessage: "execution reverted: Not authorized",
				transactionByHashOverride: {
					input: "0xa264626f",
				},
				failReceiptAfterFirstLookup: true,
			},
		);

		try {
			const result = await uploadEncryptedPoC({
				poc: '{"target":"dummy"}',
				projectId: 7n,
				auditor: "0x2222222222222222222222222222222222222222",
				ethereumProvider: provider as unknown,
			});

			expect(result.cipherURI).toContain("oasis://");
			expect(
				calls.some((call) => call.method === "eth_getTransactionByHash"),
			).toBe(true);
			expect(
				calls.filter((call) => call.method === "eth_sendTransaction"),
			).toHaveLength(1);
			expect(
				calls.filter((call) => call.method === "eth_getTransactionReceipt"),
			).toHaveLength(1);
		} finally {
			restoreStorageContract();
		}
	});

	it("continues when tx lookup target is mismatched but receipt logs prove write", async () => {
		const restoreStorageContract = setRuntimeStorageContract(
			"0x000000000000000000000000000000000000dEaD",
		);

		const { provider, calls } = createMockProvider(
			`0x${"f".repeat(64)}` as const,
			"0x1111111111111111111111111111111111111111",
			{
				forceReadErrorMessage: "execution reverted: Not authorized",
				transactionByHashOverride: {
					to: "0x000000000000000000000000000000000000beef",
				},
				failReceiptAfterFirstLookup: true,
			},
		);

		try {
			const result = await uploadEncryptedPoC({
				poc: '{"target":"dummy"}',
				projectId: 7n,
				auditor: "0x2222222222222222222222222222222222222222",
				ethereumProvider: provider as unknown,
			});

			expect(result.cipherURI).toContain("oasis://");
			expect(
				calls.filter((call) => call.method === "eth_getTransactionReceipt"),
			).toHaveLength(1);
		} finally {
			restoreStorageContract();
		}
	});

	it("fails closed when tx lookup target is mismatched and receipt logs cannot prove write", async () => {
		const restoreStorageContract = setRuntimeStorageContract(
			"0x000000000000000000000000000000000000dEaD",
		);

		const { provider, calls } = createMockProvider(
			`0x${"f".repeat(64)}` as const,
			"0x1111111111111111111111111111111111111111",
			{
				forceReadErrorMessage: "execution reverted: Not authorized",
				transactionByHashOverride: {
					to: "0x000000000000000000000000000000000000beef",
				},
				failReceiptAfterFirstLookup: true,
				receiptOverride: {
					logs: [],
				},
			},
		);

		try {
			await expect(
				uploadEncryptedPoC({
					poc: '{"target":"dummy"}',
					projectId: 7n,
					auditor: "0x2222222222222222222222222222222222222222",
					ethereumProvider: provider as unknown,
				}),
			).rejects.toThrow(
				"transaction proof fallback failed: receipt fallback logs do not contain matching PoCStored event",
			);
			expect(
				calls.filter((call) => call.method === "eth_getTransactionReceipt"),
			).toHaveLength(1);
		} finally {
			restoreStorageContract();
		}
	});

	it("fails closed when tx lookup calldata is undecodable and receipt logs cannot prove write", async () => {
		const restoreStorageContract = setRuntimeStorageContract(
			"0x000000000000000000000000000000000000dEaD",
		);

		const { provider, calls } = createMockProvider(
			`0x${"f".repeat(64)}` as const,
			"0x1111111111111111111111111111111111111111",
			{
				forceReadErrorMessage: "execution reverted: Not authorized",
				transactionByHashOverride: {
					input: "0xa264626f",
				},
				failReceiptAfterFirstLookup: true,
				receiptOverride: {
					logs: [],
				},
			},
		);

		try {
			await expect(
				uploadEncryptedPoC({
					poc: '{"target":"dummy"}',
					projectId: 7n,
					auditor: "0x2222222222222222222222222222222222222222",
					ethereumProvider: provider as unknown,
				}),
			).rejects.toThrow(
				"transaction proof fallback failed: receipt fallback logs do not contain matching PoCStored event",
			);
			expect(
				calls.filter((call) => call.method === "eth_getTransactionReceipt"),
			).toHaveLength(1);
		} finally {
			restoreStorageContract();
		}
	});

	it("continues when tx lookup is null and follow-up receipt lookup is unavailable", async () => {
		const restoreStorageContract = setRuntimeStorageContract(
			"0x000000000000000000000000000000000000dEaD",
		);

		const { provider, calls } = createMockProvider(
			`0x${"f".repeat(64)}` as const,
			"0x1111111111111111111111111111111111111111",
			{
				forceReadErrorMessage: "execution reverted: Not authorized",
				returnNullTransactionByHash: true,
				failReceiptAfterFirstLookup: true,
			},
		);

		try {
			const result = await uploadEncryptedPoC({
				poc: '{"target":"dummy"}',
				projectId: 7n,
				auditor: "0x2222222222222222222222222222222222222222",
				ethereumProvider: provider as unknown,
			});

			expect(result.cipherURI).toContain("oasis://");
			expect(
				calls.some((call) => call.method === "eth_getTransactionByHash"),
			).toBe(true);
			expect(
				calls.filter((call) => call.method === "eth_sendTransaction"),
			).toHaveLength(1);
		} finally {
			restoreStorageContract();
		}
	});

	it("fails closed when tx lookup is null and receipt logs cannot prove PoCStored write", async () => {
		const restoreStorageContract = setRuntimeStorageContract(
			"0x000000000000000000000000000000000000dEaD",
		);

		const { provider } = createMockProvider(
			`0x${"f".repeat(64)}` as const,
			"0x1111111111111111111111111111111111111111",
			{
				forceReadErrorMessage: "execution reverted: Not authorized",
				returnNullTransactionByHash: true,
				receiptOverride: {
					to: "0x000000000000000000000000000000000000dEaD",
					logs: [],
				},
			},
		);

		try {
			await expect(
				uploadEncryptedPoC({
					poc: '{"target":"dummy"}',
					projectId: 7n,
					auditor: "0x2222222222222222222222222222222222222222",
					ethereumProvider: provider as unknown,
				}),
			).rejects.toThrow(
				"transaction proof fallback failed: receipt fallback logs do not contain matching PoCStored event",
			);
		} finally {
			restoreStorageContract();
		}
	});

	it("does not retry direct Sapphire write when contract rejects all writes as Not authorized", async () => {
		const restoreStorageContract = setRuntimeStorageContract(
			"0x000000000000000000000000000000000000dEaD",
		);

		const { provider, calls } = createMockProvider(
			`0x${"f".repeat(64)}` as const,
			"0x1111111111111111111111111111111111111111",
			{
				forceWriteErrorMessage: "execution reverted: Not authorized",
			},
		);

		try {
			await expect(
				uploadEncryptedPoC({
					poc: '{"target":"dummy"}',
					projectId: 7n,
					auditor: "0x2222222222222222222222222222222222222222",
					ethereumProvider: provider as unknown,
				}),
			).rejects.toThrow("execution reverted: Not authorized");

			const sendCalls = calls.filter(
				(call) => call.method === "eth_sendTransaction",
			);
			expect(sendCalls).toHaveLength(1);
		} finally {
			restoreStorageContract();
		}
	});

	it("still uses collision-safe slot when readMeta preflight is unavailable", async () => {
		const restoreStorageContract = setRuntimeStorageContract(
			"0x000000000000000000000000000000000000dEaD",
		);

		const projectId = 7n;
		const poc = '{"target":"dummy"}';
		const walletAddress = "0x1111111111111111111111111111111111111111";
		const deterministicSeed = `${projectId.toString()}:${walletAddress.toLowerCase()}:${poc}`;
		const deterministicSlotId = `slot-${keccak256(toBytes(deterministicSeed)).slice(2, 18)}`;

		const { provider, calls } = createMockProvider(
			`0x${"f".repeat(64)}` as const,
			walletAddress,
			{
				forceReadMetaErrorMessage: "provider does not support readMeta",
				readWriterBySlot: {
					[deterministicSlotId]: "0x9999999999999999999999999999999999999999",
				},
			},
		);

		try {
			const result = await uploadEncryptedPoC({
				poc,
				projectId,
				auditor: "0x2222222222222222222222222222222222222222",
				ethereumProvider: provider as unknown,
			});

			expect(result.cipherURI).toContain("oasis://");

			const sendCalls = calls.filter(
				(call) => call.method === "eth_sendTransaction",
			);
			expect(sendCalls).toHaveLength(1);

			const sendData = (
				sendCalls[0]?.params?.[0] as { data?: `0x${string}` } | undefined
			)?.data;
			expect(sendData).toBeTypeOf("string");

			const decodedWrite = decodeFunctionData({
				abi: OASIS_STORAGE_ABI,
				data: sendData as `0x${string}`,
			});
			expect(decodedWrite.args?.[0]).not.toBe(deterministicSlotId);
		} finally {
			restoreStorageContract();
		}
	});

	it("fails closed when VITE_OASIS_STORAGE_CONTRACT is missing", async () => {
		const restoreRuntimeStorage = setRuntimeStorageContract("not-an-address");
		vi.stubEnv("VITE_OASIS_STORAGE_CONTRACT", "");
		const { provider } = createMockProvider(`0x${"a".repeat(64)}` as const);

		try {
			await expect(
				uploadEncryptedPoC({
					poc: '{"target":"dummy","secret":"super-sensitive-poc"}',
					projectId: 7n,
					auditor: "0x2222222222222222222222222222222222222222",
					ethereumProvider: provider as unknown,
				}),
			).rejects.toThrow(
				"VITE_OASIS_STORAGE_CONTRACT must be set to a valid Ethereum address before uploading PoCs.",
			);
		} finally {
			restoreRuntimeStorage();
		}
	});

	it("fails closed when VITE_OASIS_STORAGE_CONTRACT is invalid", async () => {
		const restoreRuntimeStorage = setRuntimeStorageContract("not-an-address");
		vi.stubEnv("VITE_OASIS_STORAGE_CONTRACT", "not-an-address");
		const { provider } = createMockProvider(`0x${"d".repeat(64)}` as const);

		try {
			await expect(
				uploadEncryptedPoC({
					poc: '{"target":"dummy"}',
					projectId: 11n,
					auditor: "0x2222222222222222222222222222222222222222",
					ethereumProvider: provider as unknown,
				}),
			).rejects.toThrow(
				"VITE_OASIS_STORAGE_CONTRACT must be set to a valid Ethereum address before uploading PoCs.",
			);

			expect(provider.request).not.toHaveBeenCalled();
		} finally {
			restoreRuntimeStorage();
		}
	});

	it("throws when poc json is invalid", async () => {
		const { provider } = createMockProvider(`0x${"b".repeat(64)}` as const);

		await expect(
			uploadEncryptedPoC({
				poc: "{invalid",
				projectId: 1n,
				auditor: "0x1111111111111111111111111111111111111111",
				ethereumProvider: provider as unknown,
			}),
		).rejects.toThrow("PoC JSON must be valid JSON object");
	});

	it("does not send a transaction when storage contract is missing", async () => {
		const restoreRuntimeStorage = setRuntimeStorageContract("not-an-address");
		vi.stubEnv("VITE_OASIS_STORAGE_CONTRACT", "");
		const { provider } = createMockProvider(`0x${"c".repeat(64)}` as const);

		try {
			await expect(
				uploadEncryptedPoC({
					poc: '{"target":"dummy"}',
					projectId: 9n,
					auditor: "0x2222222222222222222222222222222222222222",
					ethereumProvider: provider as unknown,
				}),
			).rejects.toThrow(
				"VITE_OASIS_STORAGE_CONTRACT must be set to a valid Ethereum address before uploading PoCs.",
			);

			expect(provider.request).not.toHaveBeenCalled();
		} finally {
			restoreRuntimeStorage();
		}
	});

	it("uses envelope hash as cipherURI fragment for slot references", async () => {
		const previousStorageContract = (
			globalThis as { __ANTI_SOON_OASIS_STORAGE_CONTRACT__?: string }
		).__ANTI_SOON_OASIS_STORAGE_CONTRACT__;
		(
			globalThis as { __ANTI_SOON_OASIS_STORAGE_CONTRACT__?: string }
		).__ANTI_SOON_OASIS_STORAGE_CONTRACT__ =
			"0x000000000000000000000000000000000000dEaD";
		const txHash = `0x${"e".repeat(64)}` as const;
		const { provider, calls } = createMockProvider(txHash);

		try {
			const result = await uploadEncryptedPoC({
				poc: '{"target":"dummy"}',
				projectId: 19n,
				auditor: "0x2222222222222222222222222222222222222222",
				ethereumProvider: provider as unknown,
			});

			const sendCall = calls.find(
				(call) => call.method === "eth_sendTransaction",
			);
			const txRequest = sendCall?.params?.[0] as { data?: string } | undefined;
			expect(txRequest?.data).toBeTruthy();

			const decoded = decodeFunctionData({
				abi: OASIS_STORAGE_ABI,
				data: txRequest?.data as `0x${string}`,
			});
			const payload = JSON.parse(decoded.args?.[1] as string) as {
				envelopeHash: string;
			};
			const fragment = result.cipherURI.split("#")[1];

			expect(fragment).toBe(payload.envelopeHash);
			expect(fragment).not.toBe(txHash);
		} finally {
			(
				globalThis as { __ANTI_SOON_OASIS_STORAGE_CONTRACT__?: string }
			).__ANTI_SOON_OASIS_STORAGE_CONTRACT__ = previousStorageContract;
		}
	});
});
