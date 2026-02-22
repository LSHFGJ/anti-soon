import { useCallback, useState } from "react";
import type { Address } from "viem";
import { decodeEventLog, keccak256, toBytes } from "viem";
import { BOUNTY_HUB_ADDRESS, BOUNTY_HUB_V2_ABI } from "../config";
import { uploadEncryptedPoC } from "../lib/ipfsUpload";
import { queueRevealIfEnabled } from "../lib/revealQueue";
import {
	aesGcmEncrypt,
	computeCommitHash,
	generateRandomSalt,
} from "../utils/encryption";
import { useProjectPublicKey } from "./useProjectPublicKey";
import { useWallet } from "./useWallet";

// Helper to convert hex string to Uint8Array
function hexToBytes(hex: `0x${string}`): Uint8Array {
	const clean = hex.slice(2);
	const bytes = new Uint8Array(clean.length / 2);
	for (let i = 0; i < clean.length; i += 2) {
		bytes[i / 2] = parseInt(clean.slice(i, i + 2), 16);
	}
	return bytes;
}

// Helper to convert Uint8Array to hex string
function bytesToHex(bytes: Uint8Array): string {
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

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

interface CommitState {
	phase: SubmissionLifecyclePhase;
	submissionId?: bigint;
	salt?: `0x${string}`;
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

export function useCommitReveal(projectId: bigint | null, pocJson: string) {
	const [state, setState] = useState<CommitState>({ phase: "idle" });
	const { address, walletClient, publicClient, isConnected } = useWallet();
	const {
		publicKey,
		isLoading: isKeyLoading,
		error: keyError,
	} = useProjectPublicKey(projectId);

	const setFailed = useCallback((message: string) => {
		setState((s) => ({ ...s, phase: "failed", error: message }));
	}, []);

	const commit = useCallback(async () => {
		if (projectId === null) {
			setFailed(
				"Project context is missing. Open Builder from Explorer or a project detail page.",
			);
			return;
		}

		if (!isConnected || !walletClient || !publicClient || !address) {
			setFailed("Wallet not connected. Connect your wallet and retry commit.");
			return;
		}

		if (isKeyLoading) {
			setFailed(
				"Project public key still loading. Retry commit after key retrieval completes.",
			);
			return;
		}

		if (!publicKey) {
			setFailed(
				"Project public key is unavailable. Ensure the project is registered with a public key before submitting.",
			);
			return;
		}

		if (keyError) {
			setFailed(
				`Failed to load project public key: ${keyError.message}. Retry after the read succeeds.`,
			);
			return;
		}

		try {
			setState((s) => ({
				...s,
				phase: "encrypting",
				error: undefined,
				warning: undefined,
			}));

			const publicKeyBytes = hexToBytes(publicKey);
			const { ciphertext, iv } = await aesGcmEncrypt(pocJson, publicKeyBytes);

			const ciphertextHex = `0x${bytesToHex(ciphertext)}` as `0x${string}`;
			const ivHex = `0x${bytesToHex(iv)}` as `0x${string}`;

			const salt = generateRandomSalt();

			setState((s) => ({ ...s, phase: "committing" }));

			const cipherURI = await uploadEncryptedPoC({
				ciphertext: ciphertextHex,
				iv: ivHex,
				apiBaseUrl: import.meta.env.VITE_API_URL,
			});
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
				iv: ivHex,
				ciphertext: ciphertextHex,
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
				submissionId = BigInt(Date.now());
			}

			setState((s) => ({
				...s,
				phase: "committed",
				submissionId,
			}));

			let queuedRevealTxHash: `0x${string}` | null = null;
			try {
				queuedRevealTxHash = await queueRevealIfEnabled({
					publicClient,
					walletClient,
					auditor: address,
					projectId,
					submissionId,
					salt,
				});
			} catch (queueErr: unknown) {
				const queueMessage =
					queueErr instanceof Error ? queueErr.message : "unknown queue error";
				console.warn("Optional auto-reveal queue failed:", queueErr);
				setState((s) => ({
					...s,
					phase: "committed",
					warning: `Commit succeeded, but auto-reveal queue failed: ${queueMessage}. You can continue with manual reveal.`,
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
			}
		} catch (err: unknown) {
			console.error("Commit error:", err);
			const message = err instanceof Error ? err.message : "unknown error";
			setFailed(`Commit failed: ${message}. Reset and try again.`);
		}
	}, [
		isConnected,
		walletClient,
		publicClient,
		address,
		projectId,
		pocJson,
		publicKey,
		isKeyLoading,
		keyError,
		setFailed,
	]);

	const reveal = useCallback(async () => {
		if (!isConnected || !walletClient || !publicClient || !address) {
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

			// Vault DON manages the decryption key, so we pass zero
			// The CRE workflow will decrypt using the DON's private key
			const zeroKey =
				"0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`;

			const { request } = await publicClient.simulateContract({
				account: address,
				address: BOUNTY_HUB_ADDRESS,
				abi: BOUNTY_HUB_V2_ABI,
				functionName: "revealPoC",
				args: [state.submissionId, zeroKey, state.salt],
			});

			const txHash = await walletClient.writeContract(request);

			setState((s) => ({ ...s, revealTxHash: txHash }));

			await publicClient.waitForTransactionReceipt({ hash: txHash });

			setState((s) => ({ ...s, phase: "revealed" }));
		} catch (err: unknown) {
			console.error("Reveal error:", err);
			const message = err instanceof Error ? err.message : "unknown error";
			setFailed(`Reveal failed: ${message}. Reset and retry reveal.`);
		}
	}, [
		isConnected,
		walletClient,
		publicClient,
		address,
		state.submissionId,
		state.salt,
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
