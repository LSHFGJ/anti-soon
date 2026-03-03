import React, { useEffect, useMemo, useRef } from "react";
import { useBeforeUnload, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { setCommitRevealFlowGuardActive } from "@/lib/commitRevealRecovery";
import { useCommitReveal } from "../../../hooks/useCommitReveal";
import { STEP_GUIDES, StepGuidance } from "../../StepGuidance";

interface ReviewStepProps {
	pocJson: string;
	isConnected: boolean;
	isActive?: boolean;
	isSubmitting: boolean;
	submissionHash: string;
	error: string | null;
	onConnect: () => void;
	onSubmit: () => void;
	onBack: () => void;
	onLoadExample?: () => void;
	onRetryProjectContext?: () => void;
	projectId: bigint | null;
	useV2?: boolean;
	showBackButton?: boolean;
}

export const ReviewStep: React.FC<ReviewStepProps> = React.memo(
	({
		pocJson,
		isConnected,
		isActive = true,
		onConnect,
		onBack,
		onLoadExample,
		onRetryProjectContext,
		projectId,
		showBackButton = true,
	}) => {
		const commitReveal = useCommitReveal(projectId, pocJson);
		const phase = commitReveal.state.phase;
		const phaseError = commitReveal.state.error;
		const hydratedFromRecovery =
			commitReveal.state.hydratedFromRecovery === true;
		const navigate = useNavigate();
		const hasFlowContext = Boolean(
			commitReveal.state.salt ||
				commitReveal.state.cipherURI ||
				commitReveal.state.commitHash ||
				commitReveal.state.oasisTxHash ||
				commitReveal.state.submissionId,
		);
		const shouldWarnOnLeave = useMemo(() => {
			if (!isActive) {
				return false;
			}

			switch (phase) {
				case "encrypting":
				case "committing":
				case "committed":
				case "revealing":
					return true;
				case "failed":
					return hasFlowContext && !hydratedFromRecovery;
				default:
					return false;
			}
		}, [hasFlowContext, hydratedFromRecovery, isActive, phase]);
		const allowOneNavigationRef = useRef(false);
		const {
			success,
			error: toastError,
			warning: toastWarning,
			info: toastInfo,
		} = useToast();
		const notifiedPhaseRef = useRef(phase);
		const notifiedErrorRef = useRef<string | undefined>(undefined);

		useBeforeUnload(
			(event) => {
				if (!shouldWarnOnLeave) {
					return;
				}

				toastWarning({
					title: "SUBMISSION_IN_PROGRESS",
					description:
						"Commit/reveal flow is in progress. Refreshing now may interrupt the submission process.",
				});

				event.preventDefault();
				event.returnValue = "";
			},
			{ capture: true },
		);

		useEffect(() => {
			setCommitRevealFlowGuardActive(shouldWarnOnLeave);

			return () => {
				setCommitRevealFlowGuardActive(false);
			};
		}, [shouldWarnOnLeave]);

		useEffect(() => {
			if (!shouldWarnOnLeave) {
				allowOneNavigationRef.current = false;
				return;
			}

			const handleDocumentNavigationAttempt = (event: MouseEvent) => {
				if (
					allowOneNavigationRef.current ||
					event.defaultPrevented ||
					event.button !== 0 ||
					event.metaKey ||
					event.ctrlKey ||
					event.shiftKey ||
					event.altKey
				) {
					return;
				}

				const target = event.target;
				if (!(target instanceof Element)) {
					return;
				}

				const anchor = target.closest("a[href]") as HTMLAnchorElement | null;
				if (!anchor) {
					return;
				}

				const targetAttr = anchor.getAttribute("target");
				if (targetAttr && targetAttr !== "_self") {
					return;
				}

				const href = anchor.getAttribute("href");
				if (
					!href ||
					href.startsWith("#") ||
					href.startsWith("mailto:") ||
					href.startsWith("tel:")
				) {
					return;
				}

				const currentUrl = new URL(window.location.href);
				const destinationUrl = new URL(anchor.href, currentUrl.href);

				if (destinationUrl.origin !== currentUrl.origin) {
					return;
				}

				const currentRoute = `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`;
				const destinationRoute = `${destinationUrl.pathname}${destinationUrl.search}${destinationUrl.hash}`;
				if (destinationRoute === currentRoute) {
					return;
				}

				event.preventDefault();
				toastWarning({
					title: "SUBMISSION_IN_PROGRESS",
					description:
						"Commit/reveal flow is in progress. Leaving now may interrupt submission; confirm in browser dialog if you still want to leave.",
				});

				const shouldLeave = window.confirm(
					"A PoC submission flow is in progress. Leaving this page may interrupt commit/reveal. Continue leaving?",
				);

				if (!shouldLeave) {
					return;
				}

				allowOneNavigationRef.current = true;
				navigate(destinationRoute);
				setTimeout(() => {
					allowOneNavigationRef.current = false;
				}, 0);
			};

			document.addEventListener("click", handleDocumentNavigationAttempt, true);
			return () => {
				document.removeEventListener(
					"click",
					handleDocumentNavigationAttempt,
					true,
				);
			};
		}, [navigate, shouldWarnOnLeave, toastWarning]);

		useEffect(() => {
			if (!shouldWarnOnLeave) {
				return;
			}

			const handlePopState = () => {
				toastWarning({
					title: "SUBMISSION_IN_PROGRESS",
					description:
						"Commit/reveal flow is in progress. Use the browser dialog to confirm whether to leave this page.",
				});

				const shouldLeave = window.confirm(
					"A PoC submission flow is in progress. Leaving this page may interrupt commit/reveal. Continue leaving?",
				);

				if (shouldLeave) {
					return;
				}

				window.history.forward();
			};

			window.addEventListener("popstate", handlePopState);
			return () => {
				window.removeEventListener("popstate", handlePopState);
			};
		}, [shouldWarnOnLeave, toastWarning]);

		useEffect(() => {
			if (!isActive) {
				return;
			}

			if (phase !== notifiedPhaseRef.current) {
				if (phase === "committed" && !hydratedFromRecovery) {
					success({
						title: "PoC Committed",
						description: "Your PoC reference has been submitted successfully.",
					});
				} else if (phase === "revealed" && !hydratedFromRecovery) {
					success({
						title: "PoC Revealed",
						description: "Verification is now in progress.",
					});
				} else if (phase === "failed" && phaseError && !hydratedFromRecovery) {
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
				!hydratedFromRecovery &&
				phaseError !== notifiedErrorRef.current
			) {
				toastError({
					title: "Transaction Failed",
					description: phaseError,
				});
				notifiedErrorRef.current = phaseError;
			}
		}, [isActive, phase, phaseError, hydratedFromRecovery, success, toastError]);

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
						onRetryProjectContext?.();
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
						description:
							"Submission flow has been reset. You can commit again.",
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
					<Button
						asChild
						type="button"
						className="font-mono btn-cyber justify-self-end"
					>
						<a href={`/submission/${state.submissionId}`}>
							[ VIEW_VERIFICATION_STATUS ]
						</a>
					</Button>
				);
			}

			return (
				<Button
					type="button"
					onClick={() => {
						toastInfo({
							title: "TRANSACTION_IN_PROGRESS",
							description:
								"Current transaction is processing. Please wait for completion.",
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
						) : (
							<div />
						)}
						{renderFooterPrimaryAction()}
					</div>
				) : null}
			</div>
		);
	},
);

ReviewStep.displayName = "ReviewStep";
