import { useCallback, useEffect, useState } from "react";
import type { Address } from "viem";
import { decodeEventLog, keccak256, toBytes } from "viem";
import { BOUNTY_HUB_ADDRESS, BOUNTY_HUB_V2_ABI } from "../config";
import { normalizeEthereumAddress } from "../lib/address";
import { extractErrorMessage } from "../lib/errorMessage";
import {
	buildRevealRetryState,
	clearCommitRevealRecoveryContext,
	loadCommitRevealRecoveryContext,
	normalizeHex,
	parseSubmissionOnChainSnapshot,
	persistCommitRevealRecoveryContext,
	type RevealRetryState,
	ZERO_HEX_32,
} from "../lib/commitRevealRecovery";
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
	oasisTxHash?: `0x${string}`;
	revealTxHash?: `0x${string}`;
	revealRetry?: RevealRetryState;
	error?: string;
}

export function useCommitReveal(projectId: bigint | null, pocJson: string) {
	const [state, setState] = useState<CommitState>({ phase: "idle" });
	const { address, walletClient, publicClient, isConnected } = useWallet({
		autoSwitchToSepolia: false,
	});

	const setFailed = useCallback((message: string) => {
		setState((s) => ({
			...s,
			phase: "failed",
			error: message,
			revealRetry: undefined,
		}));
	}, []);

	const applyRecoveredCommittedState = useCallback(
		(
			recovered: {
				salt: `0x${string}`;
				cipherURI: string;
				commitHash: `0x${string}`;
				oasisTxHash: `0x${string}`;
				commitTxHash?: `0x${string}`;
				submissionId?: bigint;
			},
			phase: "committed" | "committing" | "revealed",
		) => {
			setState((current) => {
				if (current.phase !== "idle") return current;

				return {
					...current,
					phase,
					salt: recovered.salt,
					cipherURI: recovered.cipherURI,
					commitHash: recovered.commitHash,
					oasisTxHash: recovered.oasisTxHash,
					commitTxHash: recovered.commitTxHash,
					submissionId: recovered.submissionId,
					error: undefined,
					revealRetry: undefined,
				};
			});
		},
		[],
	);

	useEffect(() => {
		const recovered = loadCommitRevealRecoveryContext(projectId);
		if (!recovered) return;

		if (!recovered.submissionId || !publicClient) {
			applyRecoveredCommittedState(
				recovered,
				recovered.submissionId ? "committed" : "committing",
			);
			return;
		}

		let cancelled = false;
		const restoreFromChain = async () => {
			try {
				const submission = await publicClient.readContract({
					address: BOUNTY_HUB_ADDRESS,
					abi: BOUNTY_HUB_V2_ABI,
					functionName: "submissions",
					args: [recovered.submissionId as bigint],
				});

				if (cancelled) return;

				const snapshot = parseSubmissionOnChainSnapshot(submission);
				if (!snapshot) {
					clearCommitRevealRecoveryContext();
					setState((current) =>
						current.phase === "idle"
							? {
									...current,
									phase: "failed",
									error:
										"Recovery context is stale: submission snapshot could not be decoded. Reset and commit again.",
									revealRetry: undefined,
							  }
							: current,
					);
					return;
				}

				const sameProject = snapshot.projectId === recovered.projectId;
				const sameCommitHash =
					normalizeHex(snapshot.commitHash) === normalizeHex(recovered.commitHash);

				if (!sameProject || !sameCommitHash) {
					clearCommitRevealRecoveryContext();
					setState((current) =>
						current.phase === "idle"
							? {
									...current,
									phase: "failed",
									error:
										"Recovery context does not match on-chain submission identity. Reset and recommit before reveal.",
									revealRetry: undefined,
							  }
							: current,
					);
					return;
				}

				const onChainSalt = normalizeHex(snapshot.salt);
				const recoveredSalt = normalizeHex(recovered.salt);

				if (
					onChainSalt !== normalizeHex(ZERO_HEX_32) &&
					onChainSalt !== recoveredSalt
				) {
					clearCommitRevealRecoveryContext();
					setState((current) =>
						current.phase === "idle"
							? {
									...current,
									phase: "failed",
									error:
										"Recovery context salt does not match on-chain submission. Reset and recommit before reveal.",
									revealRetry: undefined,
							  }
							: current,
					);
					return;
				}

				if (
					snapshot.revealTimestamp > 0n ||
					onChainSalt === recoveredSalt
				) {
					clearCommitRevealRecoveryContext();
					applyRecoveredCommittedState(recovered, "revealed");
					return;
				}

				applyRecoveredCommittedState(recovered, "committed");
			} catch {
				if (cancelled) return;
				applyRecoveredCommittedState(recovered, "committed");
			}
		};

		void restoreFromChain();

		return () => {
			cancelled = true;
		};
	}, [projectId, publicClient, applyRecoveredCommittedState]);

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
			const recovered = loadCommitRevealRecoveryContext(projectId);
			if (recovered?.submissionId) {
				setState((s) => ({
					...s,
					phase: "committed",
					submissionId: recovered.submissionId,
					salt: recovered.salt,
					cipherURI: recovered.cipherURI,
					commitHash: recovered.commitHash,
					oasisTxHash: recovered.oasisTxHash,
					commitTxHash: recovered.commitTxHash,
					error: undefined,
					revealRetry: undefined,
				}));
				return;
			}

			setState((s) => ({
				...s,
				phase: "encrypting",
				error: undefined,
				revealRetry: undefined,
			}));

			const salt = recovered?.salt ?? generateRandomSalt();
			const cipherURI = recovered?.cipherURI;
			const commitHash = recovered?.commitHash;
			let oasisTxHash = recovered?.oasisTxHash;

			setState((s) => ({ ...s, phase: "committing" }));

			let finalCipherURI = cipherURI;
			let finalCommitHash = commitHash;

			if (!finalCipherURI || !finalCommitHash || !oasisTxHash) {
				const uploadResult = await uploadEncryptedPoC({
					poc: pocJson,
					projectId,
					auditor: walletAddress,
				});
				finalCipherURI = uploadResult.cipherURI;
				oasisTxHash = uploadResult.oasisTxHash;
				const cipherHash = keccak256(toBytes(finalCipherURI));
				finalCommitHash = computeCommitHash(
					cipherHash,
					walletAddress as Address,
					salt,
				);
			}

			if (!finalCipherURI || !finalCommitHash || !oasisTxHash) {
				setFailed(
					"Commit failed: recovery context is incomplete. Reset and retry commit.",
				);
				clearCommitRevealRecoveryContext();
				return;
			}

			persistCommitRevealRecoveryContext({
				projectId,
				salt,
				cipherURI: finalCipherURI,
				commitHash: finalCommitHash,
				oasisTxHash,
			});

			setState((s) => ({
				...s,
				phase: "committing",
				salt,
				cipherURI: finalCipherURI,
				commitHash: finalCommitHash,
				oasisTxHash,
				revealRetry: undefined,
			}));

			const { request } = await publicClient.simulateContract({
				account: walletAddress,
				address: BOUNTY_HUB_ADDRESS,
				abi: BOUNTY_HUB_V2_ABI,
				functionName: "commitPoC",
				args: [projectId, finalCommitHash, finalCipherURI],
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

			persistCommitRevealRecoveryContext({
				projectId,
				salt,
				cipherURI: finalCipherURI,
				commitHash: finalCommitHash,
				oasisTxHash,
				commitTxHash: txHash,
				submissionId,
			});

			setState((s) => ({
				...s,
				phase: "committed",
				submissionId,
				commitTxHash: txHash,
				revealRetry: undefined,
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

			const submission = await publicClient.readContract({
				account: walletAddress,
				address: BOUNTY_HUB_ADDRESS,
				abi: BOUNTY_HUB_V2_ABI,
				functionName: "submissions",
				args: [state.submissionId],
			});

			const snapshot = parseSubmissionOnChainSnapshot(submission);
			if (!snapshot) {
				setFailed(
					"Reveal failed: on-chain submission snapshot is unreadable. Reset and recommit.",
				);
				return;
			}

			if (projectId !== null && snapshot.projectId !== projectId) {
				clearCommitRevealRecoveryContext();
				setFailed(
					"Reveal failed: recovered submission belongs to a different project. Reset and recommit.",
				);
				return;
			}

			if (
				state.commitHash &&
				normalizeHex(snapshot.commitHash) !== normalizeHex(state.commitHash)
			) {
				clearCommitRevealRecoveryContext();
				setFailed(
					"Reveal failed: recovered submission does not match the stored commit hash. Reset and recommit.",
				);
				return;
			}

			const onChainSalt = normalizeHex(snapshot.salt);
			const recoveredSalt = normalizeHex(state.salt);

			if (onChainSalt !== normalizeHex(ZERO_HEX_32) && onChainSalt !== recoveredSalt) {
				clearCommitRevealRecoveryContext();
				setFailed(
					"Reveal failed: submissionId/salt pair mismatch detected on-chain. Reset and recommit.",
				);
				return;
			}

			if (snapshot.revealTimestamp > 0n || onChainSalt === recoveredSalt) {
				setState((s) => ({
					...s,
					phase: "revealed",
					error: undefined,
					revealRetry: undefined,
				}));
				clearCommitRevealRecoveryContext();
				return;
			}

			const canReveal = (await publicClient.readContract({
				account: walletAddress,
				address: BOUNTY_HUB_ADDRESS,
				abi: BOUNTY_HUB_V2_ABI,
				functionName: "canReveal",
				args: [state.submissionId],
			})) as boolean;

			if (!canReveal) {
				setState((s) => ({
					...s,
					phase: "failed",
					error:
						"Reveal is currently blocked by timing or UNIQUE-candidate rules. Retry after recheckIntervalMs.",
					revealRetry: buildRevealRetryState(state.submissionId),
				}));
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
			clearCommitRevealRecoveryContext();
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
		projectId,
		state.commitHash,
		state.submissionId,
		state.salt,
		resolveWalletAddress,
		setFailed,
	]);

	const reset = useCallback(() => {
		clearCommitRevealRecoveryContext();
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
