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
	onLoadExample?: () => void;
	projectId: bigint | null;
	useV2?: boolean;
	showBackButton?: boolean;
}

export const ReviewStep: React.FC<ReviewStepProps> = React.memo(
	({
		pocJson,
		isConnected,
		onConnect,
		onBack,
		onLoadExample,
		projectId,
		showBackButton = true,
	}) => {
		const commitReveal = useCommitReveal(projectId, pocJson);
		const phase = commitReveal.state.phase;
		const phaseError = commitReveal.state.error;
		const {
			success,
			error: toastError,
			warning: toastWarning,
			info: toastInfo,
		} = useToast();
		const notifiedPhaseRef = useRef(phase);
		const notifiedErrorRef = useRef<string | undefined>(undefined);

		useEffect(() => {
			if (phase !== notifiedPhaseRef.current) {
				if (phase === "committed") {
					success({
						title: "PoC Committed",
						description: "Your PoC reference has been submitted successfully.",
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

		const showProjectContextToast = () => {
			toastWarning({
				title: "PROJECT_CONTEXT_REQUIRED",
				description:
					"No active project is selected, so commit cannot be submitted.",
				action: {
					label: "[ OPEN_EXPLORER ]",
					onClick: () => {
						window.location.assign("/explorer");
					},
				},
				cancel: {
					label: "[ RETRY_CONTEXT ]",
					onClick: () => {
						window.location.assign("/builder");
					},
				},
				duration: 6000,
			});
		};

		const renderFooterPrimaryAction = () => {
			const { state, commit, reveal, reset } = commitReveal;
			const missingProjectContext = projectId === null;
			const canCommit = isConnected && !missingProjectContext;
			const revealAvailable = Boolean(state.submissionId && state.salt);
			const onRetry = revealAvailable ? reveal : commit;
			const handleCommitClick = () => {
				if (canCommit) {
					commit();
					return;
				}

				if (!isConnected) {
					onConnect();
					toastWarning({
						title: "WALLET_CONNECTION_REQUIRED",
						description: "Connect your wallet to continue the commit flow.",
					});
					return;
				}

				showProjectContextToast();
			};

			if (state.phase === "idle") {
				return (
					<Button
						type="button"
						onClick={handleCommitClick}
						className="font-mono btn-cyber justify-self-end"
					>
						[ COMMIT ]
					</Button>
				);
			}

			if (state.phase === "committed") {
				const handleRevealClick = () => {
					if (!isConnected) {
						onConnect();
						toastWarning({
							title: "WALLET_CONNECTION_REQUIRED",
							description: "Reconnect wallet before revealing your PoC.",
						});
						return;
					}

					reveal();
				};

				return (
					<Button
						type="button"
						onClick={handleRevealClick}
						className="font-mono btn-cyber justify-self-end"
					>
						[ REVEAL_POC ]
					</Button>
				);
			}

			if (state.phase === "failed") {
				const handleRetryClick = () => {
					if (!isConnected) {
						onConnect();
						toastWarning({
							title: "WALLET_CONNECTION_REQUIRED",
							description: "Connect your wallet to retry this transaction.",
						});
						return;
					}

					if (!revealAvailable && missingProjectContext) {
						showProjectContextToast();
						return;
					}

					onRetry();
				};

				const handleResetClick = () => {
					reset();
					toastInfo({
						title: "FLOW_RESET",
						description: "Submission flow has been reset. You can commit again.",
					});
				};

				return (
					<div className="justify-self-end flex gap-2">
						<Button
							type="button"
							onClick={handleResetClick}
							variant="outline"
							className="font-mono btn-cyber"
						>
							[ RESET ]
						</Button>
						<Button
							type="button"
							onClick={handleRetryClick}
							variant="outline"
							className="font-mono btn-cyber"
						>
							[ RETRY ]
						</Button>
					</div>
				);
			}

			if (state.phase === "revealed") {
				return (
					<Button asChild type="button" className="font-mono btn-cyber justify-self-end">
						<a href={`/submission/${state.submissionId}`}>[ VIEW_VERIFICATION_STATUS ]</a>
					</Button>
				);
			}

			return (
				<Button
					type="button"
					onClick={() => {
						toastInfo({
							title: "TRANSACTION_IN_PROGRESS",
							description: "Current transaction is processing. Please wait for completion.",
						});
					}}
					className="font-mono btn-cyber justify-self-end"
				>
					[ PROCESSING... ]
				</Button>
			);
		};

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

				{showBackButton ? (
					<div
						data-testid="review-action-row"
						className="mt-4 grid shrink-0 grid-cols-3 gap-3 border-t border-[var(--color-bg-light)] pt-4"
					>
						<Button
							variant="outline"
							onClick={onBack}
							className="font-mono btn-cyber justify-self-start"
						>
							[ PREVIOUS ]
						</Button>
						{onLoadExample ? (
							<Button
								type="button"
								variant="outline"
								onClick={onLoadExample}
								className="font-mono btn-cyber justify-self-center"
							>
								[ LOAD_EXAMPLE_POC ]
							</Button>
						) : <div />}
						{renderFooterPrimaryAction()}
					</div>
				) : null}
			</div>
		);
	},
);

ReviewStep.displayName = "ReviewStep";
