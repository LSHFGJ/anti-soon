import type { Address, PublicClient, WalletClient } from "viem";
import {
	BOUNTY_HUB_ADDRESS,
	BOUNTY_HUB_PROJECTS_LEGACY_ABI,
	BOUNTY_HUB_PROJECTS_V4_ABI,
	BOUNTY_HUB_V2_ABI,
} from "../config";

const ENV =
	(import.meta as ImportMeta & { env?: Record<string, string | undefined> })
		.env ?? {};

const AUTO_REVEAL_ENABLED = ENV.VITE_ENABLE_AUTO_REVEAL_QUEUE === "true";

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

export async function queueRevealIfEnabled({
	publicClient,
	walletClient,
	auditor,
	projectId,
	submissionId,
	salt,
	decryptionKey,
}: {
	publicClient: PublicClient;
	walletClient: WalletClient;
	auditor: Address;
	projectId: bigint;
	submissionId: bigint;
	salt: `0x${string}`;
	decryptionKey: `0x${string}`;
}): Promise<`0x${string}` | null> {
	if (!AUTO_REVEAL_ENABLED) {
		return null;
	}

	const readProjectWindow = async (): Promise<{ mode: bigint; revealDeadline: bigint }> => {
		try {
			const project = (await publicClient.readContract({
				address: BOUNTY_HUB_ADDRESS,
				abi: BOUNTY_HUB_PROJECTS_V4_ABI,
				functionName: "projects",
				args: [projectId],
			})) as { mode: number; revealDeadline: bigint };

			return { mode: BigInt(project.mode), revealDeadline: project.revealDeadline };
		} catch {
			const project = (await publicClient.readContract({
				address: BOUNTY_HUB_ADDRESS,
				abi: BOUNTY_HUB_PROJECTS_LEGACY_ABI,
				functionName: "projects",
				args: [projectId],
			})) as { mode: number; revealDeadline: bigint };

			return { mode: BigInt(project.mode), revealDeadline: project.revealDeadline };
		}
	};

	const { mode, revealDeadline } = await readProjectWindow();

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
			decryptionKey,
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
		args: [auditor, submissionId, decryptionKey, salt, revealDeadline, signature],
	});

	const txHash = await walletClient.writeContract(request);
	await publicClient.waitForTransactionReceipt({ hash: txHash });
	return txHash;
}
