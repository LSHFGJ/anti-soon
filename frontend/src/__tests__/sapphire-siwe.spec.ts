import {
	decodeFunctionData,
	encodeAbiParameters,
	parseAbi,
	parseAbiParameters,
} from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getOrCreateSapphireSiweToken } from "../lib/sapphireSiwe";

const SAPPHIRE_SIWE_ABI = parseAbi([
	"function domain() view returns (string)",
	"function login(string siweMsg, (bytes32 r, bytes32 s, uint256 v) sig) view returns (bytes token)",
]);

const CONTRACT = "0x000000000000000000000000000000000000dEaD" as const;
const ADDRESS = "0x1111111111111111111111111111111111111111" as const;
const TOKEN = `0x${"ab".repeat(32)}` as const;
const SIGNATURE = `0x${"11".repeat(32)}${"22".repeat(32)}1b` as const;

	describe("sapphire SIWE helper", () => {
	beforeEach(() => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(new Date("2030-01-01T00:00:00.000Z"));
		sessionStorage.clear();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
		sessionStorage.clear();
	});

	it("creates a SIWE token from the contract domain and reuses the cached token", async () => {
		const signMessage = vi.fn(async () => SIGNATURE);
		const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			expect(String(input)).toBe("https://testnet.sapphire.oasis.io/");
			const body = JSON.parse(String(init?.body)) as {
				method: string;
				params: Array<{ data?: `0x${string}` }>;
			};
			expect(body.method).toBe("eth_call");
			const call = body.params[0];
			if (!call.data) {
				throw new Error("missing call data");
			}

			const decoded = decodeFunctionData({
				abi: SAPPHIRE_SIWE_ABI,
				data: call.data,
			}) as { functionName: string; args?: readonly unknown[] };

			if (decoded.functionName === "domain") {
				return new Response(
					JSON.stringify({
						jsonrpc: "2.0",
						id: 1,
						result: encodeAbiParameters(parseAbiParameters("string"), [
							"preview.anti-soon.test",
						]),
					}),
					{
						status: 200,
						headers: { "Content-Type": "application/json" },
					},
				);
			}

			if (decoded.functionName === "login") {
				const siweMessage = decoded.args?.[0];
				expect(typeof siweMessage).toBe("string");
				expect(String(siweMessage)).toContain("preview.anti-soon.test wants you to sign in with your Ethereum account:");
				expect(String(siweMessage)).toContain(ADDRESS);
				expect(String(siweMessage)).toContain("URI: https://preview.anti-soon.test");
				return new Response(
					JSON.stringify({
						jsonrpc: "2.0",
						id: 1,
						result: encodeAbiParameters(parseAbiParameters("bytes"), [TOKEN]),
					}),
					{
						status: 200,
						headers: { "Content-Type": "application/json" },
					},
				);
			}

			throw new Error(`Unexpected function: ${decoded.functionName}`);
		});

		vi.stubGlobal("fetch", fetchMock);

		const walletClient = {
			account: { address: ADDRESS },
			signMessage,
		};

		const firstToken = await getOrCreateSapphireSiweToken({
			contract: CONTRACT,
			ethereumProvider: walletClient,
		});
		const secondToken = await getOrCreateSapphireSiweToken({
			contract: CONTRACT,
			ethereumProvider: walletClient,
		});

		expect(firstToken).toBe(TOKEN);
		expect(secondToken).toBe(TOKEN);
		expect(signMessage).toHaveBeenCalledTimes(1);
		expect(fetchMock).toHaveBeenCalledTimes(3);
	});

	it("refreshes the cached token after its local expiry window elapses", async () => {
		const signMessage = vi.fn(async () => SIGNATURE);
		const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			expect(String(input)).toBe("https://testnet.sapphire.oasis.io/");
			const body = JSON.parse(String(init?.body)) as {
				method: string;
				params: Array<{ data?: `0x${string}` }>;
			};
			const call = body.params[0];
			if (!call.data) {
				throw new Error("missing call data");
			}

			const decoded = decodeFunctionData({
				abi: SAPPHIRE_SIWE_ABI,
				data: call.data,
			}) as { functionName: string; args?: readonly unknown[] };

			if (decoded.functionName === "domain") {
				return new Response(
					JSON.stringify({
						jsonrpc: "2.0",
						id: 1,
						result: encodeAbiParameters(parseAbiParameters("string"), [
							"preview.anti-soon.test",
						]),
					}),
					{
						status: 200,
						headers: { "Content-Type": "application/json" },
					},
				);
			}

			return new Response(
				JSON.stringify({
					jsonrpc: "2.0",
					id: 1,
					result: encodeAbiParameters(parseAbiParameters("bytes"), [TOKEN]),
				}),
				{
					status: 200,
					headers: { "Content-Type": "application/json" },
				},
			);
		});

		vi.stubGlobal("fetch", fetchMock);

		const walletClient = {
			account: { address: ADDRESS },
			signMessage,
		};

		await getOrCreateSapphireSiweToken({
			contract: CONTRACT,
			ethereumProvider: walletClient,
		});
		vi.setSystemTime(new Date("2030-01-01T02:00:00.000Z"));
		await getOrCreateSapphireSiweToken({
			contract: CONTRACT,
			ethereumProvider: walletClient,
		});

		expect(signMessage).toHaveBeenCalledTimes(2);
		expect(fetchMock).toHaveBeenCalledTimes(4);
	});
});
