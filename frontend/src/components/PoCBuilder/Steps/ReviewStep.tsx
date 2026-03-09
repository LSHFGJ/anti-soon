import React, { useEffect, useMemo, useRef } from "react";
import { useBeforeUnload, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { setCommitRevealFlowGuardActive } from "@/lib/commitRevealRecovery";
import { usePoCSubmission } from "../../../hooks/usePoCSubmission";
import { StepGuidance } from "../../StepGuidance";
import { STEP_GUIDES } from "../../StepGuidance/guides";

	interface ReviewStepProps {
		pocJson: string;
		isConnected: boolean;
		isWrongNetwork?: boolean;
		isActive?: boolean;
		onConnect: () => void;
		onSwitchNetwork?: () => void;
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
		isWrongNetwork = false,
		isActive = true,
		onConnect,
		onSwitchNetwork,
		onBack,
		onLoadExample,
		onRetryProjectContext,
		projectId,
		showBackButton = true,
	}) => {
		const submission = usePoCSubmission(projectId);
		const phase = submission.state.phase;
		const phaseError = submission.state.error;
		const hydratedFromRecovery =
			submission.state.hydratedFromRecovery === true;
		const navigate = useNavigate();
		const hasFlowContext = Boolean(
			submission.state.salt ||
				submission.state.cipherURI ||
				submission.state.commitHash ||
				submission.state.oasisTxHash ||
				submission.state.submissionId,
		);
		const shouldWarnOnLeave = useMemo(() => {
			if (!isActive) {
				return false;
			}

			switch (phase) {
				case "encrypting":
				case "committing":
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
						"Submission is in progress. Refreshing now may interrupt the commit transaction.",
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
						"Submission is in progress. Leaving now may interrupt the commit transaction; confirm if you still want to leave.",
				});

				const shouldLeave = window.confirm(
					"A PoC submission is still in progress. Continue leaving?",
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
						"Submission is in progress. Use the browser dialog to confirm whether to leave this page.",
				});

				const shouldLeave = window.confirm(
					"A PoC submission is still in progress. Continue leaving?",
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
				if (phase === "encrypting" && !hydratedFromRecovery) {
					toastInfo({
						title: "Encrypting PoC",
						description: "Preparing encrypted payload for commit.",
					});
				} else if (phase === "committing" && !hydratedFromRecovery) {
					toastInfo({
						title: "Submitting Commit",
						description: "Sapphire handoff complete. Confirm the Sepolia commit in your wallet.",
					});
				} else if (phase === "committed" && !hydratedFromRecovery) {
					success({
						title: "PoC Committed",
						description: "Your PoC reference has been submitted successfully.",
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
		}, [isActive, phase, phaseError, hydratedFromRecovery, success, toastError, toastInfo]);

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

		const showWrongNetworkToast = () => {
			toastWarning({
				title: "SEPOLIA_REQUIRED",
				description: "Switch to Sepolia to continue the commit flow.",
				duration: 4500,
			});
		};

		const renderFooterPrimaryAction = () => {
			const { state, submitPoC, reset } = submission;
			const missingProjectContext = projectId === null;
			const canCommit = isConnected && !isWrongNetwork && !missingProjectContext;
			const primaryActionLabel = isWrongNetwork
				? "[ SWITCH_TO_SEPOLIA ]"
				: "[ COMMIT ]";
			
			const handleActionClick = () => {
				if (canCommit) {
					void submitPoC(projectId, pocJson);
					return;
				}

				if (!isConnected) {
					onConnect();
					toastWarning({
						title: "WALLET_CONNECTION_REQUIRED",
						description: "Connect your wallet to continue the flow.",
					});
					return;
				}

				if (isWrongNetwork) {
					onSwitchNetwork?.();
					showWrongNetworkToast();
					return;
				}
				
				showProjectContextToast();
			};

			if (state.phase === "idle") {
				return (
					<Button
						type="button"
						onClick={handleActionClick}
						className="font-mono btn-cyber justify-self-end"
					>
						{primaryActionLabel}
					</Button>
				);
			}

			if (state.phase === "committed") {
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

			if (state.phase === "failed") {
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
							onClick={handleActionClick}
							variant="outline"
							className="font-mono btn-cyber"
						>
							[ RETRY ]
						</Button>
					</div>
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
