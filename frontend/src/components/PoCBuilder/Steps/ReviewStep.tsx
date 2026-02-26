import React, { useEffect, useRef, useState } from "react";
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
		isSubmitting,
		submissionHash,
		error,
		onConnect,
		onSubmit,
		onBack,
		projectId,
		useV2 = true,
		showBackButton = true,
	}) => {
		const commitReveal = useCommitReveal(projectId, pocJson);
		const phase = commitReveal.state.phase;
		const phaseError = commitReveal.state.error;
		const [showV1Fallback, setShowV1Fallback] = useState(false);
		const { success, error: toastError } = useToast();
		const notifiedPhaseRef = useRef(phase);
		const notifiedErrorRef = useRef<string | undefined>(undefined);

		useEffect(() => {
			if (phase !== notifiedPhaseRef.current) {
				if (phase === "committed") {
					success({
						title: "PoC Committed",
						description: "Your encrypted PoC has been submitted successfully.",
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

		useEffect(() => {
			if (submissionHash && !useV2) {
				success({
					title: "PoC Transmitted (V1)",
					description: "Transaction submitted successfully.",
				});
			}
		}, [submissionHash, useV2, success]);

		useEffect(() => {
			if (error && !useV2) {
				toastError({
					title: "Submission Error",
					description: error,
				});
			}
		}, [error, useV2, toastError]);

		const renderV2Flow = () => {
			const { state, commit, reveal, reset } = commitReveal;
			const projectContextMissing = projectId === null;
			const revealAvailable = Boolean(state.submissionId && state.salt);
			const retryLabel = revealAvailable
				? "[ RETRY_REVEAL ]"
				: "[ RETRY_COMMIT ]";
			const onRetry = revealAvailable ? reveal : commit;
			const commitActive = state.phase !== "idle";
			const revealActive =
				["queued", "revealing", "revealed"].includes(state.phase) ||
				(state.phase === "failed" && revealAvailable);
			const verifyingActive = state.phase === "revealed";

			return (
				<div className="mt-6">
					<div className="border border-[var(--color-text-dim)] p-4 mb-4 bg-neutral-900/80">
						<div className="flex items-center gap-4">
							<span
								className={
									commitActive
										? "text-[var(--color-primary)] font-bold"
										: "text-[var(--color-text)] font-normal"
								}
							>
								1. COMMIT
							</span>
							<span className="text-[var(--color-text-dim)]">→</span>
							<span
								className={
									revealActive
										? "text-[var(--color-primary)] font-bold"
										: "text-[var(--color-text)] font-normal"
								}
							>
								2. REVEAL
							</span>
							<span className="text-[var(--color-text-dim)]">→</span>
							<span
								className={
									verifyingActive
										? "text-[var(--color-primary)] font-bold"
										: "text-[var(--color-text-dim)] font-normal"
								}
							>
								3. VERIFYING
							</span>
						</div>
					</div>

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
							) : projectContextMissing ? (
								<div className="border border-[var(--color-error)] bg-[rgba(255,0,0,0.05)] text-[var(--color-error)] px-4 py-3 font-mono text-xs">
									SELECT A PROJECT FIRST (open Explorer or Project Detail, then
									enter Builder from that context).
								</div>
							) : (
								<>
									<button
										type="button"
										onClick={commit}
										className="px-8 py-3 bg-[var(--color-primary)] text-[var(--color-bg)] border-none cursor-pointer font-mono"
									>
										[ 1. COMMIT_ENCRYPTED_POC ]
									</button>
									<button
										type="button"
										onClick={() => setShowV1Fallback(true)}
										className="px-6 py-3 bg-transparent text-[var(--color-text-dim)] border border-[var(--color-text-dim)] cursor-pointer font-mono text-sm"
									>
										USE V1 (LEGACY)
									</button>
								</>
							)}
						</div>
					)}

					{state.phase === "encrypting" && (
						<Spinner>Encrypting PoC JSON...</Spinner>
					)}

					{state.phase === "committing" && (
						<Spinner>Committing encrypted PoC to blockchain...</Spinner>
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
								Your PoC is encrypted and stored via Oasis confidential storage.
								Reveal when ready to trigger verification.
							</div>

							<button
								type="button"
								onClick={reveal}
								className="mt-4 px-8 py-3 bg-[var(--color-secondary)] text-[var(--color-bg)] border-none cursor-pointer font-mono"
							>
								[ 2. REVEAL_POC ]
							</button>
						</div>
					)}

					{state.phase === "queued" && (
						<div className="p-6 border border-[var(--color-primary)] bg-[rgba(124,58,237,0.05)] mb-4">
							<div className="flex items-center gap-2">
								<CheckIcon /> AUTO_REVEAL_QUEUED
							</div>

							<div className="text-sm text-[var(--color-text)] mb-3">
								Reveal authorization is queued. Relayer can execute reveal after
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

							<button
								type="button"
								onClick={reveal}
								className="mt-4 px-8 py-3 bg-transparent text-[var(--color-secondary)] border border-[var(--color-secondary)] cursor-pointer font-mono"
							>
								[ REVEAL_NOW ]
							</button>
						</div>
					)}

					{state.phase === "revealing" && (
						<Spinner>Submitting reveal authorization...</Spinner>
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
								<li>Resolve your encrypted PoC from Oasis storage</li>
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

		const renderV1Flow = () => (
			<>
				{error && (
					<div className="text-[var(--color-error)] border border-[var(--color-error)] p-4 mb-4 bg-[rgba(255,0,0,0.05)]">
						<div className="font-mono mb-2">ERROR:</div>
						<div className="text-sm">{error}</div>
					</div>
				)}

				{submissionHash && (
					<div className="mb-4 p-4 border border-[var(--color-primary)] bg-[rgba(124,58,237,0.1)]">
						<div className="text-[var(--color-primary)] font-bold font-mono mb-2">
							✓ PoC_TRANSMITTED (V1)
						</div>
						<div className="text-sm text-[var(--color-text-dim)] mb-3">
							Transaction Hash:
						</div>
						<code className="block">{submissionHash}</code>
					</div>
				)}

				<div className="flex gap-4 flex-wrap">
					{!isConnected ? (
						<button
							type="button"
							onClick={onConnect}
							className="px-8 py-3 bg-[var(--color-secondary)] text-[var(--color-bg)] border-none cursor-pointer font-mono"
						>
							[ CONNECT_WALLET ]
						</button>
					) : (
						<button
							type="button"
							onClick={onSubmit}
							disabled={isSubmitting}
							className={`px-8 py-3 text-[var(--color-bg)] border-none font-mono ${isSubmitting ? "bg-[var(--color-text-dim)] cursor-not-allowed opacity-70" : "bg-[var(--color-primary)] cursor-pointer"}`}
						>
							{isSubmitting ? (
								<span className="flex items-center gap-2 justify-center">
									<span className="spinner"></span> TRANSMITTING...
								</span>
							) : (
								"[ SUBMIT_POC (V1) ]"
							)}
						</button>
					)}
					<button
						type="button"
						onClick={() => setShowV1Fallback(false)}
						className="px-6 py-3 bg-transparent text-[var(--color-text-dim)] border border-[var(--color-text-dim)] cursor-pointer font-mono text-sm"
					>
						BACK TO V2
					</button>
				</div>
			</>
		);

		return (
			<div className="step-content">
				<StepGuidance {...STEP_GUIDES.review} />

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

				{useV2 && !showV1Fallback ? renderV2Flow() : renderV1Flow()}

				{showBackButton ? (
					<div className="mt-4">
						<Button variant="outline" onClick={onBack} className="font-mono">
							&lt;&lt; BACK
						</Button>
					</div>
				) : null}
			</div>
		);
	},
);

ReviewStep.displayName = "ReviewStep";
