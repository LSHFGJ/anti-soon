import {
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import React from "react";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReviewStep } from "../components/PoCBuilder/Steps/ReviewStep";

const mockUsePoCSubmission = vi.fn();
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
const mockToastWarning = vi.fn();
const mockToastInfo = vi.fn();

vi.mock("../hooks/usePoCSubmission", () => ({
	usePoCSubmission: (...args: unknown[]) => mockUsePoCSubmission(...args),
}));

vi.mock("@/hooks/use-toast", () => ({
	useToast: () => ({
		success: (...args: unknown[]) => mockToastSuccess(...args),
		error: (...args: unknown[]) => mockToastError(...args),
		warning: (...args: unknown[]) => mockToastWarning(...args),
		info: (...args: unknown[]) => mockToastInfo(...args),
	}),
}));

const baseSubmission = {
	state: { phase: "idle" as const },
	submitPoC: vi.fn(),
	reset: vi.fn(),
};

const baseProps: React.ComponentProps<typeof ReviewStep> = {
	pocJson: '{"target":"0x123"}',
	isConnected: true,
	onConnect: vi.fn(),
	onBack: vi.fn(),
	projectId: 1n,
	useV2: true,
};

function renderReviewStep(overrides: Partial<typeof baseProps> = {}) {
	return render(
		React.createElement(
			MemoryRouter,
			undefined,
			React.createElement(ReviewStep, {
				...baseProps,
				...overrides,
			}),
		),
	);
}

function renderReviewStepWithLeaveLink(
	overrides: Partial<typeof baseProps> = {},
) {
	return render(
		React.createElement(
			MemoryRouter,
			{ initialEntries: ["/builder"] },
			React.createElement(
				Routes,
				undefined,
				React.createElement(Route, {
					path: "/builder",
					element: React.createElement(
						React.Fragment,
						undefined,
						React.createElement(Link, { to: "/explorer" }, "[ LEAVE ]"),
						React.createElement(ReviewStep, {
							...baseProps,
							...overrides,
						}),
					),
				}),
				React.createElement(Route, {
					path: "/explorer",
					element: React.createElement(
						"div",
						undefined,
						"Explorer destination",
					),
				}),
			),
		),
	);
}

describe("ReviewStep feedback reliability", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockUsePoCSubmission.mockReturnValue({
			...baseSubmission,
			state: { phase: "idle" },
		});
	});

	it("renders revealed-state verification action without inline messaging", () => {
		mockUsePoCSubmission.mockReturnValue({
			...baseSubmission,
			state: {
				phase: "revealed",
				submissionId: 9n,
				commitTxHash: "0xabc",
			},
		});

		renderReviewStep();

		expect(
			screen.getByRole("link", { name: "[ VIEW_VERIFICATION_STATUS ]" }),
		).toBeVisible();
		expect(
			screen.queryByText(/CRE verification is now in progress/i),
		).not.toBeInTheDocument();
	});

	it("emits success toasts only on phase transitions without duplicates", () => {
		let phaseState: Record<string, unknown> = {
			phase: "idle",
		};

		mockUsePoCSubmission.mockImplementation(() => ({
			...baseSubmission,
			state: phaseState,
		}));

		const view = renderReviewStep();
		expect(mockToastSuccess).toHaveBeenCalledTimes(0);

		phaseState = {
			phase: "committed",
			submissionId: 11n,
			commitTxHash: "0x01",
		};

		view.rerender(
			React.createElement(
				MemoryRouter,
				undefined,
				React.createElement(ReviewStep, {
					pocJson: '{"target":"0x123"}',
					isConnected: true,
					onConnect: vi.fn(),
					onBack: vi.fn(),
					projectId: 1n,
					useV2: true,
				}),
			),
		);

		expect(mockToastSuccess).toHaveBeenCalledTimes(1);
		expect(mockToastSuccess).toHaveBeenCalledWith(
			expect.objectContaining({ title: "PoC Committed" }),
		);

		expect(mockToastSuccess).toHaveBeenCalledTimes(1);

		phaseState = {
			phase: "revealed",
			submissionId: 11n,
			commitTxHash: "0x01",
			revealTxHash: "0x02",
		};

		view.rerender(
			React.createElement(
				MemoryRouter,
				undefined,
				React.createElement(ReviewStep, {
					pocJson: '{"target":"0x123"}',
					isConnected: true,
					onConnect: vi.fn(),
					onBack: vi.fn(),
					projectId: 1n,
					useV2: true,
				}),
			),
		);

		expect(mockToastSuccess).toHaveBeenCalledTimes(2);
		expect(mockToastSuccess).toHaveBeenLastCalledWith(
			expect.objectContaining({ title: "PoC Revealed" }),
		);
	});

	it("suppresses success toasts for hydration-only recovered phases", () => {
		mockUsePoCSubmission.mockReturnValue({
			...baseSubmission,
			state: {
				phase: "committed",
				hydratedFromRecovery: true,
				submissionId: 11n,
			},
		});

		renderReviewStep();

		expect(mockToastSuccess).not.toHaveBeenCalled();
		expect(
			screen.getByRole("button", { name: "[ REVEAL_POC ]" }),
		).toBeVisible();
	});

	it("suppresses failure toasts for hydration-only recovered failures", () => {
		mockUsePoCSubmission.mockReturnValue({
			...baseSubmission,
			state: {
				phase: "failed",
				hydratedFromRecovery: true,
				error: "Recovered context is stale",
				submissionId: 11n,
			},
		});

		renderReviewStep();

		expect(mockToastError).not.toHaveBeenCalled();
		expect(screen.getByRole("button", { name: "[ RETRY ]" })).toBeVisible();
	});

	it("keeps failed-state retry and reset actions clickable without inline error banners", () => {
		const submitPoC = vi.fn();
		const reset = vi.fn();

		mockUsePoCSubmission.mockReturnValue({
			...baseSubmission,
			submitPoC,
			reset,
			state: {
				phase: "failed",
				error: "Reveal failed: rpc timeout",
				submissionId: 12n,
				salt: "0x1234",
			},
		});

		renderReviewStep();

		expect(screen.queryByText("ERROR:")).not.toBeInTheDocument();
		expect(
			screen.queryByText(/Reveal failed: rpc timeout/i),
		).not.toBeInTheDocument();
		expect(mockToastError).toHaveBeenCalledWith(
			expect.objectContaining({
				title: "Transaction Failed",
				description: "Reveal failed: rpc timeout",
			}),
		);

		fireEvent.click(screen.getByRole("button", { name: "[ RETRY ]" }));
		expect(submitPoC).toHaveBeenCalledTimes(1);

		fireEvent.click(screen.getByRole("button", { name: "[ RESET ]" }));
		expect(reset).toHaveBeenCalledTimes(1);
	});

	it("shows actionable project-context CTAs when project is missing", () => {
		renderReviewStep({ projectId: null });

		const commitButton = screen.getByRole("button", { name: "[ COMMIT ]" });
		expect(commitButton).toBeEnabled();
		fireEvent.click(commitButton);

		expect(mockToastWarning).toHaveBeenCalledWith(
			expect.objectContaining({
				title: "PROJECT_CONTEXT_REQUIRED",
				action: expect.objectContaining({ label: "[ OPEN_EXPLORER ]" }),
				cancel: expect.objectContaining({ label: "[ RETRY_CONTEXT ]" }),
			}),
		);
	});

	it("uses retry_context action callback without forcing page refresh", () => {
		const onRetryProjectContext = vi.fn();

		renderReviewStep({ projectId: null, onRetryProjectContext });

		fireEvent.click(screen.getByRole("button", { name: "[ COMMIT ]" }));

		const warningPayload = mockToastWarning.mock.calls.at(-1)?.[0] as
			| { cancel?: { onClick?: () => void } }
			| undefined;

		warningPayload?.cancel?.onClick?.();

		expect(onRetryProjectContext).toHaveBeenCalledTimes(1);
	});

	it("shows commit CTA when wallet is connected and project context exists", () => {
		renderReviewStep({ isConnected: true, projectId: 1n });

		expect(screen.getByRole("button", { name: "[ COMMIT ]" })).toBeVisible();
	});

	it("keeps commit CTA clickable before wallet connect and prompts connect on click", () => {
		const onConnect = vi.fn();
		renderReviewStep({ isConnected: false, projectId: 1n, onConnect });

		expect(
			screen.queryByRole("button", { name: "[ CONNECT_WALLET ]" }),
		).not.toBeInTheDocument();

		const commitButton = screen.getByRole("button", { name: "[ COMMIT ]" });
		expect(commitButton).toBeEnabled();
		fireEvent.click(commitButton);
		expect(onConnect).toHaveBeenCalledTimes(1);
	});

	it("renders primary action on the same row as previous in review footer", () => {
		renderReviewStep({ isConnected: true, projectId: 1n });

		const actionRow = screen.getByTestId("review-action-row");
		expect(
			within(actionRow).getByRole("button", { name: "[ PREVIOUS ]" }),
		).toBeVisible();
		expect(
			within(actionRow).getByRole("button", { name: "[ COMMIT ]" }),
		).toBeVisible();
	});

	it("shows toast and native browser warning when refreshing during submission flow", () => {
		mockUsePoCSubmission.mockReturnValue({
			...baseSubmission,
			state: {
				phase: "committing",
				salt: `0x${"1".repeat(64)}`,
				cipherURI:
					"oasis://oasis-sapphire-testnet/0x000000000000000000000000000000000000dead/slot#0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
				commitHash: `0x${"2".repeat(64)}`,
				oasisTxHash: `0x${"3".repeat(64)}`,
			},
		});

		renderReviewStep();

		const beforeUnloadEvent = new Event("beforeunload", {
			cancelable: true,
		}) as BeforeUnloadEvent;
		Object.defineProperty(beforeUnloadEvent, "returnValue", {
			configurable: true,
			writable: true,
			value: undefined,
		});

		window.dispatchEvent(beforeUnloadEvent);

		expect(beforeUnloadEvent.defaultPrevented).toBe(true);
		expect(beforeUnloadEvent.returnValue).toBe("");
		expect(mockToastWarning).toHaveBeenCalledWith(
			expect.objectContaining({ title: "SUBMISSION_IN_PROGRESS" }),
		);
	});

	it("does not arm leave guards while review step is hidden", () => {
		mockUsePoCSubmission.mockReturnValue({
			...baseSubmission,
			state: {
				phase: "committing",
				salt: `0x${"7".repeat(64)}`,
				cipherURI:
					"oasis://oasis-sapphire-testnet/0x000000000000000000000000000000000000dead/slot#0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
				commitHash: `0x${"8".repeat(64)}`,
				oasisTxHash: `0x${"9".repeat(64)}`,
			},
		});

		renderReviewStep({ isActive: false });

		const beforeUnloadEvent = new Event("beforeunload", {
			cancelable: true,
		}) as BeforeUnloadEvent;
		Object.defineProperty(beforeUnloadEvent, "returnValue", {
			configurable: true,
			writable: true,
			value: undefined,
		});

		window.dispatchEvent(beforeUnloadEvent);

		expect(beforeUnloadEvent.defaultPrevented).toBe(false);
		expect(mockToastWarning).not.toHaveBeenCalled();
	});

	it("shows toast and native confirm when attempting to leave route mid-flow", async () => {
		const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
		mockUsePoCSubmission.mockReturnValue({
			...baseSubmission,
			state: {
				phase: "committing",
				salt: `0x${"4".repeat(64)}`,
				cipherURI:
					"oasis://oasis-sapphire-testnet/0x000000000000000000000000000000000000dead/slot#0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
				commitHash: `0x${"5".repeat(64)}`,
				oasisTxHash: `0x${"6".repeat(64)}`,
			},
		});

		renderReviewStepWithLeaveLink();
		fireEvent.click(screen.getByRole("link", { name: "[ LEAVE ]" }));

		await waitFor(() => {
			expect(confirmSpy).toHaveBeenCalledTimes(1);
		});

		expect(mockToastWarning).toHaveBeenCalledWith(
			expect.objectContaining({ title: "SUBMISSION_IN_PROGRESS" }),
		);
		expect(screen.queryByText("Explorer destination")).not.toBeInTheDocument();

		confirmSpy.mockRestore();
	});
});
