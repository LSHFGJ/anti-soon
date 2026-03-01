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

interface SubmissionState {
	phase: SubmissionLifecyclePhase;
	submissionId?: bigint;
	salt?: `0x${string}`;
	cipherURI?: string;
	commitHash?: `0x${string}`;
	commitTxHash?: `0x${string}`;
	revealTxHash?: `0x${string}`;
	warning?: string;
	error?: string;
}

interface SubmitPoCResult {
	submissionId?: bigint;
	commitTxHash?: `0x${string}`;
	revealTxHash?: `0x${string}`;
}

export const usePoCSubmission = () => {
	const [state, setState] = useState<SubmissionState>({ phase: "idle" });
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

	const submitPoC = useCallback(
		async (
			projectId: bigint,
			pocData: string,
		): Promise<SubmitPoCResult | undefined> => {
			const walletAddress = await resolveWalletAddress();

			if (!isConnected || !walletClient || !publicClient || !walletAddress) {
				setFailed(
					"Wallet not connected. Connect your wallet and retry submission.",
				);
				return undefined;
			}

			try {
				setState((s) => ({
					...s,
					phase: "encrypting",
					error: undefined,
					warning: undefined,
				}));

				const salt = generateRandomSalt();

				setState((s) => ({ ...s, phase: "committing" }));

				const uploadResult = await uploadEncryptedPoC({
					poc: pocData,
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

				const commitTxHash = await walletClient.writeContract(request);

				setState((s) => ({ ...s, commitTxHash }));

				const receipt = await publicClient.waitForTransactionReceipt({
					hash: commitTxHash,
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
						`Submission failed: commit confirmed but PoCCommitted event was missing in tx logs (${commitTxHash}).`,
					);
					return undefined;
				}

				setState((s) => ({ ...s, phase: "committed", submissionId }));

				setState((s) => ({ ...s, phase: "revealing" }));

				const canReveal = (await publicClient.readContract({
					account: walletAddress,
					address: BOUNTY_HUB_ADDRESS,
					abi: BOUNTY_HUB_V2_ABI,
					functionName: "canReveal",
					args: [submissionId],
				})) as boolean;

				if (!canReveal) {
					setFailed(
						"Reveal is not available yet. For MULTI projects wait until commit deadline; for UNIQUE projects ensure your submission is the active candidate.",
					);
					return undefined;
				}

				const { request: revealRequest } = await publicClient.simulateContract({
					account: walletAddress,
					address: BOUNTY_HUB_ADDRESS,
					abi: BOUNTY_HUB_V2_ABI,
					functionName: "revealPoC",
					args: [submissionId, salt],
				});

				const revealTxHash = await walletClient.writeContract(revealRequest);

				setState((s) => ({ ...s, revealTxHash }));

				await publicClient.waitForTransactionReceipt({ hash: revealTxHash });

				setState((s) => ({ ...s, phase: "revealed" }));

				return {
					submissionId,
					commitTxHash,
					revealTxHash,
				};
			} catch (err: unknown) {
				console.error("Submission error:", err);
				const message = extractErrorMessage(err);
				const normalizedMessage = message.includes("must provide an Ethereum address")
					? `Wallet returned an invalid address (wallet=${walletAddress}, bountyHub=${BOUNTY_HUB_ADDRESS}). Reconnect wallet and retry`
					: message;
				setFailed(`Submission failed: ${normalizedMessage}. Reset and try again.`);
				return undefined;
			}
		},
		[isConnected, walletClient, publicClient, resolveWalletAddress, setFailed],
	);

	const reset = useCallback(() => {
		setState({ phase: "idle" });
	}, []);

	return {
		state,
		submitPoC,
		reset,
		isSubmitting:
			state.phase !== "idle" &&
			state.phase !== "failed" &&
			state.phase !== "committed" &&
			state.phase !== "revealed",
		submissionId: state.submissionId,
		commitTxHash: state.commitTxHash,
		revealTxHash: state.revealTxHash,
		error: state.error,
	};
};
