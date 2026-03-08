import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
