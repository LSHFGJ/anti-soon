import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { Address } from "viem";
import { formatEther, type GetLogsReturnType, parseAbiItem } from "viem";
import { explorerAddressUrl, explorerTxUrl } from "@/lib/explorerLinks";
import { SeverityBadge } from "../components/shared/SeverityBadge";
import { StatCard } from "../components/shared/StatCard";
import {
	NeonPanel,
	PageHeader,
	StatusBanner,
} from "../components/shared/ui-primitives";
import { Card, CardContent } from "../components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "../components/ui/table";
import { BOUNTY_HUB_ADDRESS, BOUNTY_HUB_V2_ABI } from "../config";
import { useWallet } from "../hooks/useWallet";
import {
	discoverDeploymentBlockWithFallback,
	getLogsWithRangeFallback,
} from "../lib/chainLogs";
import { deriveDashboardMetrics } from "../lib/dashboardLeaderboardCompute";
import { readStoredPoCPreview } from "../lib/oasisUpload";
import {
	getBlockNumberWithRpcFallback,
	getLogsWithRpcFallback,
	multicallWithRpcFallback,
} from "../lib/publicClient";
import { getActualStatus } from "../lib/status";
import { readAllAuditorSubmissionIds } from "../lib/submissionIndex";
import type { ExtendedSubmission } from "../types";
import { STATUS_LABELS } from "../types";

const POC_COMMITTED_EVENT = parseAbiItem(
	"event PoCCommitted(uint256 indexed submissionId, uint256 indexed projectId, address indexed auditor, bytes32 commitHash)",
);
type PoCCommittedLog = GetLogsReturnType<
	typeof POC_COMMITTED_EVENT,
	[typeof POC_COMMITTED_EVENT],
	true
>[number];

type SubmissionTuple = readonly [
	auditor: Address,
	projectId: bigint,
	commitHash: `0x${string}`,
	cipherURI: string,
	salt: `0x${string}`,
	commitTimestamp: bigint,
	revealTimestamp: bigint,
	status: number,
	drainAmountWei: bigint,
	severity: number,
	payoutAmount: bigint,
	disputeDeadline: bigint,
	challenged: boolean,
	challenger: Address,
	challengeBond: bigint,
];

type SubmissionLifecycleTuple = readonly [
	status: number,
	juryDeadline: bigint,
	adjudicationDeadline: bigint,
	verdictSource: number,
	finalValidity: number,
	juryLedgerDigest: `0x${string}`,
	ownerTestimonyDigest: `0x${string}`,
];

type SubmissionJuryTuple = readonly [
	exists: boolean,
	action: string,
	rationale: string,
];

type SubmissionGroupingTuple = readonly [
	exists: boolean,
	cohort: string,
	groupId: string,
	groupRank: bigint,
	groupSize: bigint,
];

type MulticallEntry<T> =
	| { status: "success"; result: T }
	| { status: "failure"; error?: unknown };

const SUBMISSION_LOAD_ERROR = "Failed to load your submissions from blockchain";

function readRequiredMulticallEntry<T>(entry: unknown): T {
	if (entry && typeof entry === "object" && "status" in entry) {
		const typedEntry = entry as MulticallEntry<T>;
		if (typedEntry.status === "success") {
			return typedEntry.result;
		}

		throw typedEntry.error instanceof Error
			? typedEntry.error
			: new Error("Required multicall entry failed");
	}

	return entry as T;
}

function readOptionalMulticallEntry<T>(entry: unknown): T | null {
	if (entry && typeof entry === "object" && "status" in entry) {
		const typedEntry = entry as MulticallEntry<T>;
		return typedEntry.status === "success" ? typedEntry.result : null;
	}

	return (entry as T | null) ?? null;
}

function mapSubmissionWithMetadata(
	id: bigint,
	data: SubmissionTuple,
	lifecycleData: SubmissionLifecycleTuple,
	juryData: SubmissionJuryTuple,
	groupingData: SubmissionGroupingTuple,
	commitTxHash?: `0x${string}`,
): ExtendedSubmission {
	return {
		id,
		auditor: data[0],
		projectId: data[1],
		commitHash: data[2],
		cipherURI: data[3],
		salt: data[4],
		commitTimestamp: data[5],
		revealTimestamp: data[6],
		status: data[7],
		drainAmountWei: data[8],
		severity: data[9],
		payoutAmount: data[10],
		disputeDeadline: data[11],
		challenged: data[12],
		challenger: data[13],
		challengeBond: data[14],
		commitTxHash,
		lifecycle: {
			status: lifecycleData[0],
			juryDeadline: lifecycleData[1],
			adjudicationDeadline: lifecycleData[2],
			verdictSource: lifecycleData[3],
			finalValidity: lifecycleData[4],
			juryLedgerDigest: lifecycleData[5],
			ownerTestimonyDigest: lifecycleData[6],
		},
		jury: juryData[0]
			? { action: juryData[1], rationale: juryData[2] }
			: undefined,
		grouping: groupingData[0]
			? {
					cohort: groupingData[1],
					groupId: groupingData[2],
					groupRank: Number(groupingData[3]),
					groupSize: Number(groupingData[4]),
				}
			: undefined,
	};
}

export function Dashboard() {
	const { address, isConnected, isConnecting, connect, walletClient } =
		useWallet({ autoSwitchToSepolia: false });
	const [submissions, setSubmissions] = useState<ExtendedSubmission[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [previewSubmissionId, setPreviewSubmissionId] = useState<bigint | null>(
		null,
	);
	const [previewContent, setPreviewContent] = useState<string | null>(null);
	const [previewError, setPreviewError] = useState<string | null>(null);
	const [previewLoadingId, setPreviewLoadingId] = useState<bigint | null>(null);
	const submissionsRequestIdRef = useRef(0);

	const STATUS_VERIFIED = 2;

	const metrics = useMemo(
		() => deriveDashboardMetrics(submissions),
		[submissions],
	);

	const { totalEarned, totalCount, validCount, pendingCount, pendingPayouts } =
		metrics;

	const fetchUserSubmissions = useCallback(
		async (userAddress: Address) => {
			const requestId = ++submissionsRequestIdRef.current;
			try {
				setIsLoading(true);
				setError(null);

				const submissionIds = await readAllAuditorSubmissionIds(userAddress);
				if (submissionsRequestIdRef.current !== requestId) {
					return;
				}

				if (submissionIds.length === 0) {
					if (submissionsRequestIdRef.current !== requestId) {
						return;
					}
					setSubmissions([]);
					return;
				}

				const commitTxHashByIdPromise = getLogsWithRangeFallback<PoCCommittedLog>({
					fetchLogs: (range) =>
						getLogsWithRpcFallback({
							address: BOUNTY_HUB_ADDRESS,
							event: POC_COMMITTED_EVENT,
							strict: true,
							args: { auditor: userAddress },
							...(range ?? {}),
							toBlock: range?.toBlock ?? "latest",
						}) as Promise<PoCCommittedLog[]>,
					getLatestBlock: () => getBlockNumberWithRpcFallback(),
					getStartBlock: async (latestBlock) =>
						discoverDeploymentBlockWithFallback(
							BOUNTY_HUB_ADDRESS,
							latestBlock,
						),
				})
					.then(
						(logs) =>
							new Map(
								logs
									.map((log) => {
										const submissionId = log.args.submissionId;
										if (!submissionId || !log.transactionHash) {
											return null;
										}

										return [submissionId.toString(), log.transactionHash] as const;
									})
									.filter(
										(entry): entry is readonly [string, `0x${string}`] =>
											entry !== null,
									),
							),
					)
					.catch((lookupError) => {
						console.warn("Optional commit tx lookup failed:", lookupError);
						return new Map<string, `0x${string}`>();
					});

				const submissionContracts = submissionIds.flatMap((id) => [
					{
						address: BOUNTY_HUB_ADDRESS,
						abi: BOUNTY_HUB_V2_ABI,
						functionName: "submissions" as const,
						args: [id] as const,
					},
					{
						address: BOUNTY_HUB_ADDRESS,
						abi: BOUNTY_HUB_V2_ABI,
						functionName: "getSubmissionLifecycle" as const,
						args: [id] as const,
					},
					{
						address: BOUNTY_HUB_ADDRESS,
						abi: BOUNTY_HUB_V2_ABI,
						functionName: "getSubmissionJuryMetadata" as const,
						args: [id] as const,
					},
					{
						address: BOUNTY_HUB_ADDRESS,
						abi: BOUNTY_HUB_V2_ABI,
						functionName: "getSubmissionGroupingMetadata" as const,
						args: [id] as const,
					},
				]);

				const [results, commitTxHashById] = await Promise.all([
					multicallWithRpcFallback({
						contracts: submissionContracts,
						allowFailure: true,
					}) as Promise<readonly unknown[]>,
					commitTxHashByIdPromise,
				]);
				const fetchedSubmissions: ExtendedSubmission[] = submissionIds.map(
					(submissionId, index) => {
						const data = readRequiredMulticallEntry<SubmissionTuple>(results[index * 4]);
						const lifecycleData = readOptionalMulticallEntry<SubmissionLifecycleTuple>(
							results[index * 4 + 1],
						) ?? [data[7], 0n, 0n, 0, 0, "0x0", "0x0"];
						const juryData = readOptionalMulticallEntry<SubmissionJuryTuple>(
							results[index * 4 + 2],
						) ?? [false, "", ""];
						const groupingData = readOptionalMulticallEntry<SubmissionGroupingTuple>(
							results[index * 4 + 3],
						) ?? [false, "", "", 0n, 0n];

						return mapSubmissionWithMetadata(
							submissionId,
							data,
							lifecycleData,
							juryData,
							groupingData,
							commitTxHashById.get(submissionId.toString()),
						);
					},
				);

				if (submissionsRequestIdRef.current !== requestId) {
					return;
				}
				setSubmissions(fetchedSubmissions);
			} catch (err) {
				console.error("Failed to fetch submissions:", err);
				if (submissionsRequestIdRef.current !== requestId) {
					return;
				}
				setSubmissions([]);
				setError(SUBMISSION_LOAD_ERROR);
			} finally {
				if (submissionsRequestIdRef.current === requestId) {
					setIsLoading(false);
				}
			}
		},
		[],
	);

	const handlePreviewPoC = useCallback(
		async (submission: ExtendedSubmission) => {
			setPreviewSubmissionId(submission.id);
			setPreviewLoadingId(submission.id);
			setPreviewError(null);

			try {
				const preview = await readStoredPoCPreview({
					cipherURI: submission.cipherURI,
					fallbackAuditor: submission.auditor,
					ethereumProvider: walletClient,
				});
				setPreviewContent(JSON.stringify(preview.poc, null, 2));
			} catch (previewErr) {
				setPreviewContent(null);
				setPreviewError(
					previewErr instanceof Error ? previewErr.message : String(previewErr),
				);
			} finally {
				setPreviewLoadingId(null);
			}
		},
		[walletClient],
	);

	useEffect(() => {
		if (isConnected && address) {
			fetchUserSubmissions(address);
		}
	}, [isConnected, address, fetchUserSubmissions]);

	const formatTimestamp = (timestamp: bigint) => {
		if (timestamp === 0n) return "N/A";
		return new Date(Number(timestamp) * 1000).toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
			hour: "2-digit",
			minute: "2-digit",
		});
	};

	const getStatusClass = (status: number) => {
		if (status <= 1) return "status-primary";
		if (status === 5) return "status-error";
		return "status-secondary";
	};

	if (!isConnected) {
		return (
			<div className="min-h-[calc(100vh-142px)] flex flex-col py-6">
				<div className="container flex-1 flex flex-col min-h-0">
					<PageHeader
						title="DASHBOARD"
						subtitle="> Connect wallet to unlock your auditor metrics"
					/>
					<div className="flex-1 flex items-center justify-center">
						<Card className="w-full max-w-md border-white/5 bg-[var(--color-bg-panel)] backdrop-blur-md relative overflow-hidden shadow-2xl">
							<div className="absolute inset-0 bg-[repeating-linear-gradient(0deg,transparent,transparent_2px,var(--color-primary-dim)_2px,var(--color-primary-dim)_4px)] opacity-20 pointer-events-none" />

							<CardContent className="p-8 text-center relative z-10">
								<div className="w-20 h-20 mx-auto mb-6 border-2 border-[var(--color-primary)] rounded-full flex items-center justify-center bg-[var(--color-primary-dim)] shadow-[0_0_30px_var(--color-primary-dim)]">
									<svg
										width="32"
										height="32"
										viewBox="0 0 24 24"
										fill="none"
										stroke="var(--color-primary)"
										strokeWidth="2"
									>
										<title>Wallet lock icon</title>
										<rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
										<path d="M7 11V7a5 5 0 0 1 10 0v4" />
									</svg>
								</div>

								<h1 className="font-mono text-2xl mb-4 tracking-[0.1em] text-[var(--color-text)] text-shadow-[0_0_10px_rgba(255,255,255,0.1)]">
									AUDITOR DASHBOARD
								</h1>

								<p className="text-[var(--color-text-dim)] font-mono text-sm mb-8 leading-relaxed">
									Connect your wallet to view your submissions,
									<br />
									track earnings, and manage pending payouts.
								</p>

								<button
									type="button"
									onClick={connect}
									disabled={isConnecting}
									className="bg-[var(--color-primary-dim)] text-[var(--color-primary)] border border-[var(--color-primary)] px-12 py-4 font-mono text-sm tracking-[0.1em] cursor-pointer shadow-[0_0_20px_var(--color-primary-dim)] hover:shadow-[0_0_30px_var(--color-primary-glow)] hover:bg-[var(--color-primary)] hover:text-[var(--color-bg)] hover:-translate-y-0.5 transition-all duration-200 ease-linear disabled:opacity-70 disabled:cursor-wait uppercase font-bold"
								>
									{isConnecting ? "CONNECTING..." : "CONNECT WALLET"}
								</button>
							</CardContent>
						</Card>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="min-h-[calc(100vh-142px)] flex flex-col py-6">
			<div className="container flex-1 flex flex-col min-h-0">
				<PageHeader
					title="DASHBOARD"
					subtitle="> Your audit performance and submission history"
					suffix={
						<a
							href={address ? explorerAddressUrl(address) : undefined}
							target="_blank"
							rel="noreferrer"
							className="text-[var(--color-text-dim)] text-xs font-mono hover:text-[var(--color-primary)] hover:underline"
						>
							[{address?.slice(0, 6)}...{address?.slice(-4)}]
						</a>
					}
				/>

				{error && (
					<StatusBanner
						variant={
							error.includes("Preview mode active") ? "warning" : "error"
						}
						className="mb-4"
						message={error}
					/>
				)}

				<div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 flex-shrink-0">
					<StatCard
						label="TOTAL EARNED"
						value={`${formatEther(totalEarned)} ETH`}
					/>
					<StatCard
						label="SUBMISSIONS"
						value={totalCount}
						color="var(--color-text)"
					/>
					<StatCard
						label="VALID"
						value={validCount}
						color="var(--color-secondary)"
						subValue={
							totalCount > 0
								? `${Math.round((validCount / totalCount) * 100)}% rate`
								: undefined
						}
					/>
					<StatCard
						label="PENDING"
						value={pendingCount}
						color="var(--color-warning)"
					/>
				</div>

				{pendingPayouts.length > 0 && (
					<section className="mb-8 flex-shrink-0">
						<h2 className="font-mono text-lg text-[var(--color-warning)] mb-4 tracking-[0.05em] flex items-center gap-2">
							<span className="w-2 h-2 bg-[var(--color-warning)] rounded-full animate-pulse" />
							PENDING PAYOUTS [{pendingPayouts.length}]
						</h2>
						<NeonPanel
							tone="warning"
							className="shadow-[0_0_30px_rgba(245,158,11,0.15)] overflow-hidden"
							contentClassName="p-0"
						>
							<Table>
								<TableBody>
									{pendingPayouts.map((sub) => (
										<TableRow
											key={sub.id.toString()}
											className="border-[var(--color-bg-light)] hover:bg-[rgba(245,158,11,0.05)] font-mono text-sm"
										>
											<TableCell className="py-4 px-6">
												<span className="text-[var(--color-text-dim)]">
													PROJECT #{sub.projectId.toString()}
												</span>
												<span className="mx-2 text-[var(--color-text-dim)]">
													|
												</span>
												<SeverityBadge severity={sub.severity} />
											</TableCell>
											<TableCell className="py-4 px-6 text-right">
												<span className="text-[var(--color-warning)] font-bold text-base">
													{formatEther(sub.payoutAmount)} ETH
												</span>
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</NeonPanel>
					</section>
				)}

				<section className="flex-1 overflow-hidden flex flex-col min-h-0">
					<h2 className="font-mono text-lg text-[var(--color-text)] mb-4 tracking-[0.05em] flex-shrink-0">
						RECENT SUBMISSIONS [{submissions.length}]
					</h2>

					{previewSubmissionId !== null && (
						<NeonPanel
							className="mb-4 flex-shrink-0"
							contentClassName="p-4 font-mono text-sm"
						>
							<div className="flex items-center justify-between gap-4 mb-3">
								<h3 className="text-sm text-[var(--color-secondary)] tracking-wider">
									POC_PREVIEW #{previewSubmissionId.toString()}
								</h3>
								<button
									type="button"
									onClick={() => {
										setPreviewSubmissionId(null);
										setPreviewContent(null);
										setPreviewError(null);
										setPreviewLoadingId(null);
									}}
									className="text-xs text-[var(--color-text-dim)] hover:text-[var(--color-primary)]"
								>
									[ CLOSE ]
								</button>
							</div>
							{previewLoadingId === previewSubmissionId ? (
								<p className="text-[var(--color-text-dim)]">
									Loading PoC from Sapphire...
								</p>
							) : previewError ? (
								<StatusBanner variant="error" message={previewError} />
							) : (
								<pre className="bg-neutral-900/80 p-3 border border-primary/20 rounded-md overflow-auto text-xs text-primary max-h-[240px] whitespace-pre-wrap">
									{previewContent}
								</pre>
							)}
						</NeonPanel>
					)}

					{isLoading && (
						<Card className="border-[var(--color-bg-light)] flex-1 flex items-center justify-center">
							<CardContent className="text-center p-8">
								<div className="w-8 h-8 border-2 border-[var(--color-bg)] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
								<p className="text-[var(--color-text-dim)] font-mono">
									Loading submissions...
								</p>
							</CardContent>
						</Card>
					)}

					{!isLoading && submissions.length === 0 && (
						<Card className="border-dashed border-[var(--color-text-dim)] bg-[rgba(0,0,0,0.2)] flex-1 flex items-center justify-center">
							<CardContent className="text-center p-8">
								<svg
									width="48"
									height="48"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="1"
									className="mx-auto mb-4 opacity-50"
								>
									<title>No submissions</title>
									<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
									<polyline points="14 2 14 8 20 8" />
									<line x1="12" y1="18" x2="12" y2="12" />
									<line x1="9" y1="15" x2="15" y2="15" />
								</svg>
								<p className="font-mono mb-2 text-[var(--color-text-dim)]">
									&gt; No submissions found
								</p>
								<p className="text-sm text-[var(--color-text-dim)]">
									Submit your first PoC to start earning bounties
								</p>
								<Link
									to="/builder"
									className="inline-block mt-6 text-[var(--color-primary)] font-mono no-underline py-3 px-6 border border-[var(--color-primary)] transition-all duration-200 hover:bg-[var(--color-primary)] hover:text-[var(--color-bg)]"
								>
									SUBMIT POC →
								</Link>
							</CardContent>
						</Card>
					)}

					{!isLoading && submissions.length > 0 && (
						<NeonPanel
							className="flex-1 overflow-hidden flex flex-col"
							contentClassName="p-0 flex-1 overflow-auto"
						>
							<Table>
								<TableHeader>
									<TableRow className="border-[var(--color-bg-light)] bg-[var(--color-bg-light)] hover:bg-[var(--color-bg-light)]">
										<TableHead className="font-mono text-xs text-[var(--color-text-dim)] tracking-[0.05em] uppercase w-20">
											ID
										</TableHead>
										<TableHead className="font-mono text-xs text-[var(--color-text-dim)] tracking-[0.05em] uppercase">
											PROJECT
										</TableHead>
										<TableHead className="font-mono text-xs text-[var(--color-text-dim)] tracking-[0.05em] uppercase w-56">
											HASHES
										</TableHead>
										<TableHead className="font-mono text-xs text-[var(--color-text-dim)] tracking-[0.05em] uppercase w-28">
											SEVERITY
										</TableHead>
										<TableHead className="font-mono text-xs text-[var(--color-text-dim)] tracking-[0.05em] uppercase w-28">
											STATUS
										</TableHead>
										<TableHead className="font-mono text-xs text-[var(--color-text-dim)] tracking-[0.05em] uppercase w-36">
											PAYOUT
										</TableHead>
										<TableHead className="font-mono text-xs text-[var(--color-text-dim)] tracking-[0.05em] uppercase w-28">
											DATE
										</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{submissions.map((sub) => {
										const displayStatus = getActualStatus(
											sub.status,
											sub.lifecycle?.status,
										);

										return (
											<TableRow
												key={sub.id.toString()}
												className={`border-[var(--color-bg-light)] font-mono text-sm hover:bg-[rgba(124,58,237,0.03)] transition-colors ${
													displayStatus === STATUS_VERIFIED &&
													sub.payoutAmount > 0n
														? "border-l-2 border-l-[var(--color-warning)] bg-[rgba(245,158,11,0.03)]"
														: ""
												}`}
											>
												<TableCell className="text-[var(--color-text-dim)]">
													<Link
														to={`/submission/${sub.id.toString()}`}
														className="text-[var(--color-primary)] hover:underline"
													>
														#{sub.id.toString()}
													</Link>
												</TableCell>
												<TableCell>
													<Link
														to={`/project/${sub.projectId.toString()}`}
														className="text-[var(--color-secondary)] no-underline hover:underline"
													>
														PROJECT #{sub.projectId.toString()}
													</Link>
												</TableCell>
												<TableCell className="text-xs font-mono text-[var(--color-text-dim)] align-top">
													<div className="flex flex-col gap-2">
														{sub.commitTxHash ? (
															<a
																href={explorerTxUrl(sub.commitTxHash)}
																target="_blank"
																rel="noreferrer"
																className="hover:underline"
															>
																SEPOLIA TX
															</a>
														) : null}
														<button
															type="button"
															onClick={() => void handlePreviewPoC(sub)}
															className="text-left text-[var(--color-primary)] hover:underline"
														>
															VIEW POC
														</button>
													</div>
												</TableCell>
												<TableCell>
													<div className="flex flex-col gap-1 items-start">
														<SeverityBadge severity={sub.severity} />
														{sub.grouping && (
															<span className="text-[0.65rem] text-[var(--color-text-dim)] tracking-wider mt-1">
																[{sub.grouping.cohort}-{sub.grouping.groupRank}/
																{sub.grouping.groupSize}]
															</span>
														)}
													</div>
												</TableCell>
												<TableCell>
													<div className="flex flex-col gap-1 items-start">
														<span
															className={`dashboard-status-badge ${getStatusClass(displayStatus)}`}
														>
															{STATUS_LABELS[displayStatus]}
														</span>
														{sub.jury && (
															<span
																className="text-[0.65rem] text-[var(--color-secondary)] tracking-wider mt-1"
																title={sub.jury.rationale}
															>
																⚖️{" "}
																{sub.jury.action
																	.replace("_RESULT", "")
																	.replace(/_/g, " ")}
															</span>
														)}
													</div>
												</TableCell>
												<TableCell
													className={
														sub.payoutAmount > 0n
															? "text-[var(--color-primary)] font-bold"
															: "text-[var(--color-text-dim)] font-normal"
													}
												>
													{sub.payoutAmount > 0n
														? `${formatEther(sub.payoutAmount)} ETH`
														: "-"}
												</TableCell>
												<TableCell className="text-[var(--color-text-dim)] text-xs">
													{formatTimestamp(sub.commitTimestamp)}
												</TableCell>
											</TableRow>
										);
									})}
								</TableBody>
							</Table>
						</NeonPanel>
					)}
				</section>
			</div>
		</div>
	);
}

export default Dashboard;
