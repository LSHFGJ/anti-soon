import type {
	SubmissionGrouping,
	SubmissionJury,
	SubmissionLifecycle,
} from "../../types";
import { VERDICT_SOURCE_LABELS } from "../../types";

export type WorkflowStageState =
	| "completed"
	| "active"
	| "upcoming"
	| "skipped";

export interface WorkflowStage {
	label: string;
	state: WorkflowStageState;
}

export interface WorkflowCard {
	title: string;
	summary: string;
}

export interface WorkflowNodeStatus {
	label: string;
	state: WorkflowStageState;
	summary: string;
}

export interface WorkflowEvidenceDatum {
	label: string;
	value: string;
}

export interface WorkflowJuryAggregate {
	summary: string;
	availabilityNote: string;
	data: WorkflowEvidenceDatum[];
}

export interface WorkflowOwnerTestimonyPayloadSeed {
	submissionId: string;
	projectId: string;
	recommendationReportType: "jury-recommendation/v1";
}

export interface WorkflowOwnerAdjudicationDraft {
	isVisible: boolean;
	deadlineLabel?: string;
	helper: string;
	canPrepare: boolean;
	viewerNote?: string;
	testimonyPayloadSeed?: WorkflowOwnerTestimonyPayloadSeed;
	blockers: string[];
}

export type WorkflowSummaryVariant = "info" | "success" | "warning" | "error";

export interface VerificationWorkflowViewModel {
	activeTitle: string;
	activeSummary: string;
	summaryVariant: WorkflowSummaryVariant;
	stages: WorkflowStage[];
	nodeStatuses: WorkflowNodeStatus[];
	juryAggregate?: WorkflowJuryAggregate;
	ownerAdjudication: WorkflowOwnerAdjudicationDraft;
	cards: WorkflowCard[];
}

interface BuildVerificationWorkflowViewModelArgs {
	submissionId: bigint;
	projectId: bigint;
	actualStatus: number;
	hasActiveDispute: boolean;
	canPrepareOwnerAdjudication: boolean;
	lifecycle?: SubmissionLifecycle;
	jury?: SubmissionJury;
	grouping?: SubmissionGrouping;
}

const STAGE_COMMITTED = "Committed";
const STAGE_REVEALED = "Revealed";
const STAGE_STRICT_VERIFICATION = "Strict Verification";
const STAGE_JURY_REVIEW = "Jury Review";
const STAGE_OWNER_ADJUDICATION = "Owner Adjudication";
const STAGE_FINAL_RESULT = "Final Result";

const NODE_VERIFY_POC = "verify-poc";
const NODE_JURY_ORCHESTRATOR = "jury-orchestrator";
const NODE_OWNER_ADJUDICATION = "owner adjudication";
const NODE_WRITE_BACK = "BountyHub write-back";
const JURY_RECOMMENDATION_REPORT_TYPE = "jury-recommendation/v1" as const;

function formatWorkflowTimestamp(
	timestamp: bigint | undefined,
): string | undefined {
	if (!timestamp || timestamp <= 0n) {
		return undefined;
	}

	return new Date(Number(timestamp) * 1000).toLocaleString();
}

function isReadableDigest(value: string | undefined): boolean {
	if (!value) {
		return false;
	}

	return /^0x[0-9a-fA-F]{64}$/.test(value) && !/^0x0{64}$/i.test(value);
}

function resolveStageState(
	label: string,
	actualStatus: number,
	verdictSource?: number,
): WorkflowStageState {
	if (label === STAGE_COMMITTED) return "completed";
	if (label === STAGE_REVEALED)
		return actualStatus >= 1 ? "completed" : "active";

	if (label === STAGE_STRICT_VERIFICATION) {
		if (actualStatus === 6 || actualStatus === 7) return "completed";
		if (actualStatus >= 2 || actualStatus === 5) return "completed";
		return actualStatus === 1 ? "active" : "upcoming";
	}

	if (label === STAGE_JURY_REVIEW) {
		if (actualStatus === 6) return "active";
		if (actualStatus === 7 || verdictSource === 2 || verdictSource === 3) {
			return "completed";
		}
		return verdictSource === 1 ? "skipped" : "upcoming";
	}

	if (label === STAGE_OWNER_ADJUDICATION) {
		if (actualStatus === 7) return "active";
		if (verdictSource === 3) return "completed";
		if (verdictSource === 1 || verdictSource === 2) return "skipped";
		return "upcoming";
	}

	if (label === STAGE_FINAL_RESULT) {
		return actualStatus === 6 || actualStatus === 7 ? "upcoming" : "active";
	}

	return "upcoming";
}

function buildNodeStatuses(
	actualStatus: number,
	verdictSource: number | undefined,
	lifecycle: SubmissionLifecycle | undefined,
	jury: SubmissionJury | undefined,
): WorkflowNodeStatus[] {
	const verifyPocState: WorkflowStageState =
		actualStatus === 1
			? "active"
			: actualStatus >= 2 || actualStatus === 5
				? "completed"
				: "upcoming";

	const juryState: WorkflowStageState =
		actualStatus === 6
			? "active"
			: actualStatus === 7 || verdictSource === 2 || verdictSource === 3
				? "completed"
				: verdictSource === 1
					? "skipped"
					: "upcoming";

	const ownerState: WorkflowStageState =
		actualStatus === 7
			? "active"
			: verdictSource === 3
				? "completed"
				: verdictSource === 1 || verdictSource === 2
					? "skipped"
					: "upcoming";

	const writeBackState: WorkflowStageState =
		actualStatus === 6 || actualStatus === 7
			? "upcoming"
			: verdictSource && verdictSource > 0
				? "completed"
				: actualStatus >= 2 || actualStatus === 5
					? "active"
					: "upcoming";

	return [
		{
			label: NODE_VERIFY_POC,
			state: verifyPocState,
			summary:
				verifyPocState === "active"
					? "Revealed evidence is being replayed and checked against the strict verification gate."
					: verifyPocState === "completed"
						? actualStatus === 6 || actualStatus === 7
							? "Strict verification finished and escalated this case into the adjudication branch."
							: "Strict verification finished and produced the evidence package for the current result path."
						: "Strict verification has not started yet.",
		},
		{
			label: NODE_JURY_ORCHESTRATOR,
			state: juryState,
			summary:
				juryState === "active"
					? `The confidential jury consensus window is open${lifecycle?.juryDeadline ? ` until ${new Date(Number(lifecycle.juryDeadline) * 1000).toLocaleString()}` : ""}.`
					: juryState === "completed"
						? jury
							? `Jury aggregation produced output: ${jury.action}${jury.rationale ? ` — ${jury.rationale}` : ""}`
							: "The jury path finished and handed off to the next protocol step."
						: juryState === "skipped"
							? "This case never entered jury aggregation because strict verification settled it directly."
							: "The jury node is idle unless strict verification fails to settle the case.",
		},
		{
			label: NODE_OWNER_ADJUDICATION,
			state: ownerState,
			summary:
				ownerState === "active"
					? `Owner judgment and testimony are currently required${lifecycle?.adjudicationDeadline ? ` before ${new Date(Number(lifecycle.adjudicationDeadline) * 1000).toLocaleString()}` : " before the adjudication deadline"}.`
					: ownerState === "completed"
						? "Owner adjudication supplied the accepted judgment after jury consensus failed to converge."
						: ownerState === "skipped"
							? "Owner adjudication remained unused because an earlier protocol branch settled the result."
							: "Owner adjudication stays dormant unless the jury path fails to settle the case.",
		},
		{
			label: NODE_WRITE_BACK,
			state: writeBackState,
			summary:
				writeBackState === "completed"
					? "A workflow-owned result package has been written into BountyHub for settlement-facing readers."
					: writeBackState === "active"
						? "The case has a visible protocol result, but the frontend is still waiting for verdict provenance metadata to land."
						: "BountyHub write-back remains pending until the workflow resolves the current branch.",
		},
	];
}

function buildJuryAggregate(
	actualStatus: number,
	verdictSource: number | undefined,
	lifecycle: SubmissionLifecycle | undefined,
	jury: SubmissionJury | undefined,
	grouping: SubmissionGrouping | undefined,
): WorkflowJuryAggregate | undefined {
	const juryPathVisible =
		actualStatus === 6 ||
		actualStatus === 7 ||
		verdictSource === 2 ||
		verdictSource === 3;

	if (!juryPathVisible) {
		return undefined;
	}

	const data: WorkflowEvidenceDatum[] = [];
	const juryDeadlineLabel = formatWorkflowTimestamp(lifecycle?.juryDeadline);
	const verdictSourceLabel =
		lifecycle && lifecycle.verdictSource > 0
			? VERDICT_SOURCE_LABELS[lifecycle.verdictSource]
			: undefined;

	if (juryDeadlineLabel) {
		data.push({ label: "JURY_DEADLINE", value: juryDeadlineLabel });
	}

	if (jury?.action) {
		data.push({ label: "JURY_ACTION", value: jury.action });
	}

	if (jury?.rationale) {
		data.push({ label: "JURY_RATIONALE", value: jury.rationale });
	}

	if (verdictSourceLabel) {
		data.push({ label: "VERDICT_SOURCE", value: verdictSourceLabel });
	}

	if (isReadableDigest(lifecycle?.juryLedgerDigest)) {
		data.push({
			label: "JURY_LEDGER_DIGEST",
			value: lifecycle?.juryLedgerDigest ?? "",
		});
	}

	if (grouping) {
		data.push({
			label: "GROUPING",
			value: `${grouping.cohort}-${grouping.groupRank}/${grouping.groupSize}`,
		});
	}

	return {
		summary:
			actualStatus === 6
				? `This case is in jury review${juryDeadlineLabel ? ` until ${juryDeadlineLabel}` : " until the jury deadline closes"}. The public frontend surface only receives aggregate lifecycle and recommendation metadata.`
				: "The jury path has already produced the aggregate metadata currently visible to settlement-facing readers.",
		availabilityNote:
			"No per-juror roster or vote records are public through the current contract/backend surface. Individual juror identities, slot assignments, and sealed opinions remain confidential.",
		data,
	};
}

function buildOwnerAdjudicationDraft(
	submissionId: bigint,
	projectId: bigint,
	actualStatus: number,
	canPrepareOwnerAdjudication: boolean,
	lifecycle: SubmissionLifecycle | undefined,
): WorkflowOwnerAdjudicationDraft {
	if (actualStatus !== 7) {
		return {
			isVisible: false,
			helper:
				"Owner adjudication input stays hidden until the workflow explicitly opens that fallback branch.",
			canPrepare: false,
			blockers: [],
		};
	}

	return {
		isVisible: true,
		canPrepare: canPrepareOwnerAdjudication,
		viewerNote: canPrepareOwnerAdjudication
			? undefined
			: "Only the project owner connected to this page can draft or prepare owner testimony from the frontend.",
		deadlineLabel: lifecycle?.adjudicationDeadline
			? new Date(Number(lifecycle.adjudicationDeadline) * 1000).toLocaleString()
			: undefined,
		helper:
			"Prepare the workflow-accurate owner testimony payload for this fallback branch. The final adjudication write-back still depends on workflow evidence that the frontend cannot read today.",
		testimonyPayloadSeed: {
			submissionId: submissionId.toString(),
			projectId: projectId.toString(),
			recommendationReportType: JURY_RECOMMENDATION_REPORT_TYPE,
		},
		blockers: [
			"Final adjudication submission is still blocked because the frontend cannot read the required jury recommendation envelope.",
			"The checked-in frontend surface does not expose the adjudication case or owner handoff package required for final verdict packaging.",
			"The checked-in backend simulator does not forward arbitrary HTTP trigger payloads into jury-orchestrator.",
		],
	};
}

export function buildVerificationWorkflowViewModel({
	submissionId,
	projectId,
	actualStatus,
	hasActiveDispute,
	canPrepareOwnerAdjudication,
	lifecycle,
	jury,
	grouping,
}: BuildVerificationWorkflowViewModelArgs): VerificationWorkflowViewModel {
	const verdictSource = lifecycle?.verdictSource;
	const stages: WorkflowStage[] = [
		STAGE_COMMITTED,
		STAGE_REVEALED,
		STAGE_STRICT_VERIFICATION,
		STAGE_JURY_REVIEW,
		STAGE_OWNER_ADJUDICATION,
		STAGE_FINAL_RESULT,
	].map((label) => ({
		label,
		state: resolveStageState(label, actualStatus, verdictSource),
	}));
	const nodeStatuses = buildNodeStatuses(
		actualStatus,
		verdictSource,
		lifecycle,
		jury,
	);
	const juryAggregate = buildJuryAggregate(
		actualStatus,
		verdictSource,
		lifecycle,
		jury,
		grouping,
	);
	const ownerAdjudication = buildOwnerAdjudicationDraft(
		submissionId,
		projectId,
		actualStatus,
		canPrepareOwnerAdjudication,
		lifecycle,
	);

	let activeTitle = STAGE_FINAL_RESULT;
	let activeSummary =
		"Final protocol result is now visible to settlement-facing readers.";
	let summaryVariant: WorkflowSummaryVariant = "success";

	if (actualStatus === 1) {
		activeTitle = STAGE_STRICT_VERIFICATION;
		activeSummary =
			"Revealed evidence is currently moving through strict verification and has not produced a protocol-visible result yet.";
		summaryVariant = "info";
	} else if (actualStatus === 6) {
		activeTitle = STAGE_JURY_REVIEW;
		activeSummary =
			"Strict verification did not settle this case. The submission has entered jury review and is waiting for the jury deadline to close.";
		summaryVariant = "warning";
	} else if (actualStatus === 7) {
		activeTitle = STAGE_OWNER_ADJUDICATION;
		activeSummary =
			"Jury consensus did not form. Owner adjudication is now open until the adjudication deadline.";
		summaryVariant = "warning";
	} else if (hasActiveDispute) {
		activeTitle = STAGE_FINAL_RESULT;
		activeSummary =
			"A protocol result exists, but it is currently disputed and not yet operationally settled.";
		summaryVariant = "error";
	} else if (actualStatus === 5) {
		activeTitle = STAGE_FINAL_RESULT;
		activeSummary =
			"Strict verification closed the case as invalid, and the current protocol-visible result reflects that rejected outcome.";
		summaryVariant = "error";
	} else if (verdictSource === 1) {
		activeSummary =
			"Strict verification produced the current protocol result without requiring jury escalation.";
	} else if (verdictSource === 2) {
		activeSummary =
			"Jury review reached an accepted outcome and the current protocol result came from that consensus path.";
	} else if (verdictSource === 3) {
		activeSummary =
			"The current protocol result came from owner adjudication after jury consensus failed to settle the case.";
	}

	const cards: WorkflowCard[] = [
		{
			title: STAGE_STRICT_VERIFICATION,
			summary:
				actualStatus === 6 || actualStatus === 7
					? "Strict verification completed but did not directly settle the submission, so the case moved into the adjudication path."
					: verdictSource === 1
						? "Strict verification settled this submission directly."
						: "Strict verification and evidence generation determine whether the protocol can settle the case directly or must escalate it.",
		},
		{
			title: STAGE_JURY_REVIEW,
			summary:
				actualStatus === 6
					? `Jury review is active${lifecycle?.juryDeadline ? ` until ${new Date(Number(lifecycle.juryDeadline) * 1000).toLocaleString()}` : ""}.`
					: jury
						? `Jury output is available: ${jury.action}${jury.rationale ? ` — ${jury.rationale}` : ""}`
						: "Jury review remains the confidential fallback when strict verification does not settle the case directly.",
		},
		{
			title: STAGE_OWNER_ADJUDICATION,
			summary:
				actualStatus === 7
					? `Owner adjudication is now open${lifecycle?.adjudicationDeadline ? ` until the adjudication deadline at ${new Date(Number(lifecycle.adjudicationDeadline) * 1000).toLocaleString()}` : " until the adjudication deadline"}.`
					: verdictSource === 3
						? "Owner adjudication supplied the final result after the jury path did not converge."
						: "Owner adjudication stays idle unless jury consensus fails to settle the case.",
		},
		{
			title: STAGE_FINAL_RESULT,
			summary: grouping
				? `The accepted result has entered final packaging with grouping ${grouping.cohort}-${grouping.groupRank}/${grouping.groupSize}.`
				: verdictSource && verdictSource > 0
					? "The accepted result has been packaged into settlement-visible protocol state."
					: "The final result will appear here once the workflow finishes and a protocol-visible verdict source exists.",
		},
	];

	return {
		activeTitle,
		activeSummary,
		summaryVariant,
		stages,
		nodeStatuses,
		juryAggregate,
		ownerAdjudication,
		cards,
	};
}
