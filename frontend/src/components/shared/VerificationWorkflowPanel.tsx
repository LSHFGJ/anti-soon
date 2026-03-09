import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
	resolveManualJuryTriggerUrl,
	submitManualJuryTrigger,
} from "@/lib/manualJuryClient";
import {
	resolveManualRevealTriggerUrl,
	submitManualRevealTrigger,
} from "@/lib/manualRevealClient";
import { cn } from "@/lib/utils";
import { NeonPanel, StatusBanner } from "./ui-primitives";
import type {
	VerificationWorkflowViewModel,
	WorkflowStageState,
} from "./verificationWorkflow";

interface VerificationWorkflowPanelProps {
	workflow: VerificationWorkflowViewModel;
}

const stageStateClasses: Record<WorkflowStageState, string> = {
	completed:
		"border-[var(--color-primary)] text-[var(--color-primary)] bg-[var(--color-primary-dim)]",
	active:
		"border-[var(--color-secondary)] text-[var(--color-secondary)] bg-[var(--color-secondary-dim)]",
	upcoming:
		"border-[var(--color-bg-light)] text-[var(--color-text-dim)] bg-transparent",
	skipped:
		"border-[var(--color-bg-light)] text-[var(--color-text-dim)] bg-[rgba(255,255,255,0.02)]",
};

export function VerificationWorkflowPanel({
	workflow,
}: VerificationWorkflowPanelProps) {
	const autoRevealDemo = workflow.autoRevealDemo;
	const manualJuryDemo = workflow.manualJuryDemo;
	const [ownerTestimony, setOwnerTestimony] = useState("");
	const [validationErrors, setValidationErrors] = useState<{
		testimony?: string;
	}>({});
	const [preparedPayload, setPreparedPayload] = useState<{
		submissionId: string;
		projectId: string;
		recommendationReportType: "jury-recommendation/v1";
		testimony: string;
	} | null>(null);
	const [manualJuryRoundId, setManualJuryRoundId] = useState(
		manualJuryDemo?.defaultJuryRoundId ?? "1",
	);
	const [manualJuryVerifiedReport, setManualJuryVerifiedReport] = useState(
		manualJuryDemo
			? JSON.stringify(manualJuryDemo.verifiedReportSeed, null, 2)
			: "",
	);
	const [manualJuryHumanOpinions, setManualJuryHumanOpinions] = useState(
		manualJuryDemo
			? JSON.stringify(manualJuryDemo.humanOpinionsSeed, null, 2)
			: "",
	);
	const [manualJuryError, setManualJuryError] = useState<string | null>(null);
	const [manualJuryResult, setManualJuryResult] = useState<{
		executionKey?: string;
		finalReportType?: string;
	} | null>(null);
	const [manualJurySubmitting, setManualJurySubmitting] = useState(false);
	const [manualRevealError, setManualRevealError] = useState<string | null>(null);
	const [manualRevealResult, setManualRevealResult] = useState<{
		executionKey?: string;
		executedCount?: number;
	} | null>(null);
	const [manualRevealSubmitting, setManualRevealSubmitting] = useState(false);

	function handlePrepareTestimonyPayload() {
		const nextErrors: { testimony?: string } = {};
		if (!ownerTestimony.trim()) {
			nextErrors.testimony =
				"Add owner testimony before preparing the workflow payload.";
		}

		setValidationErrors(nextErrors);

		if (Object.keys(nextErrors).length > 0) {
			setPreparedPayload(null);
			return;
		}

		if (!workflow.ownerAdjudication.testimonyPayloadSeed) {
			setPreparedPayload(null);
			return;
		}

		setPreparedPayload({
			...workflow.ownerAdjudication.testimonyPayloadSeed,
			testimony: ownerTestimony.trim(),
		});
	}

	async function handleSubmitManualJuryDemo() {
		if (!manualJuryDemo) {
			return;
		}

		setManualJuryError(null);
		setManualJuryResult(null);

		let verifiedReport: unknown;
		let humanOpinions: unknown;
		let juryRoundId = 1;

		try {
			verifiedReport = JSON.parse(manualJuryVerifiedReport);
		} catch {
			setManualJuryError(
				"Verified report JSON must parse before the manual jury demo can be submitted.",
			);
			return;
		}

		try {
			humanOpinions = JSON.parse(manualJuryHumanOpinions);
		} catch {
			setManualJuryError(
				"Human opinions JSON must parse before the manual jury demo can be submitted.",
			);
			return;
		}

		if (!Array.isArray(humanOpinions)) {
			setManualJuryError(
				"Human opinions JSON must be an array for the manual jury demo trigger.",
			);
			return;
		}

		if (manualJuryRoundId.trim().length > 0) {
			juryRoundId = Number.parseInt(manualJuryRoundId.trim(), 10);
			if (!Number.isFinite(juryRoundId) || juryRoundId <= 0) {
				setManualJuryError(
					"Jury round id must be a positive integer before submitting the manual jury demo.",
				);
				return;
			}
		}

		setManualJurySubmitting(true);
		try {
			const response = await submitManualJuryTrigger({
				verifiedReport,
				humanOpinions,
				juryRoundId,
			});
			setManualJuryResult({
				executionKey: response.executionKey,
				finalReportType: response.result?.result?.finalReportType,
			});
		} catch (error) {
			setManualJuryError(
				error instanceof Error
					? error.message
					: "Manual jury demo submission failed.",
			);
		} finally {
			setManualJurySubmitting(false);
		}
	}

	async function handleTriggerManualAutoReveal() {
		if (!autoRevealDemo) {
			return;
		}

		setManualRevealError(null);
		setManualRevealResult(null);
		setManualRevealSubmitting(true);
		try {
			const response = await submitManualRevealTrigger();
			setManualRevealResult({
				executionKey: response.executionKey,
				executedCount: response.result?.result?.executedCount,
			});
		} catch (error) {
			setManualRevealError(
				error instanceof Error
					? error.message
					: "Manual auto-reveal trigger failed.",
			);
		} finally {
			setManualRevealSubmitting(false);
		}
	}

	return (
		<div className="pt-4 border-t border-[var(--color-bg-light)]">
			<h3 className="text-xs font-mono text-[var(--color-secondary)] mb-3 tracking-wider">
				VERIFICATION_WORKFLOW
			</h3>
			<div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
				{workflow.stages.map((stage) => (
					<div
						key={stage.label}
						className={cn(
							"rounded-md border px-3 py-2 font-mono text-xs uppercase tracking-wider",
							stageStateClasses[stage.state],
						)}
					>
						<div className="flex items-center justify-between gap-2">
							<span>{stage.label}</span>
							<Badge
								variant={
									stage.state === "active"
										? "secondary"
										: stage.state === "completed"
											? "success"
											: "outline"
								}
							>
								[{stage.state.toUpperCase()}]
							</Badge>
						</div>
					</div>
				))}
			</div>

			<StatusBanner
				className="mt-4"
				variant={workflow.summaryVariant}
				message={
					<div className="space-y-1">
						<p className="font-bold tracking-wider">{workflow.activeTitle}</p>
						<p className="text-xs leading-relaxed">{workflow.activeSummary}</p>
					</div>
				}
			/>

			{workflow.nodeStatuses.length > 0 && (
				<div className="mt-4 space-y-3">
					<h4 className="text-[0.7rem] font-mono tracking-wider text-[var(--color-secondary)] uppercase">
						PROTOCOL_NODE_STATUS
					</h4>
					<div className="grid gap-3 xl:grid-cols-2">
						{workflow.nodeStatuses.map((node) => (
							<NeonPanel
								key={node.label}
								className="shadow-none"
								contentClassName="space-y-2 p-3"
							>
								<div className="flex items-start justify-between gap-3">
									<div>
										<h5 className="text-[0.7rem] font-mono tracking-wider text-[var(--color-secondary)]">
											{node.label}
										</h5>
									</div>
									<Badge
										variant={
											node.state === "active"
												? "secondary"
												: node.state === "completed"
													? "success"
													: "outline"
										}
									>
										[{node.state.toUpperCase()}]
									</Badge>
								</div>
								<p className="text-xs font-mono leading-relaxed text-[var(--color-text-dim)]">
									{node.summary}
								</p>
							</NeonPanel>
						))}
					</div>
				</div>
			)}

			{workflow.juryAggregate && (
				<div className="mt-4 space-y-3">
					<h4 className="text-[0.7rem] font-mono tracking-wider text-[var(--color-secondary)] uppercase">
						JURY_AGGREGATE_STATE
					</h4>
					<StatusBanner
						variant={
							workflow.activeTitle === "Jury Review" ? "warning" : "info"
						}
						message={
							<p className="text-xs leading-relaxed">
								{workflow.juryAggregate.summary}
							</p>
						}
					/>
					<StatusBanner
						variant="info"
						message={
							<p className="text-xs leading-relaxed">
								{workflow.juryAggregate.availabilityNote}
							</p>
						}
					/>
					<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
						{workflow.juryAggregate.data.map((datum) => (
							<NeonPanel
								key={datum.label}
								className="shadow-none"
								contentClassName="space-y-2 p-3"
							>
								<p className="text-[0.68rem] font-mono tracking-wider text-[var(--color-secondary)] uppercase">
									{datum.label}
								</p>
								<p className="text-[0.68rem] font-mono leading-relaxed break-all text-[var(--color-text-dim)]">
									{datum.value}
								</p>
							</NeonPanel>
						))}
					</div>
				</div>
			)}

			{autoRevealDemo?.isVisible && (
				<div className="mt-4 space-y-3">
					<h4 className="text-[0.7rem] font-mono tracking-wider text-[var(--color-secondary)] uppercase">
						MANUAL_AUTO_REVEAL
					</h4>
					<NeonPanel
						tone="warning"
						className="shadow-none"
						contentClassName="space-y-4 p-4"
					>
						<div className="space-y-2">
							<p className="text-xs font-mono leading-relaxed text-[var(--color-text-dim)]">
								{autoRevealDemo.helper}
							</p>
							<p className="text-[0.7rem] font-mono uppercase tracking-wider text-[var(--color-warning)]">
								Trigger endpoint: {resolveManualRevealTriggerUrl()}
							</p>
						</div>

						<StatusBanner
							variant="warning"
							message={
								<div className="space-y-1">
									<p className="font-bold tracking-wider">
										AUTO_REVEAL_PRECONDITIONS
									</p>
									{autoRevealDemo.blockers.map((blocker) => (
										<p key={blocker} className="text-xs leading-relaxed">
											{blocker}
										</p>
									))}
								</div>
							}
						/>

						{autoRevealDemo.viewerNote && (
							<StatusBanner
								variant="info"
								message={
									<p className="text-xs leading-relaxed">
										{autoRevealDemo.viewerNote}
									</p>
								}
							/>
						)}

						{manualRevealError && (
							<StatusBanner
								variant="error"
								message={
									<div className="space-y-1">
										<p className="font-bold tracking-wider">
											MANUAL_AUTO_REVEAL_ERROR
										</p>
										<p className="text-xs leading-relaxed">{manualRevealError}</p>
									</div>
								}
							/>
						)}

						<Button
							onClick={handleTriggerManualAutoReveal}
							disabled={!autoRevealDemo.canTrigger || manualRevealSubmitting}
							className="w-full bg-transparent border border-[var(--color-warning)] text-[var(--color-warning)] hover:bg-[var(--color-warning)] hover:text-[var(--color-bg)] font-mono"
						>
							{manualRevealSubmitting
								? "[ TRIGGERING AUTO-REVEAL... ]"
								: "[ TRIGGER AUTO-REVEAL ]"}
						</Button>

						{manualRevealResult && (
							<StatusBanner
								variant="warning"
								message={
									<div className="space-y-3">
										<p className="font-bold tracking-wider">
											MANUAL_AUTO_REVEAL_SUBMITTED
										</p>
										<p className="text-xs leading-relaxed">
											Execution key: {manualRevealResult.executionKey ?? "pending"}
										</p>
										{typeof manualRevealResult.executedCount === "number" && (
											<p className="text-xs leading-relaxed">
												Executed queued reveals: {manualRevealResult.executedCount}
											</p>
										)}
									</div>
								}
							/>
						)}
					</NeonPanel>
				</div>
			)}

			{manualJuryDemo?.isVisible && (
				<div className="mt-4 space-y-3">
					<h4 className="text-[0.7rem] font-mono tracking-wider text-[var(--color-secondary)] uppercase">
						MANUAL_JURY_DEMO
					</h4>
					<NeonPanel
						tone="warning"
						className="shadow-none"
						contentClassName="space-y-4 p-4"
					>
						<div className="space-y-2">
							<p className="text-xs font-mono leading-relaxed text-[var(--color-text-dim)]">
								{manualJuryDemo.helper}
							</p>
							<p className="text-[0.7rem] font-mono uppercase tracking-wider text-[var(--color-warning)]">
								Trigger endpoint: {resolveManualJuryTriggerUrl()}
							</p>
						</div>

						<div className="space-y-2">
							<label
								htmlFor="manual-jury-round-id"
								className="block text-[0.72rem] font-mono uppercase tracking-wider text-[var(--color-text)]"
							>
								Jury Round Id
							</label>
							<Input
								id="manual-jury-round-id"
								type="number"
								min={1}
								value={manualJuryRoundId}
								onChange={(event) => {
									setManualJuryRoundId(event.target.value);
									setManualJuryError(null);
									setManualJuryResult(null);
								}}
								disabled={!manualJuryDemo.canSubmit || manualJurySubmitting}
							/>
						</div>

						<div className="space-y-2">
							<label
								htmlFor="manual-jury-verified-report"
								className="block text-[0.72rem] font-mono uppercase tracking-wider text-[var(--color-text)]"
							>
								Verified Report JSON
							</label>
							<Textarea
								id="manual-jury-verified-report"
								rows={12}
								value={manualJuryVerifiedReport}
								onChange={(event) => {
									setManualJuryVerifiedReport(event.target.value);
									setManualJuryError(null);
									setManualJuryResult(null);
								}}
								disabled={!manualJuryDemo.canSubmit || manualJurySubmitting}
								className="min-h-[220px] resize-y bg-background/50 font-mono text-[0.72rem]"
							/>
						</div>

						<div className="space-y-2">
							<label
								htmlFor="manual-jury-human-opinions"
								className="block text-[0.72rem] font-mono uppercase tracking-wider text-[var(--color-text)]"
							>
								Human Opinions JSON
							</label>
							<Textarea
								id="manual-jury-human-opinions"
								rows={12}
								value={manualJuryHumanOpinions}
								onChange={(event) => {
									setManualJuryHumanOpinions(event.target.value);
									setManualJuryError(null);
									setManualJuryResult(null);
								}}
								disabled={!manualJuryDemo.canSubmit || manualJurySubmitting}
								className="min-h-[220px] resize-y bg-background/50 font-mono text-[0.72rem]"
							/>
						</div>

						{manualJuryDemo.viewerNote && (
							<StatusBanner
								variant="info"
								message={
									<p className="text-xs leading-relaxed">
										{manualJuryDemo.viewerNote}
									</p>
								}
							/>
						)}

						{manualJuryError && (
							<StatusBanner
								variant="error"
								message={
									<div className="space-y-1">
										<p className="font-bold tracking-wider">
											MANUAL_JURY_ERROR
										</p>
										<p className="text-xs leading-relaxed">{manualJuryError}</p>
									</div>
								}
							/>
						)}

						<Button
							onClick={handleSubmitManualJuryDemo}
							disabled={!manualJuryDemo.canSubmit || manualJurySubmitting}
							className="w-full bg-transparent border border-[var(--color-warning)] text-[var(--color-warning)] hover:bg-[var(--color-warning)] hover:text-[var(--color-bg)] font-mono"
						>
							{manualJurySubmitting
								? "[ SUBMITTING MANUAL JURY DEMO... ]"
								: "[ SUBMIT MANUAL JURY DEMO ]"}
						</Button>

						{manualJuryResult && (
							<StatusBanner
								variant="warning"
								message={
									<div className="space-y-3">
										<p className="font-bold tracking-wider">
											MANUAL_JURY_SUBMITTED
										</p>
										<p className="text-xs leading-relaxed">
											Execution key:{" "}
											{manualJuryResult.executionKey ?? "pending"}
										</p>
										{manualJuryResult.finalReportType && (
											<p className="text-xs leading-relaxed">
												Final report type: {manualJuryResult.finalReportType}
											</p>
										)}
									</div>
								}
							/>
						)}
					</NeonPanel>
				</div>
			)}

			{workflow.ownerAdjudication.isVisible && (
				<div className="mt-4 space-y-3">
					<h4 className="text-[0.7rem] font-mono tracking-wider text-[var(--color-secondary)] uppercase">
						OWNER_TESTIMONY_INPUT
					</h4>
					<NeonPanel
						tone="warning"
						className="shadow-none"
						contentClassName="space-y-4 p-4"
					>
						<div className="space-y-1">
							<p className="text-xs font-mono leading-relaxed text-[var(--color-text-dim)]">
								{workflow.ownerAdjudication.helper}
							</p>
							{workflow.ownerAdjudication.deadlineLabel && (
								<p className="text-[0.7rem] font-mono uppercase tracking-wider text-[var(--color-warning)]">
									Adjudication deadline:{" "}
									{workflow.ownerAdjudication.deadlineLabel}
								</p>
							)}
						</div>

						<StatusBanner
							variant="warning"
							message={
								<div className="space-y-1">
									<p className="font-bold tracking-wider">
										WORKFLOW_SUBMISSION_BLOCKERS
									</p>
									{workflow.ownerAdjudication.blockers.map((blocker) => (
										<p key={blocker} className="text-xs leading-relaxed">
											{blocker}
										</p>
									))}
								</div>
							}
						/>

						{workflow.ownerAdjudication.testimonyPayloadSeed && (
							<NeonPanel
								className="shadow-none"
								contentClassName="space-y-2 p-3"
							>
								<p className="text-[0.68rem] font-mono tracking-wider text-[var(--color-secondary)] uppercase">
									WORKFLOW_PAYLOAD_BASE
								</p>
								<pre className="overflow-x-auto rounded-sm border border-[var(--color-bg-light)] bg-black/20 p-3 text-[0.68rem] leading-relaxed text-[var(--color-text-dim)]">
									{JSON.stringify(
										workflow.ownerAdjudication.testimonyPayloadSeed,
										null,
										2,
									)}
								</pre>
							</NeonPanel>
						)}

						<div className="space-y-2">
							<label
								htmlFor="owner-testimony"
								className="block text-[0.72rem] font-mono uppercase tracking-wider text-[var(--color-text)]"
							>
								Owner Testimony
							</label>
							<Textarea
								id="owner-testimony"
								rows={4}
								value={ownerTestimony}
								onChange={(event) => {
									setOwnerTestimony(event.target.value);
									setPreparedPayload(null);
									setValidationErrors((current) => ({
										...current,
										testimony: undefined,
									}));
								}}
								disabled={!workflow.ownerAdjudication.canPrepare}
								placeholder="Write the owner testimony that should accompany the workflow handoff for this adjudication branch."
								className="min-h-[108px] resize-y bg-background/50 font-mono"
							/>
							{validationErrors.testimony && (
								<p className="text-xs font-mono text-[var(--color-error)]">
									{validationErrors.testimony}
								</p>
							)}
						</div>

						{workflow.ownerAdjudication.viewerNote && (
							<StatusBanner
								variant="info"
								message={
									<p className="text-xs leading-relaxed">
										{workflow.ownerAdjudication.viewerNote}
									</p>
								}
							/>
						)}

						<Button
							onClick={handlePrepareTestimonyPayload}
							disabled={!workflow.ownerAdjudication.canPrepare}
							className="w-full bg-transparent border border-[var(--color-warning)] text-[var(--color-warning)] hover:bg-[var(--color-warning)] hover:text-[var(--color-bg)] font-mono"
						>
							[ PREPARE TESTIMONY PAYLOAD ]
						</Button>

						{preparedPayload && (
							<StatusBanner
								variant="warning"
								message={
									<div className="space-y-3">
										<p className="font-bold tracking-wider">
											TESTIMONY_PAYLOAD_READY
										</p>
										<p className="text-xs leading-relaxed">
											Prepared the workflow-accurate owner testimony payload
											with {preparedPayload.testimony.length} characters of
											testimony.
										</p>
										<pre className="overflow-x-auto rounded-sm border border-[var(--color-warning)]/30 bg-black/20 p-3 text-[0.68rem] leading-relaxed text-[var(--color-text)]">
											{JSON.stringify(preparedPayload, null, 2)}
										</pre>
									</div>
								}
							/>
						)}
					</NeonPanel>
				</div>
			)}

			<div className="mt-4 grid gap-3 md:grid-cols-2">
				{workflow.cards.map((card) => (
					<NeonPanel
						key={card.title}
						className="shadow-none"
						contentClassName="space-y-2 p-3"
					>
						<h4 className="text-[0.7rem] font-mono tracking-wider text-[var(--color-secondary)] uppercase">
							{card.title}
						</h4>
						<p className="text-xs font-mono leading-relaxed text-[var(--color-text-dim)]">
							{card.summary}
						</p>
					</NeonPanel>
				))}
			</div>
		</div>
	);
}
