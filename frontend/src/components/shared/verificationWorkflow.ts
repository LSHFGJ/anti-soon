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

export interface WorkflowManualJuryDemoDraft {
	isVisible: boolean;
	helper: string;
	canSubmit: boolean;
	viewerNote?: string;
	defaultJuryRoundId: string;
	verifiedReportSeed: Record<string, unknown>;
	humanOpinionsSeed: Array<Record<string, unknown>>;
}

export interface WorkflowAutoRevealDemoDraft {
	isVisible: boolean;
	helper: string;
	canTrigger: boolean;
	viewerNote?: string;
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
	autoRevealDemo?: WorkflowAutoRevealDemoDraft;
	manualJuryDemo?: WorkflowManualJuryDemoDraft;
	ownerAdjudication: WorkflowOwnerAdjudicationDraft;
	cards: WorkflowCard[];
}

interface BuildVerificationWorkflowViewModelArgs {
	submissionId: bigint;
	projectId: bigint;
	actualStatus: number;
	drainAmountWei: bigint;
	severity: number;
	commitTimestamp: bigint;
	revealTimestamp: bigint;
	hasActiveDispute: boolean;
	canPrepareOwnerAdjudication: boolean;
	canRunManualAutoReveal: boolean;
	canRunManualJury: boolean;
	bountyHubAddress: `0x${string}`;
	projectCommitDeadline?: bigint;
	projectRevealDeadline?: bigint;
	projectJuryWindow?: bigint;
	projectAdjudicationWindow?: bigint;
	oasisTxHash?: `0x${string}`;
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

function makeBytes32Hex(seed: string): `0x${string}` {
	const normalized =
		Array.from(seed)
			.map((character) => character.charCodeAt(0).toString(16).padStart(2, "0"))
			.join("") || "ab";
	return `0x${normalized.repeat(Math.ceil(64 / normalized.length)).slice(0, 64)}` as `0x${string}`;
}

function resolveBytes32OrFallback(
	value: string | undefined,
	fallbackSeed: string,
): `0x${string}` {
	return isReadableDigest(value)
		? (value as `0x${string}`)
		: makeBytes32Hex(fallbackSeed);
}

function buildManualJuryHumanOpinionSeeds(
	submissionId: bigint,
): Array<Record<string, unknown>> {
	return [
		"human:alice",
		"human:bob",
		"human:carol",
		"human:dora",
		"human:erin",
	].map((jurorId, index) => ({
		jurorId,
		finalValidity: "HIGH",
		rationale: `Manual review slot ${index + 1} confirms exploitable behavior for submission ${submissionId.toString()}.`,
		testimony: `Human juror ${jurorId} reviewed the reproduced exploit context and agrees this case should continue through the jury path.`,
	}));
}

function buildManualJuryDemoDraft(args: {
	submissionId: bigint;
	projectId: bigint;
	actualStatus: number;
	drainAmountWei: bigint;
	severity: number;
	commitTimestamp: bigint;
	revealTimestamp: bigint;
	canRunManualJury: boolean;
	bountyHubAddress: `0x${string}`;
	projectJuryWindow?: bigint;
	projectAdjudicationWindow?: bigint;
	oasisTxHash?: `0x${string}`;
	lifecycle?: SubmissionLifecycle;
}): WorkflowManualJuryDemoDraft | undefined {
	if (args.actualStatus !== 6 && args.actualStatus !== 7) {
		return undefined;
	}

	const fallbackSlotId = `slot-${args.submissionId.toString()}`;
	const verifiedReportSeed: Record<string, unknown> = {
		magic: "ASRP",
		reportType: "verified-report/v3",
		payload: {
			submissionId: args.submissionId.toString(),
			projectId: args.projectId.toString(),
			isValid: false,
			drainAmountWei: args.drainAmountWei.toString(),
			observedCalldata: [],
		},
		juryCommitment: {
			commitmentVersion: "anti-soon.verify-poc.jury-commitment.v1",
			juryLedgerDigest: resolveBytes32OrFallback(
				args.lifecycle?.juryLedgerDigest,
				`jury-ledger-${args.submissionId.toString()}`,
			),
			sourceEventKey: makeBytes32Hex(
				`source-event-${args.submissionId.toString()}`,
			),
			mappingFingerprint: makeBytes32Hex(
				`mapping-fingerprint-${args.projectId.toString()}`,
			),
		},
		adjudication: {
			adjudicationVersion: "anti-soon.verify-poc.adjudication.v1",
			syncId: makeBytes32Hex(`sync-${args.submissionId.toString()}`),
			idempotencyKey: makeBytes32Hex(
				`idempotency-${args.submissionId.toString()}`,
			),
			cipherURI: `oasis://oasis-sapphire-testnet/0x1111111111111111111111111111111111111111/${fallbackSlotId}#${args.oasisTxHash ?? makeBytes32Hex(`cipher-${args.submissionId.toString()}`)}`,
			severity: args.severity,
			juryWindow: (args.projectJuryWindow ?? 3600n).toString(),
			adjudicationWindow: (args.projectAdjudicationWindow ?? 7200n).toString(),
			commitTimestampSec: args.commitTimestamp.toString(),
			revealTimestampSec: args.revealTimestamp.toString(),
			chainSelectorName: "ethereum-testnet-sepolia",
			bountyHubAddress: args.bountyHubAddress,
			oasis: {
				chain: "oasis-sapphire-testnet",
				contract: "0x1111111111111111111111111111111111111111",
				slotId: fallbackSlotId,
				envelopeHash:
					args.oasisTxHash ??
					makeBytes32Hex(`envelope-${args.submissionId.toString()}`),
			},
		},
	};

	return {
		isVisible: true,
		canSubmit: args.canRunManualJury,
		viewerNote: args.canRunManualJury
			? undefined
			: "Only the project owner connected to this page can submit the manual jury demo payload from the frontend.",
		helper:
			args.actualStatus === 6
				? "Assemble the editable verified report and five human opinions, then submit them to the backend manual-jury trigger so the mixed LLM + human demo path can run from this page."
				: "Owner adjudication is open, but you can still rerun the manual-jury demo path here with an editable verified report and human-opinion payload.",
		defaultJuryRoundId: "1",
		verifiedReportSeed,
	humanOpinionsSeed: buildManualJuryHumanOpinionSeeds(args.submissionId),
	};
}

function buildAutoRevealDemoDraft(args: {
	actualStatus: number;
	revealTimestamp: bigint;
	canRunManualAutoReveal: boolean;
	projectCommitDeadline?: bigint;
	projectRevealDeadline?: bigint;
}): WorkflowAutoRevealDemoDraft | undefined {
	if (args.actualStatus !== 0 || args.revealTimestamp > 0n) {
		return undefined;
	}

	const deadlineNotes: string[] = [];
	if (args.projectCommitDeadline && args.projectCommitDeadline > 0n) {
		deadlineNotes.push(
			`commit deadline ${new Date(Number(args.projectCommitDeadline) * 1000).toLocaleString()}`,
		);
	}
	if (args.projectRevealDeadline && args.projectRevealDeadline > 0n) {
		deadlineNotes.push(
			`reveal deadline ${new Date(Number(args.projectRevealDeadline) * 1000).toLocaleString()}`,
		);
	}

	return {
		isVisible: true,
		canTrigger: args.canRunManualAutoReveal,
		viewerNote: args.canRunManualAutoReveal
			? undefined
			: "Only the project owner connected to this page can dispatch the backend auto-reveal demo trigger from the frontend.",
		helper:
			deadlineNotes.length > 0
				? `Dispatch the backend auto-reveal relayer cycle for this committed submission. This demo path only succeeds if a queued reveal already exists on-chain and the relayer can execute it during ${deadlineNotes.join(" / ")}.`
				: "Dispatch the backend auto-reveal relayer cycle for this committed submission. This demo path only succeeds if a queued reveal already exists on-chain and the relayer can execute it.",
		blockers: [
			"This frontend action does not create queueRevealBySig authorization; it only triggers the backend relayer cycle.",
			"The backend must have DEMO_OPERATOR RPC/key env configured and a writable auto-reveal cursor file.",
		],
	};
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
		],
	};
}

export function buildVerificationWorkflowViewModel({
	submissionId,
	projectId,
	actualStatus,
	drainAmountWei,
	severity,
	commitTimestamp,
	revealTimestamp,
	hasActiveDispute,
	canPrepareOwnerAdjudication,
	canRunManualAutoReveal,
	canRunManualJury,
	bountyHubAddress,
	projectCommitDeadline,
	projectRevealDeadline,
	projectJuryWindow,
	projectAdjudicationWindow,
	oasisTxHash,
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
	const autoRevealDemo = buildAutoRevealDemoDraft({
		actualStatus,
		revealTimestamp,
		canRunManualAutoReveal,
		projectCommitDeadline,
		projectRevealDeadline,
	});
	const manualJuryDemo = buildManualJuryDemoDraft({
		submissionId,
		projectId,
		actualStatus,
		drainAmountWei,
		severity,
		commitTimestamp,
		revealTimestamp,
		canRunManualJury,
		bountyHubAddress,
		projectJuryWindow,
		projectAdjudicationWindow,
		oasisTxHash,
		lifecycle,
	});
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
		autoRevealDemo,
		manualJuryDemo,
		ownerAdjudication,
		cards,
	};
}
