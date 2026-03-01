import { useCallback, useState } from "react";
import type { Address } from "viem";
import { decodeEventLog, keccak256, toBytes } from "viem";
import { BOUNTY_HUB_ADDRESS, BOUNTY_HUB_V2_ABI } from "../config";
import { normalizeEthereumAddress } from "../lib/address";
import { extractErrorMessage } from "../lib/errorMessage";
import { uploadEncryptedPoC } from "../lib/oasisUpload";
import {
	computeCommitHash,
	generateRandomSalt,
} from "../utils/encryption";
import { useWallet } from "./useWallet";

export const SUBMISSION_LIFECYCLE_PHASES = [
	"idle",
	"encrypting",
	"committing",
	"committed",
	"revealing",
	"revealed",
	"failed",
] as const;

export type SubmissionLifecyclePhase =
	(typeof SUBMISSION_LIFECYCLE_PHASES)[number];

interface CommitState {
	phase: SubmissionLifecyclePhase;
	submissionId?: bigint;
	salt?: `0x${string}`;
	cipherURI?: string;
	commitHash?: `0x${string}`;
	commitTxHash?: `0x${string}`;
	revealTxHash?: `0x${string}`;
	error?: string;
}

export function useCommitReveal(projectId: bigint | null, pocJson: string) {
	const [state, setState] = useState<CommitState>({ phase: "idle" });
	const { address, walletClient, publicClient, isConnected } = useWallet({
		autoSwitchToSepolia: false,
	});

	const setFailed = useCallback((message: string) => {
		setState((s) => ({ ...s, phase: "failed", error: message }));
	}, []);

	const resolveWalletAddress = useCallback(async (): Promise<`0x${string}` | null> => {
		const fromHook = normalizeEthereumAddress(address);
		if (fromHook) return fromHook;

		const fromClientAccount = normalizeEthereumAddress(walletClient?.account?.address);
		if (fromClientAccount) return fromClientAccount;

		if (walletClient && "getAddresses" in walletClient) {
			try {
				const [firstAddress] = await walletClient.getAddresses();
				const fromClientAddresses = normalizeEthereumAddress(firstAddress);
				if (fromClientAddresses) return fromClientAddresses;
			} catch (err) {
				console.warn("Unable to resolve wallet address via getAddresses:", err);
			}
		}

		return null;
	}, [address, walletClient]);

	const commit = useCallback(async () => {
		if (projectId === null) {
			setFailed(
				"Project context is missing. Open Builder from Explorer or a project detail page.",
			);
			return;
		}

		const walletAddress = await resolveWalletAddress();

		if (!isConnected || !walletClient || !publicClient || !walletAddress) {
			setFailed("Wallet not connected. Connect your wallet and retry commit.");
			return;
		}

		try {
			setState((s) => ({
				...s,
				phase: "encrypting",
				error: undefined,
			}));

			const salt = generateRandomSalt();

			setState((s) => ({ ...s, phase: "committing" }));

			const uploadResult = await uploadEncryptedPoC({
				poc: pocJson,
				projectId,
				auditor: walletAddress,
			});
			const { cipherURI } = uploadResult;
			const cipherHash = keccak256(toBytes(cipherURI));
			const commitHash = computeCommitHash(
				cipherHash,
				walletAddress as Address,
				salt,
			);

			setState((s) => ({
				...s,
				phase: "committing",
				salt,
				cipherURI,
				commitHash,
			}));

			const { request } = await publicClient.simulateContract({
				account: walletAddress,
				address: BOUNTY_HUB_ADDRESS,
				abi: BOUNTY_HUB_V2_ABI,
				functionName: "commitPoC",
				args: [projectId, commitHash, cipherURI],
			});

			const txHash = await walletClient.writeContract(request);

			setState((s) => ({ ...s, commitTxHash: txHash }));

			const receipt = await publicClient.waitForTransactionReceipt({
				hash: txHash,
			});

			let submissionId: bigint | undefined;
			for (const log of receipt.logs) {
				try {
					const decoded = decodeEventLog({
						abi: BOUNTY_HUB_V2_ABI,
						data: log.data,
						topics: log.topics,
					});
					if (decoded.eventName === "PoCCommitted" && decoded.args) {
						const args = decoded.args as { submissionId?: bigint };
						submissionId = args.submissionId;
						break;
					}
				} catch {}
			}

			if (!submissionId) {
				setFailed(
					`Commit confirmed but PoCCommitted event was missing in tx logs (${txHash}). Open the tx in explorer and retry from submission detail.`,
				);
				return;
			}

			setState((s) => ({
				...s,
				phase: "committed",
				submissionId,
			}));
		} catch (err: unknown) {
			console.error("Commit error:", err);
			const message = extractErrorMessage(err);
			const normalizedMessage = message.includes("must provide an Ethereum address")
				? `Wallet returned an invalid address (wallet=${walletAddress}, bountyHub=${BOUNTY_HUB_ADDRESS}). Reconnect wallet and retry`
				: message;
			setFailed(`Commit failed: ${normalizedMessage}. Reset and try again.`);
		}
	}, [
		isConnected,
		walletClient,
		publicClient,
		projectId,
		pocJson,
		resolveWalletAddress,
		setFailed,
	]);

	const reveal = useCallback(async () => {
		const walletAddress = await resolveWalletAddress();

		if (!isConnected || !walletClient || !publicClient || !walletAddress) {
			setFailed("Wallet not connected. Connect your wallet and retry reveal.");
			return;
		}

		if (!state.submissionId || !state.salt) {
			setFailed(
				"No committed submission found. Complete commit before reveal.",
			);
			return;
		}

		try {
			setState((s) => ({ ...s, phase: "revealing", error: undefined }));

			const canReveal = (await publicClient.readContract({
				account: walletAddress,
				address: BOUNTY_HUB_ADDRESS,
				abi: BOUNTY_HUB_V2_ABI,
				functionName: "canReveal",
				args: [state.submissionId],
			})) as boolean;

			if (!canReveal) {
				setFailed(
					"Reveal is not available yet. For MULTI projects wait until commit deadline; for UNIQUE projects ensure your submission is the active candidate.",
				);
				return;
			}

			const { request } = await publicClient.simulateContract({
				account: walletAddress,
				address: BOUNTY_HUB_ADDRESS,
				abi: BOUNTY_HUB_V2_ABI,
				functionName: "revealPoC",
				args: [state.submissionId, state.salt],
			});

			const txHash = await walletClient.writeContract(request);

			setState((s) => ({ ...s, revealTxHash: txHash }));

			await publicClient.waitForTransactionReceipt({ hash: txHash });

			setState((s) => ({ ...s, phase: "revealed" }));
		} catch (err: unknown) {
			console.error("Reveal error:", err);
			const message = extractErrorMessage(err);
			const normalizedMessage = message.includes("must provide an Ethereum address")
				? `Wallet returned an invalid address (wallet=${walletAddress}, bountyHub=${BOUNTY_HUB_ADDRESS}). Reconnect wallet and retry`
				: message;
			setFailed(`Reveal failed: ${normalizedMessage}. Reset and retry reveal.`);
		}
	}, [
		isConnected,
		walletClient,
		publicClient,
		state.submissionId,
		state.salt,
		resolveWalletAddress,
		setFailed,
	]);

	const reset = useCallback(() => {
		setState({ phase: "idle" });
	}, []);

	return {
		state,
		commit,
		reveal,
		reset,
		isConnected,
	};
}
