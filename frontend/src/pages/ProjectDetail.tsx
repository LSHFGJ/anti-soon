import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
	type Address,
	formatEther,
	type GetLogsReturnType,
	parseAbiItem,
} from "viem";
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
import { readProjectById } from "../lib/projectReads";
import {
	getBlockNumberWithRpcFallback,
	getLogsWithRpcFallback,
	multicallWithRpcFallback,
	readContractWithRpcFallback,
} from "../lib/publicClient";
import { getActualStatus } from "../lib/status";
import {
	type ExtendedSubmission,
	type Project,
	type ProjectRules,
	STATUS_LABELS,
	VERDICT_SOURCE_LABELS,
} from "../types";

const POC_COMMITTED_EVENT = parseAbiItem(
	"event PoCCommitted(uint256 indexed submissionId, uint256 indexed projectId, address indexed auditor, bytes32 commitHash)",
);
type PoCCommittedLog = GetLogsReturnType<
	typeof POC_COMMITTED_EVENT,
	[typeof POC_COMMITTED_EVENT],
	true
>[number];

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

const SUBMISSION_LOAD_ERROR = "Failed to load submissions from blockchain";

function mapSubmissionWithMetadata(
	id: bigint,
	data: SubmissionTuple,
	lifecycleData: SubmissionLifecycleTuple,
	juryData: SubmissionJuryTuple,
	groupingData: SubmissionGroupingTuple,
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

function formatRuleEther(amountWei: bigint): string {
	const raw = formatEther(amountWei);
	if (!raw.includes(".")) {
		return `${raw}.0`;
	}

	return raw.replace(/(\.\d*?[1-9])0+$|\.0+$/, "$1");
}

function formatRuleDuration(seconds: bigint): string {
	if (seconds === 0n) return "0s";
	if (seconds <= 172_800n && seconds % 3_600n === 0n) {
		return `${seconds / 3_600n}h`;
	}
	if (seconds % 86_400n === 0n) return `${seconds / 86_400n}d`;
	if (seconds % 3_600n === 0n) return `${seconds / 3_600n}h`;
	if (seconds % 60n === 0n) return `${seconds / 60n}m`;
	return `${seconds.toString()}s`;
}

function RuleMetric({
	label,
	value,
	valueClassName = "text-[var(--color-text)]",
}: {
	label: string;
	value: React.ReactNode;
	valueClassName?: string;
}) {
	return (
		<div className="rounded-sm border border-[var(--color-bg-light)] bg-black/20 p-3">
			<p className="text-[10px] font-mono uppercase tracking-[0.16em] text-[var(--color-text-dim)]">
				{label}
			</p>
			<div className={`mt-2 font-mono text-sm ${valueClassName}`}>{value}</div>
		</div>
	);
}

function ThresholdRow({
	label,
	amountWei,
	accentClassName,
}: {
	label: string;
	amountWei: bigint;
	accentClassName: string;
}) {
	return (
		<div className="flex items-center justify-between gap-4 rounded-sm border border-[var(--color-bg-light)] bg-black/20 px-3 py-2.5 font-mono text-sm">
			<span className={`uppercase tracking-[0.12em] ${accentClassName}`}>
				{label}
			</span>
			<span className="text-[var(--color-text)]">
				{formatRuleEther(amountWei)} ETH
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

			if (
				!fetchedProject ||
				fetchedProject.owner === "0x0000000000000000000000000000000000000000"
			) {
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
			const isNotFound =
				err instanceof Error && err.message === "Project not found";

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
					discoverDeploymentBlockWithFallback(BOUNTY_HUB_ADDRESS, latestBlock),
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

			const submissionContracts = submissionIds.flatMap((subId) => [
				{
					address: BOUNTY_HUB_ADDRESS,
					abi: BOUNTY_HUB_V2_ABI,
					functionName: "submissions",
					args: [subId],
				},
				{
					address: BOUNTY_HUB_ADDRESS,
					abi: BOUNTY_HUB_V2_ABI,
					functionName: "getSubmissionLifecycle",
					args: [subId],
				},
				{
					address: BOUNTY_HUB_ADDRESS,
					abi: BOUNTY_HUB_V2_ABI,
					functionName: "getSubmissionJuryMetadata",
					args: [subId],
				},
				{
					address: BOUNTY_HUB_ADDRESS,
					abi: BOUNTY_HUB_V2_ABI,
					functionName: "getSubmissionGroupingMetadata",
					args: [subId],
				},
			]);

			const results = (await multicallWithRpcFallback({
				contracts: submissionContracts,
				allowFailure: false,
			})) as readonly unknown[];

			const fetchedSubmissions: ExtendedSubmission[] = submissionIds.map(
				(id, index) => {
					const data = results[index * 4] as SubmissionTuple;
					const lifecycleData = results[
						index * 4 + 1
					] as SubmissionLifecycleTuple;
					const juryData = results[index * 4 + 2] as SubmissionJuryTuple;
					const groupingData = results[
						index * 4 + 3
					] as SubmissionGroupingTuple;

					return mapSubmissionWithMetadata(
						id,
						data,
						lifecycleData,
						juryData,
						groupingData,
					);
				},
			);

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
							<div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
								<div className="rounded-sm border border-[var(--color-bg-light)] bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(0,0,0,0.12))] p-4">
									<p className="text-[10px] font-mono uppercase tracking-[0.18em] text-[var(--color-text-dim)]">
										CURRENTLY ENFORCED
									</p>
									<div className="mt-4 grid gap-3">
										<RuleMetric
											label="DISPUTE WINDOW"
											value={formatRuleDuration(project.disputeWindow)}
											valueClassName="text-[var(--color-warning)]"
										/>
									</div>
									<p className="mt-4 font-mono text-xs leading-6 text-[var(--color-text-dim)]">
										Execution caps exist on-chain but are not enforced by the
										current workflow.
									</p>
								</div>

								<div className="rounded-sm border border-[var(--color-bg-light)] bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(0,0,0,0.12))] p-4">
									<p className="text-[10px] font-mono uppercase tracking-[0.18em] text-[var(--color-text-dim)]">
										SEVERITY THRESHOLDS
									</p>
									<div className="mt-4 space-y-2">
										<ThresholdRow
											label="CRITICAL"
											amountWei={rules.thresholds.criticalDrainWei}
											accentClassName="text-[var(--color-error)]"
										/>
										<ThresholdRow
											label="HIGH"
											amountWei={rules.thresholds.highDrainWei}
											accentClassName="text-[var(--color-warning)]"
										/>
										<ThresholdRow
											label="MEDIUM"
											amountWei={rules.thresholds.mediumDrainWei}
											accentClassName="text-[var(--color-gold)]"
										/>
										<ThresholdRow
											label="LOW"
											amountWei={rules.thresholds.lowDrainWei}
											accentClassName="text-[var(--color-primary)]"
										/>
									</div>
								</div>
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
														<Badge
															variant={getStatusVariant(
																getActualStatus(
																	sub.status,
																	sub.lifecycle?.status,
																),
															)}
														>
															{
																STATUS_LABELS[
																	getActualStatus(
																		sub.status,
																		sub.lifecycle?.status,
																	)
																]
															}
														</Badge>
														{sub.lifecycle &&
															sub.lifecycle.verdictSource > 0 && (
																<span className="text-[0.65rem] text-[var(--color-text-dim)] tracking-wider mt-1">
																	Source:{" "}
																	{
																		VERDICT_SOURCE_LABELS[
																			sub.lifecycle.verdictSource
																		]
																	}
																</span>
															)}
														{sub.lifecycle &&
															sub.lifecycle.juryDeadline > 0n && (
																<span className="text-[0.65rem] text-[var(--color-text-dim)] tracking-wider mt-1">
																	Jury DL:{" "}
																	{new Date(
																		Number(sub.lifecycle.juryDeadline) * 1000,
																	).toLocaleDateString()}
																</span>
															)}
														{sub.lifecycle &&
															sub.lifecycle.adjudicationDeadline > 0n && (
																<span className="text-[0.65rem] text-[var(--color-text-dim)] tracking-wider mt-1">
																	Adj DL:{" "}
																	{new Date(
																		Number(sub.lifecycle.adjudicationDeadline) *
																			1000,
																	).toLocaleDateString()}
																</span>
															)}
													</div>
												</td>
												<td className="px-4 py-4">
													<div className="flex flex-col gap-1 items-start">
														<SeverityBadge severity={sub.severity} />
														{sub.grouping && (
															<span className="text-[0.65rem] text-[var(--color-text-dim)] tracking-wider mt-1">
																[{sub.grouping.cohort}-{sub.grouping.groupRank}/
																{sub.grouping.groupSize}]
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
