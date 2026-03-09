import type {
	AbiEvent,
	BlockNumber,
	BlockTag,
	GetLogsParameters,
	GetLogsReturnType,
} from "viem";
import { createPublicClient, http } from "viem";
import { CHAIN } from "../config";
import { resolveRpcUrl, resolveRpcUrls } from "./rpcConfig";

const RPC_READ_TIMEOUT_MS = 4_000;
const CONTRACT_READ_CACHE_TTL_MS = 10_000;
const LOG_READ_CACHE_TTL_MS = 15_000;
const BLOCK_NUMBER_CACHE_TTL_MS = 2_000;
const BALANCE_READ_CACHE_TTL_MS = 10_000;
const CODE_READ_CACHE_TTL_MS = 30_000;

type PublicReadClient = ReturnType<typeof createPublicClient>;
type ReadContractParameters = Parameters<PublicReadClient["readContract"]>[0];
type MulticallParameters = Parameters<PublicReadClient["multicall"]>[0];
type GetBalanceParameters = Parameters<PublicReadClient["getBalance"]>[0];
type GetCodeParameters = Parameters<PublicReadClient["getCode"]>[0];

type CacheEntry = {
	expiresAt: number;
	value: unknown;
};

const readCache = new Map<string, CacheEntry>();
const inflightReads = new Map<string, Promise<unknown>>();

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function withTimeout<T>(
	promise: Promise<T>,
	timeoutMs: number,
	label: string,
): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const timer = globalThis.setTimeout(() => {
			reject(new Error(`${label} timed out after ${timeoutMs}ms`));
		}, timeoutMs);

		promise
			.then((value) => {
				globalThis.clearTimeout(timer);
				resolve(value);
			})
			.catch((error) => {
				globalThis.clearTimeout(timer);
				reject(error);
			});
	});
}

const configuredRpcUrls = resolveRpcUrls();
const rpcUrls =
	configuredRpcUrls.length > 0 ? configuredRpcUrls : [resolveRpcUrl()];

export const publicClients = rpcUrls.map((rpcUrl) =>
	createPublicClient({
		chain: CHAIN,
		transport: http(rpcUrl),
	}),
);

export const publicClient = publicClients[0];

function serializeCacheValue(value: unknown): string {
	if (typeof value === "bigint") {
		return `bigint:${value.toString()}`;
	}

	if (Array.isArray(value)) {
		return `[${value.map((entry) => serializeCacheValue(entry)).join(",")}]`;
	}

	if (value instanceof Uint8Array) {
		return `uint8array:${Array.from(value).join(",")}`;
	}

	if (value && typeof value === "object") {
		const entries = Object.entries(value as Record<string, unknown>)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(
				([key, entryValue]) =>
					`${JSON.stringify(key)}:${serializeCacheValue(entryValue)}`,
			);
		return `{${entries.join(",")}}`;
	}

	return JSON.stringify(value);
}

function buildReadCacheKey(operation: string, parameters?: unknown): string {
	return `${CHAIN.id}:${operation}:${serializeCacheValue(parameters ?? null)}`;
}

function getCachedRead<T>(cacheKey: string): T | null {
	const cachedEntry = readCache.get(cacheKey);
	if (!cachedEntry) {
		return null;
	}

	if (cachedEntry.expiresAt <= Date.now()) {
		readCache.delete(cacheKey);
		return null;
	}

	return cachedEntry.value as T;
}

async function runCachedRead<T>(
	cacheKey: string,
	ttlMs: number,
	read: () => Promise<T>,
): Promise<T> {
	const cachedValue = getCachedRead<T>(cacheKey);
	if (cachedValue !== null) {
		return cachedValue;
	}

	const inflightRead = inflightReads.get(cacheKey) as Promise<T> | undefined;
	if (inflightRead) {
		return inflightRead;
	}

	const nextRead = read()
		.then((value) => {
			readCache.set(cacheKey, {
				value,
				expiresAt: Date.now() + ttlMs,
			});
			return value;
		})
		.finally(() => {
			inflightReads.delete(cacheKey);
		});

	inflightReads.set(cacheKey, nextRead);
	return nextRead;
}

export function clearPublicClientReadCache() {
	readCache.clear();
	inflightReads.clear();
}

export async function readWithRpcFallback<T>(
	operation: (client: PublicReadClient) => Promise<T>,
	timeoutMs = RPC_READ_TIMEOUT_MS,
): Promise<T> {
	try {
		return await Promise.any(
			publicClients.map((client, index) =>
				withTimeout(
					Promise.resolve().then(() => operation(client)),
					timeoutMs,
					`RPC[${index + 1}]`,
				),
			),
		);
	} catch (error) {
		const errors = error instanceof AggregateError ? error.errors : [error];
		const reason = errors.map(getErrorMessage).join(" | ");
		throw new Error(`ALL_RPC_READS_FAILED: ${reason}`);
	}
}

export function readContractWithRpcFallback(
	parameters: ReadContractParameters,
) {
	return runCachedRead(
		buildReadCacheKey("readContract", parameters),
		CONTRACT_READ_CACHE_TTL_MS,
		() => readWithRpcFallback((client) => client.readContract(parameters)),
	);
}

export function multicallWithRpcFallback(parameters: MulticallParameters) {
	return runCachedRead(
		buildReadCacheKey("multicall", parameters),
		CONTRACT_READ_CACHE_TTL_MS,
		() => readWithRpcFallback((client) => client.multicall(parameters)),
	);
}

export function getLogsWithRpcFallback<
	const TAbiEvent extends AbiEvent | undefined = undefined,
	const TAbiEvents extends
		| readonly AbiEvent[]
		| readonly unknown[]
		| undefined = TAbiEvent extends AbiEvent ? [TAbiEvent] : undefined,
	TStrict extends boolean | undefined = undefined,
	TFromBlock extends BlockNumber | BlockTag | undefined = undefined,
	TToBlock extends BlockNumber | BlockTag | undefined = undefined,
>(
	parameters?: GetLogsParameters<
		TAbiEvent,
		TAbiEvents,
		TStrict,
		TFromBlock,
		TToBlock
	>,
) {
	return runCachedRead(
		buildReadCacheKey("getLogs", parameters),
		LOG_READ_CACHE_TTL_MS,
		() => readWithRpcFallback((client) => client.getLogs(parameters)),
	) as Promise<
		GetLogsReturnType<TAbiEvent, TAbiEvents, TStrict, TFromBlock, TToBlock>
	>;
}

export function getBlockNumberWithRpcFallback() {
	return runCachedRead(
		buildReadCacheKey("getBlockNumber"),
		BLOCK_NUMBER_CACHE_TTL_MS,
		() => readWithRpcFallback((client) => client.getBlockNumber()),
	);
}

export function getBalanceWithRpcFallback(parameters: GetBalanceParameters) {
	return runCachedRead(
		buildReadCacheKey("getBalance", parameters),
		BALANCE_READ_CACHE_TTL_MS,
		() => readWithRpcFallback((client) => client.getBalance(parameters)),
	);
}

export function getCodeWithRpcFallback(parameters: GetCodeParameters) {
	return runCachedRead(
		buildReadCacheKey("getCode", parameters),
		CODE_READ_CACHE_TTL_MS,
		() => readWithRpcFallback((client) => client.getCode(parameters)),
	);
}
