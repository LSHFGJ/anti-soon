import type { Address, PublicClient, WalletClient } from "viem";
import { BOUNTY_HUB_ADDRESS, BOUNTY_HUB_V2_ABI } from "../config";

const ENV =
	(import.meta as ImportMeta & { env?: Record<string, string | undefined> })
		.env ?? {};

const AUTO_REVEAL_ENABLED = ENV.VITE_ENABLE_AUTO_REVEAL_QUEUE === "true";
const ZERO_KEY =
	"0x0000000000000000000000000000000000000000000000000000000000000000" as const;

const QUEUE_REVEAL_BY_SIG_TYPES = {
	QueueRevealBySig: [
		{ name: "auditor", type: "address" },
		{ name: "submissionId", type: "uint256" },
		{ name: "decryptionKey", type: "bytes32" },
		{ name: "salt", type: "bytes32" },
		{ name: "nonce", type: "uint256" },
		{ name: "deadline", type: "uint256" },
	],
} as const;

function readBigInt(value: unknown): bigint {
	if (typeof value === "bigint") return value;
	if (typeof value === "number") return BigInt(value);
	throw new Error("Expected bigint-compatible value");
}

export async function queueRevealIfEnabled({
	publicClient,
	walletClient,
	auditor,
	projectId,
	submissionId,
	salt,
}: {
	publicClient: PublicClient;
	walletClient: WalletClient;
	auditor: Address;
	projectId: bigint;
	submissionId: bigint;
	salt: `0x${string}`;
}): Promise<`0x${string}` | null> {
	if (!AUTO_REVEAL_ENABLED) {
		return null;
	}

	const projectData = (await publicClient.readContract({
		address: BOUNTY_HUB_ADDRESS,
		abi: BOUNTY_HUB_V2_ABI,
		functionName: "projects",
		args: [projectId],
	})) as readonly unknown[];

	const mode = readBigInt(projectData[6]);
	const revealDeadline = readBigInt(projectData[8]);

	if (mode !== 1n || revealDeadline === 0n) {
		return null;
	}

	const nonce = (await publicClient.readContract({
		address: BOUNTY_HUB_ADDRESS,
		abi: BOUNTY_HUB_V2_ABI,
		functionName: "sigNonces",
		args: [auditor],
	})) as bigint;

	const chainId = await publicClient.getChainId();
	const signature = await walletClient.signTypedData({
		account: auditor,
		domain: {
			name: "BountyHub",
			version: "1",
			chainId,
			verifyingContract: BOUNTY_HUB_ADDRESS,
		},
		primaryType: "QueueRevealBySig",
		types: QUEUE_REVEAL_BY_SIG_TYPES,
		message: {
			auditor,
			submissionId,
			decryptionKey: ZERO_KEY,
			salt,
			nonce,
			deadline: revealDeadline,
		},
	});

	const { request } = await publicClient.simulateContract({
		account: auditor,
		address: BOUNTY_HUB_ADDRESS,
		abi: BOUNTY_HUB_V2_ABI,
		functionName: "queueRevealBySig",
		args: [auditor, submissionId, ZERO_KEY, salt, revealDeadline, signature],
	});

	const txHash = await walletClient.writeContract(request);
	await publicClient.waitForTransactionReceipt({ hash: txHash });
	return txHash;
}
