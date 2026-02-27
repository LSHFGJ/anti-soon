import React, { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useCommitReveal } from "../../../hooks/useCommitReveal";
import { STEP_GUIDES, StepGuidance } from "../../StepGuidance";

interface ReviewStepProps {
	pocJson: string;
	isConnected: boolean;
	isSubmitting: boolean;
	submissionHash: string;
	error: string | null;
	onConnect: () => void;
	onSubmit: () => void;
	onBack: () => void;
	projectId: bigint | null;
	useV2?: boolean;
	showBackButton?: boolean;
}

const Spinner: React.FC<{ children: React.ReactNode }> = ({ children }) => (
	<div className="flex items-center justify-center gap-3 p-4 text-[var(--color-secondary)]">
		<span className="spinner"></span>
		<span className="font-mono">{children}</span>
	</div>
);

const CheckIcon: React.FC = () => (
	<span className="text-[var(--color-primary)] mr-2">✓</span>
);

export const ReviewStep: React.FC<ReviewStepProps> = React.memo(
	({
		pocJson,
		isConnected,
		isSubmitting: _isSubmitting,
		submissionHash: _submissionHash,
		error: _error,
		onConnect,
		onSubmit: _onSubmit,
		onBack,
		projectId,
		useV2: _useV2 = true,
		showBackButton = true,
	}) => {
		const commitReveal = useCommitReveal(projectId, pocJson);
		const phase = commitReveal.state.phase;
		const phaseError = commitReveal.state.error;
		const { success, error: toastError } = useToast();
		const notifiedPhaseRef = useRef(phase);
		const notifiedErrorRef = useRef<string | undefined>(undefined);

		useEffect(() => {
			if (phase !== notifiedPhaseRef.current) {
				if (phase === "committed") {
					success({
						title: "PoC Committed",
						description: "Your PoC reference has been submitted successfully.",
					});
				} else if (phase === "queued") {
					success({
						title: "Auto Reveal Queued",
						description:
							"Reveal is queued and will be executable after commit deadline.",
					});
				} else if (phase === "revealed") {
					success({
						title: "PoC Revealed",
						description: "Verification is now in progress.",
					});
				} else if (phase === "failed" && phaseError) {
					toastError({
						title: "Transaction Failed",
						description: phaseError,
					});
					notifiedErrorRef.current = phaseError;
				}

				notifiedPhaseRef.current = phase;
				if (phase !== "failed") {
					notifiedErrorRef.current = undefined;
				}
				return;
			}

			if (
				phase === "failed" &&
				phaseError &&
				phaseError !== notifiedErrorRef.current
			) {
				toastError({
					title: "Transaction Failed",
					description: phaseError,
				});
				notifiedErrorRef.current = phaseError;
			}
		}, [phase, phaseError, success, toastError]);

		const renderV2Flow = () => {
			const { state, commit, reveal, reset } = commitReveal;
			const projectContextMissing = projectId === null;
			const canCommit = isConnected && !projectContextMissing;
			const revealAvailable = Boolean(state.submissionId && state.salt);
			const retryLabel = revealAvailable
				? "[ RETRY_REVEAL ]"
				: "[ RETRY_COMMIT ]";
			const onRetry = revealAvailable ? reveal : commit;

			return (
				<div className="mt-6">
					{state.error && (
						<div className="text-[var(--color-error)] border border-[var(--color-error)] p-4 mb-4 bg-[rgba(255,0,0,0.05)]">
							<div className="font-mono mb-2">ERROR:</div>
							<div className="text-sm">{state.error}</div>
							<div className="flex gap-2 flex-wrap mt-3">
								<button
									type="button"
									onClick={onRetry}
									className="bg-transparent border border-[var(--color-error)] text-[var(--color-error)] px-4 py-2 cursor-pointer font-mono text-xs"
								>
									{retryLabel}
								</button>
								<button
									type="button"
									onClick={reset}
									className="bg-transparent border border-[var(--color-error)] text-[var(--color-error)] px-4 py-2 cursor-pointer font-mono text-xs"
								>
									[ RESET ]
								</button>
							</div>
						</div>
					)}

					{state.warning && (
						<div className="text-[var(--color-secondary)] border border-[var(--color-secondary)] p-4 mb-4 bg-[rgba(124,58,237,0.08)]">
							<div className="font-mono mb-2">NOTICE:</div>
							<div className="text-sm">{state.warning}</div>
						</div>
					)}

					{state.phase === "idle" && (
						<div className="flex gap-4 flex-wrap">
							{!isConnected ? (
								<button
									type="button"
									onClick={onConnect}
									className="px-8 py-3 bg-[var(--color-secondary)] text-[var(--color-bg)] border-none cursor-pointer font-mono"
								>
									[ CONNECT_WALLET ]
								</button>
							) : null}
							{isConnected && projectContextMissing ? (
								<div
									data-testid="review-project-context-required"
									className="w-full border border-[var(--color-error)] bg-[rgba(255,0,0,0.05)] text-[var(--color-error)] px-4 py-3 font-mono text-xs"
								>
									<div className="mb-2">PROJECT_CONTEXT_REQUIRED</div>
									<div>
										No active project is selected, so commit cannot be submitted.
									</div>
									<div className="mt-3 flex gap-2 flex-wrap">
										<a
											href="/explorer"
											className="inline-flex items-center border border-[var(--color-error)] px-3 py-2 text-[var(--color-error)] no-underline"
										>
											[ OPEN_EXPLORER ]
										</a>
										<a
											href="/builder"
											className="inline-flex items-center border border-[var(--color-error)] px-3 py-2 text-[var(--color-error)] no-underline"
										>
											[ RETRY_CONTEXT ]
										</a>
									</div>
								</div>
							) : null}
							{canCommit ? (
								<div className="border border-[var(--color-secondary)] bg-[rgba(124,58,237,0.08)] text-[var(--color-secondary)] px-4 py-3 font-mono text-xs">
									Ready to commit. Use the footer action next to [ PREVIOUS ].
								</div>
							) : null}
						</div>
					)}

					{state.phase === "encrypting" && (
						<Spinner>Preparing ACL storage payload...</Spinner>
					)}

					{state.phase === "committing" && (
						<Spinner>Committing PoC reference to blockchain...</Spinner>
					)}

					{state.phase === "committed" && (
						<div className="p-6 border border-[var(--color-primary)] bg-[rgba(124,58,237,0.05)] mb-4">
							<div className="flex items-center gap-2">
								<CheckIcon /> PHASE_1_COMPLETE
							</div>

							<div className="text-sm mb-3">
								<span className="text-[var(--color-text-dim)]">
									Submission ID:{" "}
								</span>
								<span className="text-[var(--color-secondary)] font-mono">
									{state.submissionId?.toString()}
								</span>
							</div>

							{state.commitTxHash && (
								<div className="text-sm mb-3 break-all">
									<span className="text-[var(--color-text-dim)]">
										Commit TX:{" "}
									</span>
									<code className="text-[var(--color-secondary)] text-xs">
										{state.commitTxHash}
									</code>
								</div>
							)}

							<div className="mt-4 p-4 bg-neutral-900/80 rounded text-xs text-[var(--color-text-dim)]">
								Your PoC reference is stored via Oasis confidential storage with ACL access controls.
								Authorize reveal access when ready to trigger verification.
							</div>

							<div className="mt-4 p-3 bg-[rgba(124,58,237,0.08)] text-[var(--color-secondary)] text-sm font-mono">
								Use the footer action next to [ PREVIOUS ] to reveal.
							</div>
						</div>
					)}

					{state.phase === "queued" && (
						<div className="p-6 border border-[var(--color-primary)] bg-[rgba(124,58,237,0.05)] mb-4">
							<div className="flex items-center gap-2">
								<CheckIcon /> AUTO_REVEAL_QUEUED
							</div>

							<div className="text-sm text-[var(--color-text)] mb-3">
								Access authorization is queued. Relayer can execute reveal after
								commit deadline.
							</div>

							{state.revealTxHash && (
								<div className="text-sm mb-3 break-all">
									<span className="text-[var(--color-text-dim)]">
										Queue TX:{" "}
									</span>
									<code className="text-[var(--color-secondary)] text-xs">
										{state.revealTxHash}
									</code>
								</div>
							)}

							<div className="mt-4 p-3 bg-[rgba(124,58,237,0.08)] text-[var(--color-secondary)] text-sm font-mono">
								Use the footer action next to [ PREVIOUS ] to reveal now.
							</div>
						</div>
					)}

					{state.phase === "revealing" && (
						<Spinner>Submitting access authorization...</Spinner>
					)}

					{state.phase === "revealed" && (
						<div className="p-6 border border-[var(--color-primary)] bg-[rgba(124,58,237,0.1)] mb-4">
							<div className="flex items-center gap-2">
								<CheckIcon /> POC_REVEALED
							</div>

							<div className="text-sm text-[var(--color-text)] mb-4">
								CRE verification is now in progress. The network will:
							</div>

							<ol className="m-0 pl-6 text-[var(--color-text-dim)] text-sm leading-relaxed">
								<li>Resolve your ACL-protected PoC from Oasis storage</li>
								<li>Create Tenderly fork at specified block</li>
								<li>Execute the exploit in sandbox</li>
								<li>Measure impact and classify severity</li>
								<li>Auto-release bounty if valid</li>
							</ol>

							<div className="mt-4 p-3 bg-[var(--color-secondary)] text-[var(--color-bg)] text-center font-mono text-sm">
								<a
									href={`/submission/${state.submissionId}`}
									className="text-[var(--color-bg)] no-underline"
								>
									VIEW VERIFICATION STATUS →
								</a>
							</div>
						</div>
					)}
				</div>
			);
		};

		const renderFooterPrimaryAction = () => {
			const { state, commit, reveal } = commitReveal;
			const missingProjectContext = projectId === null;
			const canCommit = isConnected && !missingProjectContext;
			const revealAvailable = Boolean(state.submissionId && state.salt);
			const onRetry = revealAvailable ? reveal : commit;

			if (state.phase === "idle") {
				return (
					<Button
						type="button"
						onClick={canCommit ? commit : undefined}
						disabled={!canCommit}
						className="font-mono"
					>
						[ COMMIT_POC_REFERENCE ]
					</Button>
				);
			}

			if (state.phase === "committed") {
				return (
					<Button type="button" onClick={reveal} className="font-mono">
						[ REVEAL_POC ]
					</Button>
				);
			}

			if (state.phase === "queued") {
				return (
					<Button type="button" onClick={reveal} variant="outline" className="font-mono">
						[ REVEAL_NOW ]
					</Button>
				);
			}

			if (state.phase === "failed") {
				return (
					<Button type="button" onClick={onRetry} variant="outline" className="font-mono">
						[ RETRY ]
					</Button>
				);
			}

			if (state.phase === "revealed") {
				return (
					<a
						href={`/submission/${state.submissionId}`}
						className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-mono text-primary-foreground no-underline"
					>
						[ VIEW_VERIFICATION_STATUS ]
					</a>
				);
			}

			return (
				<Button type="button" disabled className="font-mono">
					[ PROCESSING... ]
				</Button>
			);
		};

		return (
			<div className="step-content">
				<StepGuidance {...STEP_GUIDES.review} />

				{renderV2Flow()}

				<Card className="bg-card/50 border-primary/20">
					<CardHeader className="flex flex-row items-center justify-between py-3">
						<CardTitle className="text-sm font-mono text-secondary">
							GENERATED_POC.JSON
						</CardTitle>
						<span className="text-xs text-muted-foreground font-mono">
							{pocJson.length} bytes
						</span>
					</CardHeader>
					<CardContent className="pt-0 pb-3">
						<pre className="bg-neutral-900/80 p-3 border border-primary/20 rounded-md overflow-auto text-xs font-mono text-primary max-h-[240px]">
							{pocJson}
						</pre>
					</CardContent>
				</Card>

				{showBackButton ? (
					<div
						data-testid="review-action-row"
						className="mt-4 flex items-center justify-between gap-4 border-t border-[var(--color-bg-light)] pt-4"
					>
						<Button variant="outline" onClick={onBack} className="font-mono">
							[ PREVIOUS ]
						</Button>
						{renderFooterPrimaryAction()}
					</div>
				) : null}
			</div>
		);
	},
);

ReviewStep.displayName = "ReviewStep";
