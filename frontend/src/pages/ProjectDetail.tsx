import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { type Address, formatEther, parseAbiItem, type GetLogsReturnType } from "viem";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { explorerAddressUrl } from "@/lib/explorerLinks";
import {
	buildPreviewProject,
	buildPreviewProjectRules,
	buildPreviewSubmission,
	formatPreviewFallbackMessage,
	shouldUsePreviewFallback,
} from "@/lib/previewFallback";
import { CountdownTimer } from "../components/shared/CountdownTimer";
import { SeverityBadge } from "../components/shared/SeverityBadge";
import { StatCard } from "../components/shared/StatCard";
import {
	MetaRow,
	NeonPanel,
	PageHeader,
	StatusBanner,
} from "../components/shared/ui-primitives";
import { BOUNTY_HUB_ADDRESS, BOUNTY_HUB_V2_ABI } from "../config";
import { 
	discoverDeploymentBlockWithFallback,
	getLogsWithRangeFallback,
} from "../lib/chainLogs";
import {
	getBlockNumberWithRpcFallback,
	getLogsWithRpcFallback,
	multicallWithRpcFallback,
	readContractWithRpcFallback,
} from "../lib/publicClient";
import { readProjectById } from "../lib/projectReads";
import {
	type Project,
	type ProjectRules,
	STATUS_LABELS,
	type Submission,
	type ExtendedSubmission,
} from "../types";

const POC_COMMITTED_EVENT = parseAbiItem(
	"event PoCCommitted(uint256 indexed submissionId, uint256 indexed projectId, address indexed auditor, bytes32 commitHash)",
);
type PoCCommittedLog = GetLogsReturnType<typeof POC_COMMITTED_EVENT, [typeof POC_COMMITTED_EVENT], true>[number];

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

type RulesTuple = readonly [
	maxAttackerSeedWei: bigint,
	maxWarpSeconds: bigint,
	allowImpersonation: boolean,
	thresholds: {
		criticalDrainWei: bigint;
		highDrainWei: bigint;
		mediumDrainWei: bigint;
		lowDrainWei: bigint;
	},
];

const SUBMISSION_LOAD_ERROR = "Failed to load submissions from blockchain";

function ThresholdCard({
	label,
	amountWei,
	colorVar,
}: {
	label: string;
	amountWei: bigint;
	colorVar: string;
}) {
	return (
		<div className="flex flex-col p-3 border border-[var(--color-bg-light)] bg-black/20 rounded-sm">
			<span className={`font-mono text-xs mb-1`} style={{ color: colorVar }}>
				{label}
			</span>
			<span className="font-mono text-sm">
				&gt; {formatEther(amountWei)} ETH
			</span>
		</div>
	);
}

function SectionHeader({ children }: { children: React.ReactNode }) {
	return (
		<h2 className="text-sm font-mono tracking-widest text-[var(--color-text-dim)] uppercase mb-4 pb-2 border-b border-[var(--color-bg-light)]">
			{children}
		</h2>
	);
}

function ProjectDetailSkeleton() {
	return (
		<div className="min-h-[calc(100vh-142px)] flex flex-col py-6">
			<div className="container flex-1 flex flex-col min-h-0 max-w-6xl mx-auto px-4 overflow-y-auto">
				<Skeleton className="h-4 w-32 mb-6" />
				<div className="flex items-center gap-4 mb-2">
					<Skeleton className="h-8 w-48" />
					<Skeleton className="h-6 w-20" />
				</div>
				<Skeleton className="h-4 w-64 mb-8" />

				<div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
					{[1, 2, 3, 4].map((i) => (
						<Card
							key={i}
							className="bg-[var(--color-bg-panel)]/80 border-[var(--color-bg-light)]"
						>
							<CardContent className="p-4">
								<Skeleton className="h-4 w-20 mb-2" />
								<Skeleton className="h-6 w-28" />
							</CardContent>
						</Card>
					))}
				</div>

				<div className="grid md:grid-cols-2 gap-6 mb-8">
					<Card className="bg-[var(--color-bg-panel)]/80 border-[var(--color-bg-light)]">
						<CardContent className="p-6">
							<Skeleton className="h-4 w-32 mb-4" />
							<div className="grid grid-cols-2 gap-6 mb-8">
								<div className="space-y-2">
									<Skeleton className="h-4 w-24" />
									<Skeleton className="h-8 w-full" />
								</div>
								<div className="space-y-2">
									<Skeleton className="h-4 w-24" />
									<Skeleton className="h-8 w-full" />
								</div>
							</div>
							<Skeleton className="h-4 w-32 mb-4" />
							<div className="space-y-4">
								<Skeleton className="h-4 w-full" />
								<Skeleton className="h-4 w-full" />
								<Skeleton className="h-4 w-full" />
							</div>
						</CardContent>
					</Card>

					<Card className="bg-[var(--color-bg-panel)]/80 border-[var(--color-bg-light)]">
						<CardContent className="p-6 flex flex-col">
							<Skeleton className="h-4 w-32 mb-4" />
							<div className="space-y-4 mb-8">
								{[1, 2, 3, 4].map((i) => (
									<div key={i} className="flex justify-between items-center">
										<Skeleton className="h-4 w-32" />
										<Skeleton className="h-4 w-24" />
									</div>
								))}
							</div>
							<Skeleton className="h-4 w-32 mb-4" />
							<div className="grid grid-cols-2 gap-3 mt-2">
								{[1, 2, 3, 4].map((i) => (
									<Skeleton key={i} className="h-16 w-full" />
								))}
							</div>
						</CardContent>
					</Card>
				</div>

				<Card className="bg-[var(--color-bg-panel)]/80 border-[var(--color-bg-light)]">
					<div className="p-6 border-b border-[var(--color-bg-light)]">
						<Skeleton className="h-6 w-40" />
					</div>
					<CardContent className="p-6">
						<div className="space-y-4">
							{[1, 2, 3].map((i) => (
								<div key={i} className="flex items-center gap-4">
									<Skeleton className="h-4 w-16" />
									<Skeleton className="h-4 flex-1" />
									<Skeleton className="h-6 w-20" />
								</div>
							))}
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}

export function ProjectDetail() {
	const { id } = useParams<{ id: string }>();
	const projectId = BigInt(id ?? "0");

	const [project, setProject] = useState<Project | null>(null);
	const [rules, setRules] = useState<ProjectRules | null>(null);
	const [submissions, setSubmissions] = useState<ExtendedSubmission[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const projectRequestIdRef = useRef(0);
	const submissionsRequestIdRef = useRef(0);

	const fetchProject = useCallback(async () => {
		if (!id) return;
		const requestId = ++projectRequestIdRef.current;

		try {
			setIsLoading(true);
			setError(null);
			setProject(null);
			setRules(null);
			setSubmissions([]);

			const [fetchedProject, rulesData] = await Promise.all([
				readProjectById(projectId),
				readContractWithRpcFallback({
					address: BOUNTY_HUB_ADDRESS,
					abi: BOUNTY_HUB_V2_ABI,
					functionName: "projectRules",
					args: [projectId],
				}) as Promise<RulesTuple>,
			]);

			if (!fetchedProject || fetchedProject.owner === "0x0000000000000000000000000000000000000000") {
				throw new Error("Project not found");
			}

			if (projectRequestIdRef.current !== requestId) {
				return;
			}

			setProject(fetchedProject);
			setRules({
				maxAttackerSeedWei: rulesData[0],
				maxWarpSeconds: rulesData[1],
				allowImpersonation: rulesData[2],
				thresholds: rulesData[3],
			});
		} catch (err) {
			const isNotFound = err instanceof Error && err.message === "Project not found";
			
			if (!isNotFound) {
				console.error("Failed to fetch project:", err);
			}

			if (isNotFound) {
				if (projectRequestIdRef.current !== requestId) {
					return;
				}
				setError("Project not found");
				return;
			}

			if (shouldUsePreviewFallback()) {
				if (projectRequestIdRef.current !== requestId) {
					return;
				}
				setProject(buildPreviewProject(projectId));
				setRules(buildPreviewProjectRules());
				setSubmissions([
					buildPreviewSubmission(3001n, projectId, undefined, {
						status: 2,
						severity: 3,
					}),
					buildPreviewSubmission(3002n, projectId, undefined, {
						status: 4,
						severity: 4,
						payoutAmount: 900_000_000_000_000_000n,
					}),
				]);
				setError(
					formatPreviewFallbackMessage(
						"Failed to load project from blockchain",
					),
				);
				return;
			}

			if (projectRequestIdRef.current !== requestId) {
				return;
			}
			setError("Failed to load project from blockchain");
		} finally {
			if (projectRequestIdRef.current === requestId) {
				setIsLoading(false);
			}
		}
	}, [id, projectId]);

	const fetchSubmissions = useCallback(async () => {
		const requestId = ++submissionsRequestIdRef.current;
		try {
			const logs = await getLogsWithRangeFallback<PoCCommittedLog>({
				fetchLogs: (range) =>
					getLogsWithRpcFallback({
						address: BOUNTY_HUB_ADDRESS,
						event: POC_COMMITTED_EVENT,
						strict: true,
						args: { projectId },
						...(range ?? {}),
						toBlock: range?.toBlock ?? "latest",
					}) as Promise<PoCCommittedLog[]>,
				getLatestBlock: () => getBlockNumberWithRpcFallback(),
				getStartBlock: async (latestBlock) =>
					discoverDeploymentBlockWithFallback(
						BOUNTY_HUB_ADDRESS,
						latestBlock,
					),
			});

			const submissionIds = Array.from(
				new Set(
					logs
						.map((log) => log.args.submissionId)
						.filter(
							(submissionId): submissionId is bigint =>
								submissionId !== undefined,
						),
				),
			);

			if (submissionIds.length === 0) {
				if (submissionsRequestIdRef.current !== requestId) {
					return;
				}
				setSubmissions([]);
				return;
			}

			const submissionContracts = submissionIds.map((subId) => ({
				address: BOUNTY_HUB_ADDRESS,
				abi: BOUNTY_HUB_V2_ABI,
				functionName: "submissions" as const,
				args: [subId] as const,
			}));

			const results = (await multicallWithRpcFallback({
				contracts: submissionContracts,
				allowFailure: false,
			})) as SubmissionTuple[];

			const fetchedSubmissions: Submission[] = results.map((data, index) => ({
				id: submissionIds[index],
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
			}));

			if (submissionsRequestIdRef.current !== requestId) {
				return;
			}
			setSubmissions(fetchedSubmissions);
			setError((currentError) =>
				currentError === SUBMISSION_LOAD_ERROR ? null : currentError,
			);
		} catch (err) {
			console.error("Failed to fetch submissions:", err);
			if (submissionsRequestIdRef.current !== requestId) {
				return;
			}
			setSubmissions([]);
			setError((currentError) => currentError ?? SUBMISSION_LOAD_ERROR);
		}
	}, [projectId]);

	useEffect(() => {
		fetchProject();
	}, [fetchProject]);

	useEffect(() => {
		if (project) {
			fetchSubmissions();
		}
	}, [project, fetchSubmissions]);

	const getDeadlineStatus = () => {
		if (!project) return { text: "UNKNOWN", variant: "outline" as const };
		const now = BigInt(Math.floor(Date.now() / 1000));
		if (project.commitDeadline === 0n || now < project.commitDeadline) {
			return { text: "COMMIT OPEN", variant: "success" as const };
		}
		if (project.revealDeadline === 0n || now < project.revealDeadline) {
			return { text: "REVEAL PHASE", variant: "info" as const };
		}
		return { text: "CLOSED", variant: "error" as const };
	};

	const formatTimestamp = (timestamp: bigint) => {
		if (timestamp === 0n) return "N/A";
		return new Date(Number(timestamp) * 1000).toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
			year: "numeric",
			hour: "2-digit",
			minute: "2-digit",
		});
	};

	const formatAddress = (addr: Address) => {
		return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
	};

	const getStatusVariant = (
		status: number,
	): "success" | "error" | "warning" | "info" | "outline" => {
		if (status <= 1) return "success";
		if (status === 5) return "error";
		if (status === 3) return "warning";
		return "info";
	};

	if (isLoading) {
		return <ProjectDetailSkeleton />;
	}

	if (!project) {
		return (
			<div className="min-h-[calc(100vh-142px)] flex flex-col py-6">
				<div className="container flex-1 flex flex-col min-h-0 max-w-6xl mx-auto px-4">
					<StatusBanner
						variant="error"
						className="max-w-2xl"
						message={`ERROR: ${error ?? "Project not found"}`}
					/>
					<Link to="/explorer" className="btn-cyber inline-flex mt-4">
						[← Back to Explorer]
					</Link>
				</div>
			</div>
		);
	}

	const deadlineStatus = getDeadlineStatus();

	return (
		<div className="min-h-[calc(100vh-142px)] flex flex-col py-6">
			<div className="container flex-1 flex flex-col min-h-0 max-w-6xl mx-auto px-4 overflow-y-auto">
				<div className="mb-8">
					<div className="mb-3">
						<Link
							to="/explorer"
							className="text-[var(--color-text-dim)] hover:text-[var(--color-primary)] font-mono text-sm inline-flex items-center gap-2 transition-colors"
						>
							<span>←</span> BACK TO EXPLORER
						</Link>
					</div>

					<div className="flex items-start justify-between gap-4">
						<PageHeader
							className="mb-0 flex-1"
							title={`PROJECT #${project.id.toString()}`}
							suffix={
								<div className="flex items-center gap-2">
									<Badge variant={project.mode === 0 ? "unique" : "multi"}>
										{project.mode === 0 ? "UNIQUE" : "MULTI"}
									</Badge>
									<Badge variant={deadlineStatus.variant}>
										{deadlineStatus.text}
									</Badge>
								</div>
							}
						/>

						{project.active ? (
							<Link
								to={`/builder?projectId=${project.id.toString()}&source=project-detail`}
								className="inline-flex h-10 items-center gap-2 px-5 text-sm bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-primary)]/80 text-[var(--color-bg)] font-mono font-bold uppercase tracking-wider border border-[var(--color-primary)]/70 shadow-[0_0_18px_var(--color-primary-glow)] transition-all hover:shadow-[0_0_32px_var(--color-primary)]/60 hover:-translate-y-0.5"
							>
								<span>SUBMIT POC</span>
								<span>→</span>
							</Link>
						) : null}
					</div>

					{error && (
						<StatusBanner
							variant={
								error.includes("Preview mode active") ? "warning" : "error"
							}
							className="mt-4"
							message={error}
						/>
					)}
				</div>

				<div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
					<StatCard
						label="BOUNTY POOL"
						value={`${formatEther(project.bountyPool)} ETH`}
						color="var(--color-primary)"
					/>
					<StatCard
						label="MAX PAYOUT"
						value={`${formatEther(project.maxPayoutPerBug)} ETH`}
						color="var(--color-text)"
					/>
					<StatCard
						label="SUBMISSIONS"
						value={submissions.length.toString()}
						color="var(--color-text)"
					/>
				</div>

				<div className="grid md:grid-cols-2 gap-6 mb-8">
					<NeonPanel contentClassName="p-6">
						<SectionHeader>DEADLINES</SectionHeader>
						<div className="grid grid-cols-2 gap-6">
							<div className="flex flex-col items-center gap-2 text-center">
								<p className="text-[var(--color-text-dim)] font-mono text-xs uppercase tracking-[0.08em]">
									COMMIT
								</p>
								<CountdownTimer deadline={project.commitDeadline} />
							</div>
							<div className="flex flex-col items-center gap-2 text-center">
								<p className="text-[var(--color-text-dim)] font-mono text-xs uppercase tracking-[0.08em]">
									REVEAL
								</p>
								<CountdownTimer deadline={project.revealDeadline} />
							</div>
						</div>

						<div className="mt-8">
							<SectionHeader>PROJECT DETAILS</SectionHeader>
							<div className="space-y-4 font-mono text-sm">
								<MetaRow
									label="OWNER"
									value={
										<a
											href={explorerAddressUrl(project.owner)}
											target="_blank"
											rel="noreferrer"
											className="break-all text-[var(--color-secondary)] hover:underline"
										>
											{project.owner}
										</a>
									}
								/>
								<MetaRow
									label="TARGET CONTRACT"
									value={
										<a
											href={explorerAddressUrl(project.targetContract)}
											target="_blank"
											rel="noreferrer"
											className="break-all text-[var(--color-secondary)] hover:underline"
										>
											{project.targetContract}
										</a>
									}
								/>
								<MetaRow
									label="RULES HASH"
									value={
										<a
											href={`${explorerAddressUrl(BOUNTY_HUB_ADDRESS)}#readContract`}
											target="_blank"
											rel="noreferrer"
											className="break-all text-[var(--color-text)] hover:text-[var(--color-primary)] hover:underline"
											title="View project rules on BountyHub contract page"
										>
											{project.rulesHash.slice(0, 10)}...
											{project.rulesHash.slice(-8)}
										</a>
									}
								/>
							</div>
						</div>
					</NeonPanel>

					{rules && (
						<NeonPanel contentClassName="p-6 flex flex-col">
							<SectionHeader>RULES</SectionHeader>
							<div className="space-y-4 font-mono text-sm mb-8">
								<MetaRow
									label="MAX ATTACKER SEED"
									value={`${formatEther(rules.maxAttackerSeedWei)} ETH`}
									inline
								/>
								<MetaRow
									label="MAX TIME WARP"
									value={`${rules.maxWarpSeconds.toString()}s`}
									inline
								/>
								<MetaRow
									label="DISPUTE WINDOW"
									value={`${project.disputeWindow.toString()}s`}
									inline
								/>
								<MetaRow
									label="IMPERSONATION"
									value={
										<Badge
											variant={rules.allowImpersonation ? "success" : "error"}
										>
											{rules.allowImpersonation ? "ALLOWED" : "DISABLED"}
										</Badge>
									}
									inline
								/>
							</div>

							<SectionHeader>THRESHOLDS</SectionHeader>
							<div className="grid grid-cols-2 gap-3 mt-2">
								<ThresholdCard
									label="CRITICAL"
									amountWei={rules.thresholds.criticalDrainWei}
									colorVar="var(--color-error)"
								/>
								<ThresholdCard
									label="HIGH"
									amountWei={rules.thresholds.highDrainWei}
									colorVar="var(--color-warning)"
								/>
								<ThresholdCard
									label="MEDIUM"
									amountWei={rules.thresholds.mediumDrainWei}
									colorVar="var(--color-gold)"
								/>
								<ThresholdCard
									label="LOW"
									amountWei={rules.thresholds.lowDrainWei}
									colorVar="var(--color-primary)"
								/>
							</div>
						</NeonPanel>
					)}
				</div>

				<NeonPanel className="mb-8" contentClassName="p-0">
					<div className="p-6 border-b border-[var(--color-bg-light)] flex justify-between items-center">
						<h2 className="text-lg font-mono tracking-wide">
							SUBMISSIONS [{submissions.length}]
						</h2>
					</div>

					<div className="p-6">
						{submissions.length === 0 ? (
							<div className="py-12 border border-dashed border-[var(--color-bg-light)] text-center bg-black/10 rounded-sm">
								<p className="font-mono text-[var(--color-text-dim)] text-sm mb-2">
									&gt; No submissions yet
								</p>
								<p className="font-mono text-[var(--color-text-dim)]/80 text-xs">
									Be the first to submit a PoC for this project
								</p>
							</div>
						) : (
							<div className="overflow-x-auto -mx-6 px-6">
								<table className="w-full font-mono text-sm whitespace-nowrap">
									<thead>
										<tr className="border-b border-[var(--color-bg-light)] text-left">
											<th className="px-4 py-3 text-[var(--color-text-dim)] font-normal">
												ID
											</th>
											<th className="px-4 py-3 text-[var(--color-text-dim)] font-normal">
												AUDITOR
											</th>
											<th className="px-4 py-3 text-[var(--color-text-dim)] font-normal">
												STATUS
											</th>
											<th className="px-4 py-3 text-[var(--color-text-dim)] font-normal">
												SEVERITY
											</th>
											<th className="px-4 py-3 text-[var(--color-text-dim)] font-normal text-right">
												DRAIN
											</th>
											<th className="px-4 py-3 text-[var(--color-text-dim)] font-normal text-right">
												PAYOUT
											</th>
											<th className="px-4 py-3 text-[var(--color-text-dim)] font-normal">
												COMMITTED
											</th>
										</tr>
									</thead>
									<tbody>
										{submissions.map((sub) => (
											<tr
												key={sub.id.toString()}
												className="border-b border-[var(--color-bg-light)] hover:bg-[var(--color-primary)]/5 transition-colors"
											>
												<td className="px-4 py-4 text-[var(--color-text-dim)]">
													#{sub.id.toString()}
												</td>
												<td className="px-4 py-4 text-[var(--color-secondary)]">
													<a
														href={explorerAddressUrl(sub.auditor)}
														target="_blank"
														rel="noreferrer"
														className="hover:underline"
													>
														{formatAddress(sub.auditor)}
													</a>
												</td>
												<td className="px-4 py-4">
													<div className="flex flex-col gap-1 items-start">
														<Badge variant={getStatusVariant(sub.status)}>
															{STATUS_LABELS[sub.status]}
														</Badge>
														{sub.jury && (
															<span className="text-[0.65rem] text-[var(--color-secondary)] tracking-wider mt-1" title={sub.jury.rationale}>
																⚖️ {sub.jury.action.replace('_RESULT', '').replace(/_/g, ' ')}
															</span>
														)}
													</div>
												</td>
												<td className="px-4 py-4">
													<div className="flex flex-col gap-1 items-start">
														<SeverityBadge severity={sub.severity} />
														{sub.grouping && (
															<span className="text-[0.65rem] text-[var(--color-text-dim)] tracking-wider mt-1">
																[{sub.grouping.cohort}-{sub.grouping.groupRank}/{sub.grouping.groupSize}]
															</span>
														)}
													</div>
												</td>
												<td className="px-4 py-4 text-right">
													{sub.drainAmountWei > 0n ? (
														<span>{formatEther(sub.drainAmountWei)} ETH</span>
													) : (
														<span className="text-[var(--color-text-dim)]">
															-
														</span>
													)}
												</td>
												<td className="px-4 py-4 text-right">
													{sub.payoutAmount > 0n ? (
														<span className="text-[var(--color-primary)] font-bold">
															{formatEther(sub.payoutAmount)} ETH
														</span>
													) : (
														<span className="text-[var(--color-text-dim)]">
															-
														</span>
													)}
												</td>
												<td className="px-4 py-4 text-[var(--color-text-dim)]">
													{formatTimestamp(sub.commitTimestamp)}
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						)}
					</div>
				</NeonPanel>
			</div>
		</div>
	);
}

export default ProjectDetail;
