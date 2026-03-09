import { useCallback, useEffect, useState } from "react";
import type { Address } from "viem";
import { decodeEventLog, keccak256, toBytes } from "viem";
import { BOUNTY_HUB_ADDRESS, BOUNTY_HUB_V2_ABI, CHAIN } from "../config";
import { normalizeEthereumAddress } from "../lib/address";
import {
	clearCommitRevealRecoveryContext,
	loadCommitRevealRecoveryContext,
	persistCommitRevealRecoveryContext,
} from "../lib/commitRevealRecovery";
import { extractErrorMessage } from "../lib/errorMessage";
import { uploadEncryptedPoC } from "../lib/oasisUpload";
import {
	clearPublicClientReadCache,
	readContractWithRpcFallback,
} from "../lib/publicClient";
import { computeCommitHash, generateRandomSalt } from "../utils/encryption";
import { useWallet } from "./useWallet";

export const SUBMISSION_LIFECYCLE_PHASES = [
	"idle",
	"encrypting",
	"committing",
	"committed",
	"failed",
] as const;

export type SubmissionLifecyclePhase =
	(typeof SUBMISSION_LIFECYCLE_PHASES)[number];

interface SubmissionState {
	phase: SubmissionLifecyclePhase;
	hydratedFromRecovery?: boolean;
	submissionId?: bigint;
	salt?: `0x${string}`;
	cipherURI?: string;
	commitHash?: `0x${string}`;
	commitTxHash?: `0x${string}`;
	oasisTxHash?: `0x${string}`;
	warning?: string;
	error?: string;
}

interface SubmitPoCResult {
	submissionId?: bigint;
	commitTxHash?: `0x${string}`;
}

type IndexedSubmissionTuple = readonly [
	auditor: Address,
	projectId: bigint,
	commitHash: `0x${string}`,
	...rest: readonly unknown[],
];

export const usePoCSubmission = (projectId?: bigint | null) => {
	const [state, setState] = useState<SubmissionState>({ phase: "idle" });
	const { address, walletClient, publicClient, isConnected, isWrongNetwork } = useWallet({
		autoSwitchToSepolia: false,
	});

	const recoveryWalletAddress =
		normalizeEthereumAddress(address) ??
		normalizeEthereumAddress(walletClient?.account?.address) ??
		null;

	const setFailed = useCallback((message: string) => {
		setState((s) => ({
			...s,
			phase: "failed",
			error: message,
		}));
	}, []);

	useEffect(() => {
		if (projectId == null || !recoveryWalletAddress) return;

		const recovered = loadCommitRevealRecoveryContext(
			projectId,
			recoveryWalletAddress,
			CHAIN.id,
		);
		if (!recovered?.submissionId) return;

		clearCommitRevealRecoveryContext();
	}, [projectId, recoveryWalletAddress]);

	const resolveWalletAddress = useCallback(async (): Promise<
		`0x${string}` | null
	> => {
		const fromHook = normalizeEthereumAddress(address);
		if (fromHook) return fromHook;

		const fromClientAccount = normalizeEthereumAddress(
			walletClient?.account?.address,
		);
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

			if (!isConnected || !walletClient || !walletAddress) {
				setFailed(
					"Wallet not connected. Connect your wallet and retry submission.",
				);
				return undefined;
			}

			if (isWrongNetwork) {
				setFailed("Wrong network. Switch to Sepolia and retry submission.");
				return undefined;
			}

			if (!publicClient) {
				setFailed(
					"Wallet connection is still initializing. Wait a moment and retry submission.",
				);
				return undefined;
			}
			
			let pendingCommitHash: `0x${string}` | undefined;
			let pendingCipherURI: string | undefined;
			let pendingOasisTxHash: `0x${string}` | undefined;
			let pendingCommitTxHash: `0x${string}` | undefined;

			const recoverCommittedSubmissionId = async (
				recoveryProjectId: bigint,
				recoveryWalletAddress: `0x${string}`,
				recoveryCommitHash: `0x${string}`,
			): Promise<bigint | undefined> => {
				try {
					let cursor = 0n;
					const normalizedCommitHash = recoveryCommitHash.toLowerCase();

					while (true) {
						const result = await readContractWithRpcFallback({
							address: BOUNTY_HUB_ADDRESS,
							abi: BOUNTY_HUB_V2_ABI,
							functionName: "getAuditorSubmissionIds",
							args: [recoveryWalletAddress, cursor, 10n],
						});

						if (
							!Array.isArray(result) ||
							result.length !== 2 ||
							!Array.isArray(result[0]) ||
							typeof result[1] !== "bigint"
						) {
							return undefined;
						}

						const [submissionIds, nextCursor] = result as unknown as readonly [
							readonly bigint[],
							bigint,
						];

						for (const submissionId of submissionIds) {
							const submission = (await readContractWithRpcFallback({
								address: BOUNTY_HUB_ADDRESS,
								abi: BOUNTY_HUB_V2_ABI,
								functionName: "submissions",
								args: [submissionId],
							})) as IndexedSubmissionTuple;

							if (
								submission[1] === recoveryProjectId &&
								submission[2].toLowerCase() === normalizedCommitHash
							) {
								return submissionId;
							}
						}

						if (nextCursor === 0n) {
							return undefined;
						}

						cursor = nextCursor;
					}
				} catch (recoveryError) {
					console.warn(
						"Unable to recover committed submission from on-chain indexes:",
						recoveryError,
					);
					return undefined;
				}
			};

			try {
				setState((s) => ({
					...s,
					phase: "encrypting",
					error: undefined,
					warning: undefined,
				}));

				const recovered = loadCommitRevealRecoveryContext(
					projectId,
					walletAddress,
					CHAIN.id,
				);

				if (recovered?.submissionId) {
					clearCommitRevealRecoveryContext();
				}
				const salt = recovered?.salt ?? generateRandomSalt();
				let cipherURI = recovered?.cipherURI;
				let commitHash = recovered?.commitHash;
				let oasisTxHash = recovered?.oasisTxHash;
				let submissionId = recovered?.submissionId;

				if (!cipherURI || !commitHash || !oasisTxHash) {
					const uploadResult = await uploadEncryptedPoC({
						poc: pocData,
						projectId,
						auditor: walletAddress,
					});
					cipherURI = uploadResult.cipherURI;
					oasisTxHash = uploadResult.oasisTxHash;
					const cipherHash = keccak256(toBytes(cipherURI));
					commitHash = computeCommitHash(
						cipherHash,
						walletAddress as Address,
						salt,
					);
				}

				if (!cipherURI || !commitHash || !oasisTxHash) {
					clearCommitRevealRecoveryContext();
					setFailed(
						"Submission failed: recovery context is incomplete. Reset and try again.",
					);
					return undefined;
				}

				persistCommitRevealRecoveryContext({
					projectId,
					auditor: walletAddress,
					chainId: CHAIN.id,
					salt,
					cipherURI,
					commitHash,
					oasisTxHash,
					submissionId,
				});
				pendingCipherURI = cipherURI;
				pendingCommitHash = commitHash;
				pendingOasisTxHash = oasisTxHash;

				setState((s) => ({
					...s,
					phase: "committing",
					salt,
					cipherURI,
					commitHash,
					oasisTxHash,
					submissionId,
				}));

				let commitTxHash: `0x${string}` | undefined;
				if (!submissionId) {
					const { request } = await publicClient.simulateContract({
						account: walletAddress,
						address: BOUNTY_HUB_ADDRESS,
						abi: BOUNTY_HUB_V2_ABI,
						functionName: "commitPoC",
						args: [projectId, commitHash, cipherURI],
					});

					commitTxHash = await walletClient.writeContract(request);
					pendingCommitTxHash = commitTxHash;

					setState((s) => ({ ...s, commitTxHash }));

					const receipt = await publicClient.waitForTransactionReceipt({
						hash: commitTxHash,
					});
					clearPublicClientReadCache();

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
						} catch {
							// Ignore unrelated or non-decodable logs while scanning for PoCCommitted.
						}
					}

					if (!submissionId) {
						const recoveredSubmissionId = await recoverCommittedSubmissionId(
							projectId,
							walletAddress,
							commitHash,
						);

						if (recoveredSubmissionId) {
							submissionId = recoveredSubmissionId;
						} else {
							clearCommitRevealRecoveryContext();
							setFailed(
								`Submission failed: commit confirmed but PoCCommitted event was missing in tx logs (${commitTxHash}).`,
							);
							return undefined;
						}
					}

					persistCommitRevealRecoveryContext({
						projectId,
						auditor: walletAddress,
						chainId: CHAIN.id,
						salt,
						cipherURI,
						commitHash,
						oasisTxHash,
						commitTxHash,
						submissionId,
					});
				}

				setState((s) => ({
					...s,
					phase: "committed",
					submissionId,
					error: undefined,
				}));
				if (!commitTxHash) {
					setFailed(
						"Submission failed: Sepolia commit transaction hash was missing after wallet submission.",
					);
					return undefined;
				}
				clearCommitRevealRecoveryContext();

				return {
					submissionId,
					commitTxHash,
				};
			} catch (err: unknown) {
				if (pendingCommitHash) {
					const recoveredSubmissionId = await recoverCommittedSubmissionId(
						projectId,
						walletAddress,
						pendingCommitHash,
					);

					if (recoveredSubmissionId) {
						setState((s) => ({
							...s,
							phase: "committed",
							submissionId: recoveredSubmissionId,
							cipherURI: pendingCipherURI,
							commitHash: pendingCommitHash,
							oasisTxHash: pendingOasisTxHash,
							commitTxHash: pendingCommitTxHash,
							error: undefined,
						}));
						clearCommitRevealRecoveryContext();
						return {
							submissionId: recoveredSubmissionId,
							commitTxHash: pendingCommitTxHash,
						};
					}
				}

				console.error("Submission error:", err);
				const message = extractErrorMessage(err);
				const normalizedMessage = message.includes(
					"must provide an Ethereum address",
				)
					? `Wallet returned an invalid address (wallet=${walletAddress}, bountyHub=${BOUNTY_HUB_ADDRESS}). Reconnect wallet and retry`
					: message;
				setFailed(
					`Submission failed: ${normalizedMessage}. Reset and try again.`,
				);
				return undefined;
			}
		},
		[
			isConnected,
			isWrongNetwork,
			walletClient,
			publicClient,
			resolveWalletAddress,
			setFailed,
		],
	);

	const reset = useCallback(() => {
		clearCommitRevealRecoveryContext();
		setState({ phase: "idle" });
	}, []);

	return {
		state,
		submitPoC,
		reset,
		isSubmitting:
			state.phase !== "idle" &&
			state.phase !== "failed" &&
			state.phase !== "committed",
		submissionId: state.submissionId,
		commitTxHash: state.commitTxHash,
		error: state.error,
	};
};
