import { wrapEthereumProvider } from "@oasisprotocol/sapphire-paratime";
import {
	createPublicClient,
	decodeAbiParameters,
	decodeEventLog,
	decodeFunctionData,
	defineChain,
	encodeFunctionData,
	http,
	keccak256,
	parseAbi,
	parseAbiItem,
	parseAbiParameters,
	toBytes,
} from "viem";
import { normalizeEthereumAddress } from "./address";
import { extractErrorMessage } from "./errorMessage";
import {
	computeOasisEnvelopeHash,
	createOasisEnvelope,
	type OasisPointer,
} from "./oasisStorage";
import { getOrCreateSapphireSiweToken } from "./sapphireSiwe";

interface UploadEncryptedPoCArgs {
	poc: string;
	projectId: bigint;
	auditor: `0x${string}`;
	ethereumProvider?: unknown;
}

interface UploadEncryptedPoCResult {
	cipherURI: string;
	oasisTxHash: `0x${string}`;
}

export interface StoredPoCPreview {
	poc: unknown;
	payloadJson: string;
	source: 'sapphire';
}

const ENV =
	(import.meta as ImportMeta & { env?: Record<string, string | undefined> })
		.env ?? {};

const SAPPHIRE_CHAIN_ID_HEX = "0x5aff";
const SEPOLIA_CHAIN_ID_HEX = "0xaa36a7";
const OASIS_TX_ENCRYPTION_ENABLED = ENV.VITE_OASIS_TX_ENCRYPTION !== "false";

const sapphireTestnetChain = defineChain({
	id: 23295,
	name: 'Oasis Sapphire Testnet',
	nativeCurrency: {
		name: 'TEST',
		symbol: 'TEST',
		decimals: 18,
	},
	rpcUrls: {
		default: {
			http: ['https://testnet.sapphire.oasis.io'],
		},
	},
	blockExplorers: {
		default: {
			name: 'Oasis Explorer',
			url: 'https://explorer.oasis.io/testnet/sapphire',
		},
	},
})

type RelayerUploadResponse = {
	cipherURI: string;
	oasisTxHash: `0x${string}`;
};

type PreviewReadApiResponse =
	| { ok?: true; payloadJson?: string; poc?: unknown }
	| { ok?: true; data?: { payloadJson?: string; poc?: unknown } };

const OASIS_STORAGE_ABI = parseAbi([
	"function write(string slotId, string payload)",
	"function read(string slotId) view returns (string payload)",
	"function readMeta(string slotId) view returns (address writer, uint256 storedAt)",
	"event PoCStored(bytes32 indexed slotKey, address indexed writer, uint256 storedAt, bytes32 payloadHash)",
]);

const OASIS_STORAGE_TOKEN_READ_ABI = parseAbi([
	"function read(string slotId, bytes token) view returns (string payload)",
]);

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

type Eip1193Provider = {
	request: (args: {
		method: string;
		params?: object | readonly unknown[];
	}) => Promise<unknown>;
};

type TransactionReceiptResult = {
	status?: string;
	transactionHash?: string;
	to?: string | null;
	logs?: unknown;
};

function toHexTopics(
	value: unknown,
): [`0x${string}`, ...`0x${string}`[]] | undefined {
	if (!Array.isArray(value) || value.length === 0) {
		return undefined;
	}

	const topics: `0x${string}`[] = [];
	for (const topic of value) {
		if (typeof topic !== "string" || !topic.startsWith("0x")) {
			return undefined;
		}
		topics.push(topic as `0x${string}`);
	}

	return topics as [`0x${string}`, ...`0x${string}`[]];
}

function receiptProvesPoCStoredWrite(args: {
	receiptRecord: Record<string, unknown>;
	storageContract: `0x${string}`;
	slotId: string;
	payloadJson: string;
}): boolean {
	const rawLogs = args.receiptRecord.logs;
	if (!Array.isArray(rawLogs)) {
		return true;
	}

	if (rawLogs.length === 0) {
		return false;
	}

	const expectedSlotKey = keccak256(toBytes(args.slotId)).toLowerCase();
	const expectedPayloadHash = keccak256(
		toBytes(args.payloadJson),
	).toLowerCase();
	const expectedStorageContract = args.storageContract.toLowerCase();

	for (const rawLog of rawLogs) {
		if (!rawLog || typeof rawLog !== "object") {
			continue;
		}

		const logRecord = rawLog as Record<string, unknown>;
		const logAddress = normalizeEthereumAddress(logRecord.address);
		if (!logAddress || logAddress.toLowerCase() !== expectedStorageContract) {
			continue;
		}

		const topics = toHexTopics(logRecord.topics);
		const data =
			typeof logRecord.data === "string" && logRecord.data.startsWith("0x")
				? (logRecord.data as `0x${string}`)
				: undefined;
		if (!topics || !data) {
			continue;
		}

		try {
			const decoded = decodeEventLog({
				abi: OASIS_STORAGE_ABI,
				eventName: "PoCStored",
				topics,
				data,
				strict: false,
			});
			const decodedArgs = decoded.args as {
				slotKey?: unknown;
				payloadHash?: unknown;
			};
			const slotKey =
				typeof decodedArgs.slotKey === "string"
					? decodedArgs.slotKey.toLowerCase()
					: undefined;
			const payloadHash =
				typeof decodedArgs.payloadHash === "string"
					? decodedArgs.payloadHash.toLowerCase()
					: undefined;
			if (slotKey === expectedSlotKey && payloadHash === expectedPayloadHash) {
				return true;
			}
		} catch {
			// Ignore logs that do not decode as PoCStored while probing the receipt.
		}
	}

	return false;
}

type ParsedCipherURI = {
	chain: string;
	contract: `0x${string}`;
	slotId: string;
	envelopeHash: `0x${string}`;
};

function normalizePointer(pointer: OasisPointer): OasisPointer {
	return {
		chain: pointer.chain,
		contract: pointer.contract.toLowerCase(),
		slotId: pointer.slotId,
	};
}

function buildPointer(
	args: UploadEncryptedPoCArgs,
	storageContract: `0x${string}`,
	collisionSalt?: string,
): OasisPointer {
	const chain = ENV.VITE_OASIS_CHAIN?.trim() || "oasis-sapphire-testnet";

	const seedParts = [
		args.projectId.toString(),
		args.auditor.toLowerCase(),
		args.poc,
	];
	if (collisionSalt) {
		seedParts.push(collisionSalt);
	}

	const seed = seedParts.join(":");
	const slotId = `slot-${keccak256(toBytes(seed)).slice(2, 18)}`;
	return normalizePointer({ chain, contract: storageContract, slotId });
}

function isNotAuthorizedRevert(message: string): boolean {
	const normalized = message.trim().toLowerCase();
	return (
		normalized === "not authorized" ||
		normalized.includes("execution reverted: not authorized")
	);
}

class SapphireWriteNotAuthorizedError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "SapphireWriteNotAuthorizedError";
	}
}

function createCollisionRetrySalt(): string {
	return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}

async function resolveCollisionSafeInitialPointer(args: {
	provider: Eip1193Provider;
	storageContract: `0x${string}`;
	projectId: bigint;
	poc: string;
	providerAddress: `0x${string}`;
}): Promise<OasisPointer> {
	const initialPointer = buildPointer(
		{
			poc: args.poc,
			projectId: args.projectId,
			auditor: args.providerAddress,
		},
		args.storageContract,
		createCollisionRetrySalt(),
	);

	let existingWriter: `0x${string}` | undefined;
	try {
		existingWriter = await readSapphireWriter({
			provider: args.provider,
			contract: args.storageContract,
			slotId: initialPointer.slotId,
		});
	} catch {
		return initialPointer;
	}

	if (
		!existingWriter ||
		existingWriter.toLowerCase() === args.providerAddress.toLowerCase()
	) {
		return initialPointer;
	}

	return buildPointer(
		{
			poc: args.poc,
			projectId: args.projectId,
			auditor: args.providerAddress,
		},
		args.storageContract,
		createCollisionRetrySalt(),
	);
}

async function shouldRetryWriteAfterNotAuthorized(args: {
	provider: Eip1193Provider;
	storageContract: `0x${string}`;
	slotId: string;
	providerAddress: `0x${string}`;
}): Promise<boolean> {
	let writer: `0x${string}` | undefined;
	try {
		writer = await readSapphireWriter({
			provider: args.provider,
			contract: args.storageContract,
			slotId: args.slotId,
		});
	} catch {
		return false;
	}

	return Boolean(
		writer && writer.toLowerCase() !== args.providerAddress.toLowerCase(),
	);
}

function readProvider(provider?: unknown): Eip1193Provider {
	if (provider && typeof provider === "object" && "request" in provider) {
		return provider as Eip1193Provider;
	}

	if (typeof window !== "undefined") {
		const maybeProvider = (window as Window & { ethereum?: unknown }).ethereum;
		if (
			maybeProvider &&
			typeof maybeProvider === "object" &&
			"request" in maybeProvider
		) {
			return maybeProvider as Eip1193Provider;
		}
	}

	throw new Error("No EIP-1193 provider available for Sapphire submission");
}

function getOasisUploadApiUrl(): string | undefined {
	const globalRuntimeUrl = (
		globalThis as { __ANTI_SOON_OASIS_UPLOAD_API_URL__?: string }
	).__ANTI_SOON_OASIS_UPLOAD_API_URL__;
	if (
		typeof globalRuntimeUrl === "string" &&
		globalRuntimeUrl.trim().length > 0
	) {
		return globalRuntimeUrl.trim();
	}

	const runtimeEnv =
		(import.meta as ImportMeta & { env?: Record<string, string | undefined> })
			.env ?? ENV;
	const raw = runtimeEnv.VITE_OASIS_UPLOAD_API_URL?.trim();
	return raw && raw.length > 0 ? raw : undefined;
}

function getOasisReadApiUrl(): string | undefined {
	const globalRuntimeUrl = (
		globalThis as { __ANTI_SOON_OASIS_READ_API_URL__?: string }
	).__ANTI_SOON_OASIS_READ_API_URL__;
	if (
		typeof globalRuntimeUrl === "string" &&
		globalRuntimeUrl.trim().length > 0
	) {
		return globalRuntimeUrl.trim();
	}

	const runtimeEnv =
		(import.meta as ImportMeta & { env?: Record<string, string | undefined> })
			.env ?? ENV;
	const directReadUrl = runtimeEnv.VITE_OASIS_READ_API_URL?.trim();
	if (directReadUrl && directReadUrl.length > 0) {
		return directReadUrl;
	}

	const uploadUrl = getOasisUploadApiUrl();
	if (!uploadUrl) return undefined;

	if (uploadUrl.endsWith("/upload")) {
		return `${uploadUrl.slice(0, -"/upload".length)}/read`;
	}

	return `${uploadUrl.replace(/\/$/, "")}/read`;
}

function getOasisStorageContract(): string | undefined {
	const globalRuntimeContract = (
		globalThis as { __ANTI_SOON_OASIS_STORAGE_CONTRACT__?: string }
	).__ANTI_SOON_OASIS_STORAGE_CONTRACT__;
	if (
		typeof globalRuntimeContract === "string" &&
		globalRuntimeContract.trim().length > 0
	) {
		return globalRuntimeContract.trim();
	}

	const runtimeEnv =
		(import.meta as ImportMeta & { env?: Record<string, string | undefined> })
			.env ?? ENV;
	const raw = runtimeEnv.VITE_OASIS_STORAGE_CONTRACT?.trim();
	return raw && raw.length > 0 ? raw : undefined;
}

function isBytes32Hex(value: string): value is `0x${string}` {
	return /^0x[0-9a-fA-F]{64}$/.test(value);
}

function parseCipherURI(cipherURI: string): ParsedCipherURI {
	const prefix = "oasis://";
	if (!cipherURI.startsWith(prefix)) {
		throw new Error(
			"Sapphire readback validation failed: cipherURI must use oasis:// scheme",
		);
	}

	const hashIndex = cipherURI.indexOf("#");
	if (hashIndex === -1 || hashIndex === cipherURI.length - 1) {
		throw new Error(
			"Sapphire readback validation failed: cipherURI must include envelope hash fragment",
		);
	}

	const location = cipherURI.slice(prefix.length, hashIndex);
	const envelopeHash = cipherURI.slice(hashIndex + 1);
	if (!isBytes32Hex(envelopeHash)) {
		throw new Error(
			"Sapphire readback validation failed: cipherURI fragment must be bytes32 hex",
		);
	}

	const firstSlash = location.indexOf("/");
	const secondSlash = location.indexOf("/", firstSlash + 1);
	if (
		firstSlash <= 0 ||
		secondSlash <= firstSlash + 1 ||
		secondSlash === location.length - 1
	) {
		throw new Error(
			"Sapphire readback validation failed: cipherURI pointer is malformed",
		);
	}

	const chain = location.slice(0, firstSlash);
	const contractRaw = location.slice(firstSlash + 1, secondSlash);
	const slotEncoded = location.slice(secondSlash + 1);
	const contract = normalizeEthereumAddress(contractRaw);

	if (!contract) {
		throw new Error(
			"Sapphire readback validation failed: cipherURI contract address is invalid",
		);
	}

	let slotId: string;
	try {
		slotId = decodeURIComponent(slotEncoded);
	} catch {
		throw new Error(
			"Sapphire readback validation failed: cipherURI slot is not URI-decodable",
		);
	}

	if (!slotId) {
		throw new Error(
			"Sapphire readback validation failed: cipherURI slot must not be empty",
		);
	}

	return { chain, contract, slotId, envelopeHash };
}

async function readSapphirePayloadJson(args: {
	provider: Eip1193Provider;
	contract: `0x${string}`;
	slotId: string;
	from: `0x${string}`;
}): Promise<string> {
	const readData = encodeFunctionData({
		abi: OASIS_STORAGE_ABI,
		functionName: "read",
		args: [args.slotId],
	});

	const rawResult = await args.provider.request({
		method: "eth_call",
		params: [{ from: args.from, to: args.contract, data: readData }, "latest"],
	});

	if (typeof rawResult !== "string" || !rawResult.startsWith("0x")) {
		throw new Error(
			"Sapphire readback validation failed: read call returned non-hex payload",
		);
	}

	const [payloadJson] = decodeAbiParameters(
		parseAbiParameters("string"),
		rawResult as `0x${string}`,
	);
	return payloadJson;
}

async function readSapphirePayloadJsonWithToken(args: {
	contract: `0x${string}`;
	slotId: string;
	token: `0x${string}`;
}): Promise<string> {
	const { data } = await sapphireTxLookupClient.call({
		to: args.contract,
		data: encodeFunctionData({
			abi: OASIS_STORAGE_TOKEN_READ_ABI,
			functionName: "read",
			args: [args.slotId, args.token],
		}),
	});

	if (!data) {
		throw new Error(
			"Sapphire preview read returned no data for the authenticated token call",
		);
	}

	const [payloadJson] = decodeAbiParameters(
		parseAbiParameters("string"),
		data,
	);
	return payloadJson;
}

function parsePreviewPayloadJson(args: {
	parsed: ParsedCipherURI;
	payloadJson: string;
}): StoredPoCPreview {
	let payload: unknown;
	try {
		payload = JSON.parse(args.payloadJson);
	} catch {
		throw new Error(
			"Sapphire preview payload is not valid JSON after the authenticated read",
		);
	}

	if (
		typeof payload !== "object" ||
		payload === null ||
		Array.isArray(payload)
	) {
		throw new Error("Sapphire preview payload has an invalid object shape");
	}

	const payloadRecord = payload as {
		envelopeHash?: unknown;
		pointer?: { slotId?: unknown; contract?: unknown };
		poc?: unknown;
	};
	if (payloadRecord.envelopeHash !== args.parsed.envelopeHash) {
		throw new Error(
			"Sapphire preview payload envelope hash does not match the cipherURI",
		);
	}

	if (payloadRecord.pointer?.slotId !== args.parsed.slotId) {
		throw new Error(
			"Sapphire preview payload slot id does not match the cipherURI",
		);
	}

	if (
		typeof payloadRecord.pointer?.contract !== "string" ||
		payloadRecord.pointer.contract.toLowerCase() !==
			args.parsed.contract.toLowerCase()
	) {
		throw new Error(
			"Sapphire preview payload contract does not match the cipherURI",
		);
	}

	if (!("poc" in payloadRecord)) {
		throw new Error("Sapphire preview payload does not include PoC content");
	}

	return {
		poc: payloadRecord.poc,
		payloadJson: args.payloadJson,
		source: 'sapphire',
	};
}

async function readStoredPoCPreviewViaService(args: {
	parsed: ParsedCipherURI;
	cipherURI: string;
	readApiUrl: string;
}): Promise<StoredPoCPreview> {
	if (typeof globalThis.fetch !== "function") {
		throw new Error(
			"Authenticated Sapphire preview service is unavailable: fetch is not defined.",
		);
	}

	const response = await globalThis.fetch(args.readApiUrl, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			pointer: {
				chain: args.parsed.chain,
				contract: args.parsed.contract,
				slotId: args.parsed.slotId,
			},
			cipherURI: args.cipherURI,
		}),
	});

	if (!response.ok) {
		const message = await response.text();
		throw new Error(
			`Authenticated Sapphire preview failed (${response.status}): ${message || "empty response"}`,
		);
	}

	const body = (await response.json()) as PreviewReadApiResponse;
	const directPayloadJson =
		"payloadJson" in body && typeof body.payloadJson === "string"
			? body.payloadJson
			: undefined;
	const nestedPayloadJson =
		"data" in body &&
		body.data &&
		typeof body.data === "object" &&
		"payloadJson" in body.data &&
		typeof body.data.payloadJson === "string"
			? body.data.payloadJson
			: undefined;
	const payloadJson = directPayloadJson ?? nestedPayloadJson;
	if (payloadJson) {
		return parsePreviewPayloadJson({
			parsed: args.parsed,
			payloadJson,
		});
	}

	const directPoC = "poc" in body ? body.poc : undefined;
	const nestedPoC =
		"data" in body &&
		body.data &&
		typeof body.data === "object" &&
		"poc" in body.data
			? body.data.poc
			: undefined;
	const previewPoC = directPoC ?? nestedPoC;
	if (typeof previewPoC === "undefined") {
		throw new Error("Authenticated Sapphire preview response shape is invalid.");
	}

	return {
		poc: previewPoC,
		payloadJson: JSON.stringify({ poc: previewPoC }),
		source: 'sapphire',
	};
}


export async function readStoredPoCPreview(args: {
	cipherURI: string;
	fallbackAuditor: `0x${string}`;
	ethereumProvider?: unknown;
}): Promise<StoredPoCPreview> {
	const parsed = parseCipherURI(args.cipherURI);
	const readApiUrl = getOasisReadApiUrl();

	let directReadError: unknown;
	try {
		const token = await getOrCreateSapphireSiweToken({
			contract: parsed.contract,
			ethereumProvider: args.ethereumProvider,
		});
		const payloadJson = await readSapphirePayloadJsonWithToken({
			contract: parsed.contract,
			slotId: parsed.slotId,
			token,
		});
		return parsePreviewPayloadJson({ parsed, payloadJson });
	} catch (error) {
		directReadError = error;
	}

	if (!readApiUrl) {
		throw directReadError instanceof Error
			? directReadError
			: new Error(extractErrorMessage(directReadError));
	}

	try {
		return await readStoredPoCPreviewViaService({
			parsed,
			cipherURI: args.cipherURI,
			readApiUrl,
		});
	} catch (serviceError) {
		throw new Error(
			`Sapphire preview read failed: direct SIWE read error (${extractErrorMessage(
				directReadError,
			)}); authenticated service fallback error (${extractErrorMessage(serviceError)})`,
		);
	}
}

const sapphireTxLookupClient = createPublicClient({
	chain: sapphireTestnetChain,
	transport: http('https://testnet.sapphire.oasis.io'),
})

const POC_STORED_EVENT = parseAbiItem('event PoCStored(bytes32 indexed slotKey, address indexed writer, uint256 storedAt, bytes32 payloadHash)')
const SAPPHIRE_LOG_QUERY_WINDOW = 90n

export async function resolveSapphireTxHash(args: {
	cipherURI: string;
	auditor?: `0x${string}`;
}): Promise<`0x${string}` | undefined> {
	const parsed = parseCipherURI(args.cipherURI)
	const slotKey = keccak256(toBytes(parsed.slotId))
	const eventArgs = args.auditor ? { slotKey, writer: args.auditor } : { slotKey }
	let toBlock = await sapphireTxLookupClient.getBlockNumber()

	while (true) {
		const fromBlock =
			toBlock >= SAPPHIRE_LOG_QUERY_WINDOW
				? toBlock - (SAPPHIRE_LOG_QUERY_WINDOW - 1n)
				: 0n
		const logs = await sapphireTxLookupClient.getLogs({
			address: parsed.contract,
			event: POC_STORED_EVENT,
			args: eventArgs,
			fromBlock,
			toBlock,
			strict: false,
		})

		const transactionHash = logs.at(-1)?.transactionHash
		if (transactionHash) {
			return transactionHash
		}

		if (fromBlock === 0n) {
			return undefined
		}

		toBlock = fromBlock - 1n
	}
}

async function readSapphireWriter(args: {
	provider: Eip1193Provider;
	contract: `0x${string}`;
	slotId: string;
}): Promise<`0x${string}` | undefined> {
	const readMetaData = encodeFunctionData({
		abi: OASIS_STORAGE_ABI,
		functionName: "readMeta",
		args: [args.slotId],
	});

	const rawMeta = await args.provider.request({
		method: "eth_call",
		params: [{ to: args.contract, data: readMetaData }, "latest"],
	});

	if (typeof rawMeta !== "string" || !rawMeta.startsWith("0x")) {
		return undefined;
	}

	const [writer] = decodeAbiParameters(
		parseAbiParameters("address, uint256"),
		rawMeta as `0x${string}`,
	);
	const normalizedWriter = normalizeEthereumAddress(writer);
	if (!normalizedWriter || normalizedWriter.toLowerCase() === ZERO_ADDRESS) {
		return undefined;
	}

	return normalizedWriter;
}

async function validateSapphireReadback(args: {
	provider: Eip1193Provider;
	fallbackAuditor: `0x${string}`;
	cipherURI: string;
	expectedContract?: `0x${string}`;
	expectedSlotId?: string;
	expectedEnvelopeHash?: `0x${string}`;
}): Promise<void> {
	const parsed = parseCipherURI(args.cipherURI);

	if (
		args.expectedContract &&
		parsed.contract.toLowerCase() !== args.expectedContract.toLowerCase()
	) {
		throw new Error(
			"Sapphire readback validation failed: cipherURI contract mismatch",
		);
	}

	if (args.expectedSlotId && parsed.slotId !== args.expectedSlotId) {
		throw new Error(
			"Sapphire readback validation failed: cipherURI slot mismatch",
		);
	}

	if (
		args.expectedEnvelopeHash &&
		parsed.envelopeHash.toLowerCase() !==
			args.expectedEnvelopeHash.toLowerCase()
	) {
		throw new Error(
			"Sapphire readback validation failed: cipherURI envelope hash mismatch",
		);
	}

	await ensureChain(args.provider, SAPPHIRE_CHAIN_ID_HEX);
	const from = await resolveProviderAddress(
		args.provider,
		args.fallbackAuditor,
	);
	let payloadJson: string;
	try {
		payloadJson = await readSapphirePayloadJson({
			provider: args.provider,
			contract: parsed.contract,
			slotId: parsed.slotId,
			from,
		});
	} catch (primaryReadError) {
		let writer: `0x${string}` | undefined;
		try {
			writer = await readSapphireWriter({
				provider: args.provider,
				contract: parsed.contract,
				slotId: parsed.slotId,
			});
		} catch {
			throw primaryReadError;
		}

		if (!writer || writer.toLowerCase() === from.toLowerCase()) {
			throw primaryReadError;
		}

		try {
			payloadJson = await readSapphirePayloadJson({
				provider: args.provider,
				contract: parsed.contract,
				slotId: parsed.slotId,
				from: writer,
			});
		} catch (writerReadError) {
			throw new Error(
				`Sapphire readback validation failed: wallet caller read error (${extractErrorMessage(
					primaryReadError,
				)}); writer fallback read error (${extractErrorMessage(writerReadError)})`,
			);
		}
	}

	let payload: unknown;
	try {
		payload = JSON.parse(payloadJson);
	} catch {
		throw new Error(
			"Sapphire readback validation failed: storage payload is not valid JSON",
		);
	}

	if (
		typeof payload !== "object" ||
		payload === null ||
		Array.isArray(payload)
	) {
		throw new Error(
			"Sapphire readback validation failed: storage payload has invalid shape",
		);
	}

	const payloadRecord = payload as {
		envelopeHash?: unknown;
		pointer?: { slotId?: unknown; contract?: unknown };
	};

	if (payloadRecord.envelopeHash !== parsed.envelopeHash) {
		throw new Error(
			"Sapphire readback validation failed: envelope hash does not match cipherURI",
		);
	}

	if (payloadRecord.pointer?.slotId !== parsed.slotId) {
		throw new Error(
			"Sapphire readback validation failed: slot id does not match cipherURI",
		);
	}

	if (typeof payloadRecord.pointer?.contract !== "string") {
		throw new Error(
			"Sapphire readback validation failed: payload pointer contract is missing",
		);
	}

	if (
		payloadRecord.pointer.contract.toLowerCase() !==
		parsed.contract.toLowerCase()
	) {
		throw new Error(
			"Sapphire readback validation failed: payload pointer contract mismatch",
		);
	}
}

async function validateWriteTxProof(args: {
	provider: Eip1193Provider;
	txHash: `0x${string}`;
	storageContract: `0x${string}`;
	slotId: string;
	payloadJson: string;
	confirmedReceipt?: TransactionReceiptResult;
}): Promise<void> {
	const validateReceiptFallbackProof = async (): Promise<void> => {
		const receiptRecord = args.confirmedReceipt
			? (args.confirmedReceipt as Record<string, unknown>)
			: ((await args.provider.request({
					method: "eth_getTransactionReceipt",
					params: [args.txHash],
				})) as Record<string, unknown> | null);

		if (!receiptRecord || typeof receiptRecord !== "object") {
			throw new Error("transaction lookup returned no object");
		}

		if (
			typeof receiptRecord.status !== "string" ||
			receiptRecord.status.toLowerCase() !== "0x1"
		) {
			throw new Error(
				"receipt fallback indicates transaction was not successful",
			);
		}

		if (typeof receiptRecord.transactionHash === "string") {
			if (
				receiptRecord.transactionHash.toLowerCase() !==
				args.txHash.toLowerCase()
			) {
				throw new Error(
					"receipt fallback returned mismatched transaction hash",
				);
			}
		}

		const receiptTo = normalizeEthereumAddress(receiptRecord.to);
		if (
			receiptTo &&
			receiptTo.toLowerCase() !== args.storageContract.toLowerCase()
		) {
			throw new Error(
				"receipt fallback target does not match configured Sapphire storage contract",
			);
		}

		if (
			!receiptProvesPoCStoredWrite({
				receiptRecord,
				storageContract: args.storageContract,
				slotId: args.slotId,
				payloadJson: args.payloadJson,
			})
		) {
			throw new Error(
				"receipt fallback logs do not contain matching PoCStored event",
			);
		}
	};

	const txResponse = await args.provider.request({
		method: "eth_getTransactionByHash",
		params: [args.txHash],
	});

	if (!txResponse || typeof txResponse !== "object") {
		await validateReceiptFallbackProof();
		return;
	}

	const txRecord = txResponse as Record<string, unknown>;
	const toAddress = normalizeEthereumAddress(txRecord.to);
	if (
		!toAddress ||
		toAddress.toLowerCase() !== args.storageContract.toLowerCase()
	) {
		await validateReceiptFallbackProof();
		return;
	}

	const inputValue =
		typeof txRecord.input === "string"
			? txRecord.input
			: typeof txRecord.data === "string"
				? txRecord.data
				: undefined;

	if (!inputValue || !inputValue.startsWith("0x")) {
		await validateReceiptFallbackProof();
		return;
	}

	let decoded: ReturnType<typeof decodeFunctionData>;
	try {
		decoded = decodeFunctionData({
			abi: OASIS_STORAGE_ABI,
			data: inputValue as `0x${string}`,
		});
	} catch {
		await validateReceiptFallbackProof();
		return;
	}

	if (decoded.functionName !== "write") {
		await validateReceiptFallbackProof();
		return;
	}

	const txSlotId = decoded.args?.[0];
	const txPayloadJson = decoded.args?.[1];

	if (txSlotId !== args.slotId) {
		await validateReceiptFallbackProof();
		return;
	}

	if (txPayloadJson !== args.payloadJson) {
		await validateReceiptFallbackProof();
		return;
	}
}

async function uploadViaRelayerApi(args: {
	apiUrl: string;
	poc: string;
	projectId: bigint;
	auditor: `0x${string}`;
}): Promise<UploadEncryptedPoCResult> {
	const response = await fetch(args.apiUrl, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			poc: args.poc,
			projectId: args.projectId.toString(),
			auditor: args.auditor,
		}),
	});

	if (!response.ok) {
		const message = await response.text();
		throw new Error(
			`Oasis relayer upload failed (${response.status}): ${message || "empty response"}`,
		);
	}

	const payload = (await response.json()) as Partial<RelayerUploadResponse>;

	if (
		!payload ||
		typeof payload.cipherURI !== "string" ||
		!payload.cipherURI.startsWith("oasis://") ||
		typeof payload.oasisTxHash !== "string" ||
		!isBytes32Hex(payload.oasisTxHash)
	) {
		throw new Error("Oasis relayer response shape is invalid");
	}

	return {
		cipherURI: payload.cipherURI,
		oasisTxHash: payload.oasisTxHash,
	};
}

async function resolveProviderAddress(
	provider: Eip1193Provider,
	fallback: `0x${string}`,
): Promise<`0x${string}`> {
	for (const method of ["eth_accounts", "eth_requestAccounts"] as const) {
		try {
			const accounts = (await provider.request({ method })) as unknown;
			if (!Array.isArray(accounts)) continue;

			for (const account of accounts) {
				const normalized = normalizeEthereumAddress(account);
				if (normalized) return normalized;
			}
		} catch {
			// Ignore provider account probe failures and continue to the next method.
		}
	}

	return fallback;
}

async function ensureChain(
	provider: Eip1193Provider,
	chainIdHex: string,
): Promise<void> {
	const currentChainId = (await provider.request({
		method: "eth_chainId",
	})) as string;
	if (
		typeof currentChainId === "string" &&
		currentChainId.toLowerCase() === chainIdHex
	) {
		return;
	}

	try {
		await provider.request({
			method: "wallet_switchEthereumChain",
			params: [{ chainId: chainIdHex }],
		});
	} catch (switchError) {
		const err = switchError as { code?: number };
		if (err.code !== 4902 || chainIdHex !== SAPPHIRE_CHAIN_ID_HEX) {
			throw switchError;
		}

		await provider.request({
			method: "wallet_addEthereumChain",
			params: [
				{
					chainId: SAPPHIRE_CHAIN_ID_HEX,
					chainName: "Oasis Sapphire Testnet",
					nativeCurrency: {
						name: "TEST",
						symbol: "TEST",
						decimals: 18,
					},
					rpcUrls: ["https://testnet.sapphire.oasis.io"],
					blockExplorerUrls: ["https://explorer.oasis.io/testnet/sapphire"],
				},
			],
		});

		await provider.request({
			method: "wallet_switchEthereumChain",
			params: [{ chainId: chainIdHex }],
		});
	}
}

async function waitForReceipt(
	provider: Eip1193Provider,
	txHash: `0x${string}`,
): Promise<TransactionReceiptResult> {
	const startedAt = Date.now();
	while (Date.now() - startedAt < 90_000) {
		const receipt = (await provider.request({
			method: "eth_getTransactionReceipt",
			params: [txHash],
		})) as TransactionReceiptResult | null;

		if (receipt && typeof receipt.status === "string") {
			if (receipt.status === "0x1") return receipt;
			throw new Error(
				`Sapphire write transaction failed with status ${receipt.status}`,
			);
		}

		await new Promise((resolve) => setTimeout(resolve, 1_000));
	}

	throw new Error("Timed out waiting for Sapphire write transaction receipt");
}

export async function uploadEncryptedPoC({
	poc,
	projectId,
	auditor,
	ethereumProvider,
}: UploadEncryptedPoCArgs): Promise<UploadEncryptedPoCResult> {
	let parsedPoC: unknown;
	try {
		parsedPoC = JSON.parse(poc);
	} catch {
		throw new Error("PoC JSON must be valid JSON object");
	}

	if (
		typeof parsedPoC !== "object" ||
		parsedPoC === null ||
		Array.isArray(parsedPoC)
	) {
		throw new Error("PoC JSON must be valid JSON object");
	}

	const normalizedAuditor = normalizeEthereumAddress(auditor);
	if (!normalizedAuditor) {
		throw new Error(
			"Connected wallet address is invalid. Reconnect wallet and retry.",
		);
	}

	const relayerApiUrl = getOasisUploadApiUrl();
	if (relayerApiUrl) {
		const provider = readProvider(ethereumProvider);
		const relayerResult = await uploadViaRelayerApi({
			apiUrl: relayerApiUrl,
			poc,
			projectId,
			auditor: normalizedAuditor,
		});

		try {
			await ensureChain(provider, SAPPHIRE_CHAIN_ID_HEX);
			await waitForReceipt(provider, relayerResult.oasisTxHash);
			await validateSapphireReadback({
				provider,
				fallbackAuditor: normalizedAuditor,
				cipherURI: relayerResult.cipherURI,
			});
		} finally {
			try {
				await ensureChain(provider, SEPOLIA_CHAIN_ID_HEX);
			} catch {
				// Ignore best-effort chain restore failures after relayer upload validation.
			}
		}

		return relayerResult;
	}

	const configuredStorageContract = getOasisStorageContract();
	const storageContract = normalizeEthereumAddress(configuredStorageContract);

	if (!storageContract) {
		throw new Error(
			"VITE_OASIS_STORAGE_CONTRACT must be set to a valid Ethereum address before uploading PoCs.",
		);
	}

	const provider = readProvider(ethereumProvider);

	const sapphireProvider = OASIS_TX_ENCRYPTION_ENABLED
		? (wrapEthereumProvider(provider) as unknown as Eip1193Provider)
		: provider;

	await ensureChain(provider, SAPPHIRE_CHAIN_ID_HEX);

	const providerAddress = await resolveProviderAddress(
		provider,
		normalizedAuditor,
	);
	const uriContract = storageContract.toLowerCase();
	const pocHash = keccak256(toBytes(JSON.stringify(parsedPoC)));

	const writeWithPointer = async (
		pointer: OasisPointer,
	): Promise<UploadEncryptedPoCResult> => {
		const envelope = createOasisEnvelope({
			pointer,
			ciphertext: {
				ciphertextHash: pocHash,
				ivHash: pocHash,
			},
		});
		const envelopeHash = computeOasisEnvelopeHash(envelope);

		const payload = {
			ok: true,
			version: "anti-soon.oasis-tx.v2",
			projectId: projectId.toString(),
			auditor: providerAddress.toLowerCase(),
			pointer,
			envelope,
			envelopeHash,
			poc: parsedPoC,
		};

		const payloadJson = JSON.stringify(payload);
		const txData = encodeFunctionData({
			abi: OASIS_STORAGE_ABI,
			functionName: "write",
			args: [pointer.slotId, payloadJson],
		});

		let txHash: `0x${string}`;
		try {
			const txRequest: Record<string, unknown> = {
				from: providerAddress,
				to: storageContract,
				value: "0x0",
				data: txData,
			};

			txHash = (await sapphireProvider.request({
				method: "eth_sendTransaction",
				params: [txRequest],
			})) as `0x${string}`;
		} catch (err) {
			const message = extractErrorMessage(err);
			if (message.includes("must provide an Ethereum address")) {
				throw new Error(
					`Invalid parameters: must provide an Ethereum address (from=${providerAddress}, to=${storageContract}, storageContract=${storageContract}).`,
				);
			}
			if (isNotAuthorizedRevert(message)) {
				throw new SapphireWriteNotAuthorizedError(message);
			}
			throw err;
		}

		const cipherURI = `oasis://${pointer.chain}/${uriContract}/${encodeURIComponent(pointer.slotId)}#${envelopeHash}`;
		const writeReceipt = await waitForReceipt(provider, txHash);
		try {
			await validateSapphireReadback({
				provider,
				fallbackAuditor: providerAddress,
				cipherURI,
				expectedContract: storageContract,
				expectedSlotId: pointer.slotId,
				expectedEnvelopeHash: envelopeHash,
			});
		} catch (readbackError) {
			const readbackMessage = extractErrorMessage(readbackError);
			if (!isNotAuthorizedRevert(readbackMessage)) {
				throw readbackError;
			}

			try {
				await validateWriteTxProof({
					provider,
					txHash,
					storageContract,
					slotId: pointer.slotId,
					payloadJson,
					confirmedReceipt: writeReceipt,
				});
			} catch (proofError) {
				throw new Error(
					`Sapphire readback validation failed: ${readbackMessage}; transaction proof fallback failed: ${extractErrorMessage(
						proofError,
					)}`,
				);
			}
		}

		return {
			cipherURI,
			oasisTxHash: txHash,
		};
	};

	try {
		const initialPointer = await resolveCollisionSafeInitialPointer({
			provider,
			storageContract,
			projectId,
			poc,
			providerAddress,
		});

		try {
			return await writeWithPointer(initialPointer);
		} catch (primaryError) {
			if (!(primaryError instanceof SapphireWriteNotAuthorizedError)) {
				throw primaryError;
			}

			const shouldRetry = await shouldRetryWriteAfterNotAuthorized({
				provider,
				storageContract,
				slotId: initialPointer.slotId,
				providerAddress,
			});
			if (!shouldRetry) {
				throw primaryError;
			}

			const retryPointer = buildPointer(
				{
					poc,
					projectId,
					auditor: providerAddress,
				},
				storageContract,
				createCollisionRetrySalt(),
			);

			return await writeWithPointer(retryPointer);
		}
	} finally {
		try {
			await ensureChain(provider, SEPOLIA_CHAIN_ID_HEX);
		} catch {
			// Ignore best-effort chain restore failures after direct Sapphire upload.
		}
	}
}
