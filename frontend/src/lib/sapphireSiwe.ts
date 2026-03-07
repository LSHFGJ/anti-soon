import {
	createPublicClient,
	decodeAbiParameters,
	encodeFunctionData,
	http,
	parseAbi,
	parseAbiParameters,
	parseSignature,
} from "viem";
import { createSiweMessage, generateSiweNonce } from "viem/siwe";
import { normalizeEthereumAddress } from "./address";
import { extractErrorMessage } from "./errorMessage";

const SAPPHIRE_RPC_URL = "https://testnet.sapphire.oasis.io";
const SAPPHIRE_CHAIN_ID = 23295;
const SAPPHIRE_SIWE_STATEMENT =
	"Authorize AntiSoon to read your Sapphire PoC preview.";
const SAPPHIRE_SIWE_TTL_MS = 60 * 60 * 1000;
const SAPPHIRE_SIWE_CACHE_PREFIX = "anti-soon:sapphire-siwe:v1";

const SAPPHIRE_SIWE_ABI = parseAbi([
	"function domain() view returns (string)",
	"function login(string siweMsg, (bytes32 r, bytes32 s, uint256 v) sig) view returns (bytes token)",
]);

type Eip1193Provider = {
	request: (args: {
		method: string;
		params?: object | readonly unknown[];
	}) => Promise<unknown>;
};

type WalletSigningClient = {
	account?: { address?: unknown } | null;
	signMessage?: (args: { message: string }) => Promise<`0x${string}`>;
	request?: Eip1193Provider["request"];
};

type CachedSapphireSiweSession = {
	address: `0x${string}`;
	contract: `0x${string}`;
	domain: string;
	expiresAt: string;
	token: `0x${string}`;
};

const sapphireReadClient = createPublicClient({
	transport: http(SAPPHIRE_RPC_URL),
});

function getSessionStorage(): Storage | undefined {
	if (typeof window === "undefined" || typeof window.sessionStorage === "undefined") {
		return undefined;
	}

	return window.sessionStorage;
}

function buildSiweUri(domain: string): string {
	if (domain.startsWith("http://") || domain.startsWith("https://")) {
		return domain;
	}

	if (typeof window !== "undefined" && window.location.host === domain) {
		return window.location.origin;
	}

	return `https://${domain}`;
}

function buildSapphireSiweCacheKey(args: {
	address: `0x${string}`;
	contract: `0x${string}`;
	domain: string;
}): string {
	return [
		SAPPHIRE_SIWE_CACHE_PREFIX,
		args.contract.toLowerCase(),
		args.address.toLowerCase(),
		args.domain,
	].join(":");
}

function readCachedSapphireSiweToken(args: {
	address: `0x${string}`;
	contract: `0x${string}`;
	domain: string;
}): `0x${string}` | undefined {
	const storage = getSessionStorage();
	if (!storage) return undefined;

	const cacheKey = buildSapphireSiweCacheKey(args);
	const raw = storage.getItem(cacheKey);
	if (!raw) return undefined;

	try {
		const cached = JSON.parse(raw) as Partial<CachedSapphireSiweSession>;
		if (
			typeof cached.token !== "string" ||
			typeof cached.expiresAt !== "string" ||
			cached.token.length === 0
		) {
			storage.removeItem(cacheKey);
			return undefined;
		}

		const expiresAtMs = new Date(cached.expiresAt).getTime();
		if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
			storage.removeItem(cacheKey);
			return undefined;
		}

		return cached.token as `0x${string}`;
	} catch {
		storage.removeItem(cacheKey);
		return undefined;
	}
}

function writeCachedSapphireSiweToken(session: CachedSapphireSiweSession): void {
	const storage = getSessionStorage();
	if (!storage) return;

	storage.setItem(
		buildSapphireSiweCacheKey(session),
		JSON.stringify(session),
	);
}

function readProvider(provider?: unknown): Eip1193Provider | undefined {
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

	return undefined;
}

async function resolveSignerAddress(
	provider?: WalletSigningClient,
): Promise<`0x${string}` | undefined> {
	const directAccount = normalizeEthereumAddress(provider?.account?.address);
	if (directAccount) {
		return directAccount;
	}

	const eip1193Provider = readProvider(provider);
	if (!eip1193Provider) {
		return undefined;
	}

	for (const method of ["eth_accounts", "eth_requestAccounts"] as const) {
		try {
			const accounts = await eip1193Provider.request({ method });
			if (!Array.isArray(accounts)) continue;

			for (const account of accounts) {
				const normalized = normalizeEthereumAddress(account);
				if (normalized) {
					return normalized;
				}
			}
		} catch {
		}
	}

	return undefined;
}

async function signSiweMessage(args: {
	provider?: WalletSigningClient;
	address: `0x${string}`;
	message: string;
}): Promise<`0x${string}`> {
	if (args.provider?.signMessage) {
		return args.provider.signMessage({ message: args.message });
	}

	const eip1193Provider = readProvider(args.provider);
	if (!eip1193Provider) {
		throw new Error("No wallet available for Sapphire SIWE authentication");
	}

	const signature = await eip1193Provider.request({
		method: "personal_sign",
		params: [args.message, args.address],
	});
	if (typeof signature !== "string" || !signature.startsWith("0x")) {
		throw new Error("Wallet returned an invalid SIWE signature");
	}

	return signature as `0x${string}`;
}

async function readSapphireDomain(contract: `0x${string}`): Promise<string> {
	const { data } = await sapphireReadClient.call({
		to: contract,
		data: encodeFunctionData({
			abi: SAPPHIRE_SIWE_ABI,
			functionName: "domain",
		}),
	});

	if (!data) {
		throw new Error("Sapphire SIWE domain lookup returned no data");
	}

	const [domain] = decodeAbiParameters(parseAbiParameters("string"), data);
	if (!domain || domain.trim().length === 0) {
		throw new Error("Sapphire SIWE domain lookup returned an empty domain");
	}

	return domain;
}

async function loginWithSiwe(args: {
	contract: `0x${string}`;
	siweMessage: string;
	signature: `0x${string}`;
}): Promise<`0x${string}`> {
	const parsedSignature = parseSignature(args.signature);
	if (!("v" in parsedSignature) || typeof parsedSignature.v === "undefined") {
		throw new Error("Wallet returned a compact SIWE signature without a recovery id");
	}
	const signatureRsv = {
		r: parsedSignature.r,
		s: parsedSignature.s,
		v: parsedSignature.v,
	};

	const { data } = await sapphireReadClient.call({
		to: args.contract,
		data: encodeFunctionData({
			abi: SAPPHIRE_SIWE_ABI,
			functionName: "login",
			args: [args.siweMessage, signatureRsv],
		}),
	});

	if (!data) {
		throw new Error("Sapphire SIWE login returned no data");
	}

	const [token] = decodeAbiParameters(parseAbiParameters("bytes"), data);
	return token;
}

export async function getOrCreateSapphireSiweToken(args: {
	contract: `0x${string}`;
	ethereumProvider?: unknown;
}): Promise<`0x${string}`> {
	const contract = normalizeEthereumAddress(args.contract);
	if (!contract) {
		throw new Error("Sapphire SIWE authentication requires a valid storage contract address");
	}

	const walletProvider = (args.ethereumProvider ?? undefined) as
		| WalletSigningClient
		| undefined;
	const address = await resolveSignerAddress(walletProvider);
	if (!address) {
		throw new Error("No wallet available for Sapphire SIWE authentication");
	}

	let domain: string;
	try {
		domain = await readSapphireDomain(contract);
	} catch (error) {
		throw new Error(
			`Failed to load Sapphire SIWE domain: ${extractErrorMessage(error)}`,
		);
	}

	const cachedToken = readCachedSapphireSiweToken({
		address,
		contract,
		domain,
	});
	if (cachedToken) {
		return cachedToken;
	}

	const issuedAt = new Date();
	const expiresAt = new Date(issuedAt.getTime() + SAPPHIRE_SIWE_TTL_MS);
	const siweMessage = createSiweMessage({
		address,
		chainId: SAPPHIRE_CHAIN_ID,
		domain,
		expirationTime: expiresAt,
		issuedAt,
		nonce: generateSiweNonce(),
		statement: SAPPHIRE_SIWE_STATEMENT,
		uri: buildSiweUri(domain),
		version: "1",
	});

	let signature: `0x${string}`;
	try {
		signature = await signSiweMessage({
			provider: walletProvider,
			address,
			message: siweMessage,
		});
	} catch (error) {
		throw new Error(
			`Failed to sign Sapphire SIWE message: ${extractErrorMessage(error)}`,
		);
	}

	let token: `0x${string}`;
	try {
		token = await loginWithSiwe({
			contract,
			siweMessage,
			signature,
		});
	} catch (error) {
		throw new Error(
			`Failed to create Sapphire SIWE token: ${extractErrorMessage(error)}`,
		);
	}

	writeCachedSapphireSiweToken({
		address,
		contract,
		domain,
		expiresAt: expiresAt.toISOString(),
		token,
	});

	return token;
}
