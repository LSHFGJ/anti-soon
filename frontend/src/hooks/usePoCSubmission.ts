import { useCallback, useState } from "react";
import type { Address } from "viem";
import { decodeEventLog, keccak256, toBytes } from "viem";
import { BOUNTY_HUB_ADDRESS, BOUNTY_HUB_V2_ABI } from "../config";
import { uploadEncryptedPoC } from "../lib/oasisUpload";
import { queueRevealIfEnabled } from "../lib/revealQueue";
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
	"queued",
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
	decryptionKey?: `0x${string}`;
	iv?: `0x${string}`;
	cipherURI?: string;
	commitHash?: `0x${string}`;
	ciphertext?: `0x${string}`;
	commitTxHash?: `0x${string}`;
	revealTxHash?: `0x${string}`;
	autoRevealQueued?: boolean;
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
	const { address, walletClient, publicClient, isConnected } = useWallet();

	const setFailed = useCallback((message: string) => {
		setState((s) => ({ ...s, phase: "failed", error: message }));
	}, []);

	const submitPoC = useCallback(
		async (
			projectId: bigint,
			pocData: string,
		): Promise<SubmitPoCResult | undefined> => {
			if (!isConnected || !walletClient || !publicClient || !address) {
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
					auditor: address as `0x${string}`,
				});
				const { cipherURI, decryptionKey } = uploadResult;
				const cipherHash = keccak256(toBytes(cipherURI));
				const commitHash = computeCommitHash(
					cipherHash,
					address as Address,
					salt,
				);

				setState((s) => ({
					...s,
					phase: "committing",
					salt,
					decryptionKey,
					cipherURI,
					commitHash,
				}));

				const { request } = await publicClient.simulateContract({
					account: address,
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
					submissionId = BigInt(Date.now());
				}

				setState((s) => ({ ...s, phase: "committed", submissionId }));

				let queuedRevealTxHash: `0x${string}` | null = null;
				let queueFailed = false;
				try {
					queuedRevealTxHash = await queueRevealIfEnabled({
						publicClient,
						walletClient,
						auditor: address,
						projectId,
						submissionId,
						salt,
						decryptionKey,
					});
				} catch (queueErr: unknown) {
					const queueMessage =
						queueErr instanceof Error
							? queueErr.message
							: "unknown queue error";
					console.warn("Optional auto-reveal queue failed:", queueErr);
					queueFailed = true;
					setState((s) => ({
						...s,
						phase: "committed",
						warning: `Commit succeeded, but auto-reveal queue failed: ${queueMessage}. Continue with direct reveal flow.`,
					}));
				}

				if (queuedRevealTxHash) {
					setState((s) => ({
						...s,
						phase: "queued",
						revealTxHash: queuedRevealTxHash,
						autoRevealQueued: true,
						warning: undefined,
					}));
					return {
						submissionId,
						commitTxHash,
						revealTxHash: queuedRevealTxHash,
					};
				}

				if (queueFailed) {
					return {
						submissionId,
						commitTxHash,
					};
				}

				if (!decryptionKey) {
					throw new Error("Missing decryption key from Sapphire upload result");
				}

				setState((s) => ({ ...s, phase: "revealing" }));

				const { request: revealRequest } = await publicClient.simulateContract({
					account: address,
					address: BOUNTY_HUB_ADDRESS,
					abi: BOUNTY_HUB_V2_ABI,
					functionName: "revealPoC",
					args: [submissionId, decryptionKey, salt],
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
				const message = err instanceof Error ? err.message : "unknown error";
				setFailed(`Submission failed: ${message}. Reset and try again.`);
				return undefined;
			}
		},
		[isConnected, walletClient, publicClient, address, setFailed],
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
			state.phase !== "queued" &&
			state.phase !== "revealed",
		submissionId: state.submissionId,
		commitTxHash: state.commitTxHash,
		revealTxHash: state.revealTxHash,
		error: state.error,
	};
};
