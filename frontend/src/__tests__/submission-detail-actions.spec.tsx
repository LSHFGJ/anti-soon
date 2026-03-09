import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import type { Address } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockProject } from "../test/utils";

const {
	mockUseWallet,
	mockReadContract,
	mockWaitForReceipt,
	mockReadProjectById,
	mockWriteContract,
	mockReadStoredPoCPreview,
	mockReadSubmissionCommitTxHash,
	mockResolveSapphireTxHash,
	mockClearPublicClientReadCache,
} = vi.hoisted(() => ({
	mockUseWallet: vi.fn(),
	mockReadContract: vi.fn(),
	mockWaitForReceipt: vi.fn(),
	mockReadProjectById: vi.fn(),
	mockWriteContract: vi.fn(),
	mockReadStoredPoCPreview: vi.fn(),
	mockReadSubmissionCommitTxHash: vi.fn(),
	mockResolveSapphireTxHash: vi.fn(),
	mockClearPublicClientReadCache: vi.fn(),
}));

vi.mock("../hooks/useWallet", () => ({
	useWallet: (...args: unknown[]) => mockUseWallet(...args),
}));

vi.mock("../lib/publicClient", () => ({
	clearPublicClientReadCache: (...args: unknown[]) =>
		mockClearPublicClientReadCache(...args),
	publicClient: {
		readContract: (...args: unknown[]) => mockReadContract(...args),
		waitForTransactionReceipt: (...args: unknown[]) =>
			mockWaitForReceipt(...args),
	},
	readContractWithRpcFallback: (...args: unknown[]) =>
		mockReadContract(...args),
}));

vi.mock("../lib/projectReads", () => ({
	readProjectById: (...args: unknown[]) => mockReadProjectById(...args),
}));

vi.mock("../lib/oasisUpload", async () => {
	const actual =
		await vi.importActual<typeof import("../lib/oasisUpload")>(
			"../lib/oasisUpload",
		);
	return {
		...actual,
		readStoredPoCPreview: (...args: unknown[]) =>
			mockReadStoredPoCPreview(...args),
		resolveSapphireTxHash: (...args: unknown[]) =>
			mockResolveSapphireTxHash(...args),
	};
});

vi.mock("../lib/submissionArtifacts", () => ({
	readSubmissionCommitTxHash: (...args: unknown[]) =>
		mockReadSubmissionCommitTxHash(...args),
}));

import { SubmissionDetail } from "../pages/SubmissionDetail";

const NOW_SECONDS = 1_900_000_000n;
const MIN_CHALLENGE_BOND_WEI = 10_000_000_000_000_000n;
const AUDITOR = "0x1111111111111111111111111111111111111111" as Address;
const NON_OWNER = "0x3333333333333333333333333333333333333333" as Address;
const OWNER = "0x2222222222222222222222222222222222222222" as Address;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;
const MOCK_TX_HASH =
	"0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as `0x${string}`;
const originalFetch = globalThis.fetch;
let dateNowSpy: ReturnType<typeof vi.spyOn>;

function makeSubmissionTuple(
	overrides: {
		status?: number;
		revealTimestamp?: bigint;
		disputeDeadline?: bigint;
		challenged?: boolean;
		challengeBond?: bigint;
		challenger?: Address;
		projectId?: bigint;
	} = {},
) {
	return [
		AUDITOR,
		overrides.projectId ?? 1n,
		"0x1111111111111111111111111111111111111111111111111111111111111111" as `0x${string}`,
		"oasis://mock/cipher",
		"0x0000000000000000000000000000000000000000000000000000000000000001" as `0x${string}`,
		NOW_SECONDS - 300n,
		overrides.revealTimestamp ?? NOW_SECONDS - 200n,
		overrides.status ?? 2,
		1_000_000_000_000_000n,
		3,
		2_000_000_000_000_000n,
		overrides.disputeDeadline ?? NOW_SECONDS + 600n,
		overrides.challenged ?? false,
		overrides.challenger ?? ZERO_ADDRESS,
		overrides.challengeBond ?? 0n,
	] as const;
}

function renderSubmissionDetail(path = "/submission/1") {
	render(
		<MemoryRouter initialEntries={[path]}>
			<Routes>
				<Route path="/submission/:id" element={<SubmissionDetail />} />
			</Routes>
		</MemoryRouter>,
	);
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});

	return { promise, resolve, reject };
}

function mockSubmissionReadOnly(
	submission: ReturnType<typeof makeSubmissionTuple>,
) {
	mockReadContract.mockImplementation(
		({ functionName }: { functionName?: string }) => {
			if (functionName === "submissions") return Promise.resolve(submission);
			if (functionName === "getSubmissionLifecycle")
				return Promise.resolve(null);
			if (functionName === "getSubmissionJuryMetadata")
				return Promise.resolve([false, "", ""]);
			if (functionName === "getSubmissionGroupingMetadata")
				return Promise.resolve([false, "", "", 0n, 0n]);
			return Promise.resolve(null);
		},
	);
}

function renderRoutableSubmissionDetail(path = "/submission/1") {
	return render(
		<MemoryRouter initialEntries={[path]}>
			<Link to="/submission/2">Go to submission 2</Link>
			<Routes>
				<Route path="/submission/:id" element={<SubmissionDetail />} />
			</Routes>
		</MemoryRouter>,
	);
}

describe("SubmissionDetail lifecycle action alignment", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockClearPublicClientReadCache.mockReset();
		dateNowSpy = vi
			.spyOn(Date, "now")
			.mockReturnValue(Number(NOW_SECONDS) * 1000);

		mockWriteContract.mockResolvedValue(MOCK_TX_HASH);
		mockWaitForReceipt.mockResolvedValue({ status: "success" });
		mockReadStoredPoCPreview.mockResolvedValue({
			poc: { step: "flashLoan()" },
			payloadJson: '{"poc":{"step":"flashLoan()"}}',
			source: "sapphire",
		});
		mockReadSubmissionCommitTxHash.mockResolvedValue(
			"0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
		);
		mockResolveSapphireTxHash.mockResolvedValue(
			"0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
		);
		mockReadProjectById.mockResolvedValue(
			createMockProject({
				id: 1n,
				owner: OWNER,
				maxPayoutPerBug: 5_000_000_000_000_000_000n,
			}),
		);
	});

	afterEach(() => {
		dateNowSpy.mockRestore();
		globalThis.fetch = originalFetch;
		vi.unstubAllEnvs();
	});

	it("disables automatic sepolia switching in submission detail wallet hook", async () => {
		mockUseWallet.mockReturnValue({
			address: NON_OWNER,
			walletClient: { writeContract: mockWriteContract },
			isConnected: true,
		});
		mockReadContract.mockImplementation((args) => {
			const functionName = args.functionName;
			if (functionName === "submissions")
				return Promise.resolve(makeSubmissionTuple());
			return Promise.resolve(null);
		});

		renderSubmissionDetail();

		await waitFor(() => {
			expect(mockUseWallet).toHaveBeenCalledWith({
				autoSwitchToSepolia: false,
			});
		});
	});

	it("shows finalize action for disputed submissions after dispute timeout", async () => {
		mockUseWallet.mockReturnValue({
			address: NON_OWNER,
			walletClient: { writeContract: mockWriteContract },
			isConnected: true,
		});
		mockSubmissionReadOnly(
			makeSubmissionTuple({
				status: 3,
				challenged: true,
				challengeBond: MIN_CHALLENGE_BOND_WEI,
				challenger: NON_OWNER,
				disputeDeadline: NOW_SECONDS - 1n,
			}),
		);

		renderSubmissionDetail();

		await waitFor(() => {
			expect(
				screen.getByRole("button", { name: "[ FINALIZE PAYOUT ]" }),
			).toBeVisible();
		});
		expect(
			screen.queryByText("> Awaiting resolution from project owner"),
		).toBeNull();
	});

	it("keeps challenge available at exact dispute deadline boundary", async () => {
		mockUseWallet.mockReturnValue({
			address: NON_OWNER,
			walletClient: { writeContract: mockWriteContract },
			isConnected: true,
		});
		mockSubmissionReadOnly(
			makeSubmissionTuple({
				status: 2,
				challenged: false,
				disputeDeadline: NOW_SECONDS,
			}),
		);

		renderSubmissionDetail();

		await waitFor(() => {
			expect(
				screen.getByRole("button", { name: "[ CHALLENGE RESULT ]" }),
			).toBeVisible();
		});
	});

	it("uses on-chain minimum challenge bond value when challenging", async () => {
		mockUseWallet.mockReturnValue({
			address: NON_OWNER,
			walletClient: { writeContract: mockWriteContract },
			isConnected: true,
		});
		mockSubmissionReadOnly(
			makeSubmissionTuple({
				status: 2,
				challenged: false,
				disputeDeadline: NOW_SECONDS + 10n,
			}),
		);

		renderSubmissionDetail();
		const user = userEvent.setup();

		const challengeButton = await screen.findByRole("button", {
			name: "[ CHALLENGE RESULT ]",
		});
		await user.click(challengeButton);

		await waitFor(() => {
			expect(mockWriteContract).toHaveBeenCalled();
		});

		expect(mockWriteContract).toHaveBeenCalledWith(
			expect.objectContaining({
				functionName: "challenge",
				value: MIN_CHALLENGE_BOND_WEI,
			}),
		);
	});

	it("keeps owner resolve actions available at exact dispute deadline boundary", async () => {
		mockUseWallet.mockReturnValue({
			address: OWNER,
			walletClient: { writeContract: mockWriteContract },
			isConnected: true,
		});
		mockSubmissionReadOnly(
			makeSubmissionTuple({
				status: 3,
				challenged: true,
				challengeBond: MIN_CHALLENGE_BOND_WEI,
				challenger: NON_OWNER,
				disputeDeadline: NOW_SECONDS,
			}),
		);

		renderSubmissionDetail();

		await waitFor(() => {
			expect(
				screen.getByRole("button", { name: "ACCEPT (Uphold)" }),
			).toBeVisible();
			expect(
				screen.getByRole("button", { name: "REJECT (Overturn)" }),
			).toBeVisible();
		});
	});

	it("ignores stale submission responses after route changes", async () => {
		const submissionOneDeferred =
			deferred<ReturnType<typeof makeSubmissionTuple>>();
		const projectOneDeferred = deferred<ReturnType<typeof createMockProject>>();

		mockUseWallet.mockReturnValue({
			address: NON_OWNER,
			walletClient: { writeContract: mockWriteContract },
			isConnected: true,
		});

		mockReadContract.mockImplementation(
			({ functionName, args }: { functionName?: string; args?: [bigint] }) => {
				if (functionName !== "submissions") return Promise.resolve(null);
				if (args?.[0] === 1n) {
					return submissionOneDeferred.promise;
				}

				return Promise.resolve(makeSubmissionTuple({ projectId: 2n }));
			},
		);

		mockReadProjectById.mockImplementation((projectId: bigint) => {
			if (projectId === 1n) {
				return projectOneDeferred.promise;
			}

			return Promise.resolve(createMockProject({ id: 2n, owner: OWNER }));
		});

		const user = userEvent.setup();
		renderRoutableSubmissionDetail("/submission/1");

		await user.click(screen.getByRole("link", { name: "Go to submission 2" }));

		await waitFor(() => {
			expect(screen.getByText("#2")).toBeVisible();
		});

		submissionOneDeferred.resolve(makeSubmissionTuple({ projectId: 1n }));
		projectOneDeferred.resolve(createMockProject({ id: 1n, owner: OWNER }));

		await waitFor(() => {
			expect(screen.getByText("#2")).toBeVisible();
			expect(screen.queryByText("#1")).toBeNull();
		});
	});

	it("ignores action-triggered refresh responses after route changes", async () => {
		const submissionOneRefreshDeferred =
			deferred<ReturnType<typeof makeSubmissionTuple>>();
		const submissionTwoDeferred =
			deferred<ReturnType<typeof makeSubmissionTuple>>();
		const refreshStarted = deferred<void>();
		let submissionOneReadCount = 0;

		mockUseWallet.mockReturnValue({
			address: NON_OWNER,
			walletClient: { writeContract: mockWriteContract },
			isConnected: true,
		});

		mockReadContract.mockImplementation(
			({ functionName, args }: { functionName?: string; args?: [bigint] }) => {
				if (functionName === "submissions") {
					if (args?.[0] === 1n) {
						submissionOneReadCount += 1;
						if (submissionOneReadCount === 1) {
							return Promise.resolve(
								makeSubmissionTuple({
									projectId: 1n,
									status: 2,
									challenged: false,
									disputeDeadline: NOW_SECONDS + 600n,
								}),
							);
						}

						refreshStarted.resolve(undefined);
						return submissionOneRefreshDeferred.promise;
					}

					if (args?.[0] === 2n) {
						return submissionTwoDeferred.promise;
					}
				}

				if (functionName === "getSubmissionLifecycle")
					return Promise.resolve(null);
				if (functionName === "getSubmissionJuryMetadata")
					return Promise.resolve([false, "", ""]);
				if (functionName === "getSubmissionGroupingMetadata")
					return Promise.resolve([false, "", "", 0n, 0n]);
				return Promise.resolve(null);
			},
		);

		mockReadProjectById.mockImplementation((projectId: bigint) =>
			Promise.resolve(createMockProject({ id: projectId, owner: OWNER })),
		);

		const user = userEvent.setup();
		renderRoutableSubmissionDetail("/submission/1");

		const challengeButton = await screen.findByRole("button", {
			name: "[ CHALLENGE RESULT ]",
		});
		await user.click(challengeButton);

		await refreshStarted.promise;
		await user.click(screen.getByRole("link", { name: "Go to submission 2" }));

		await waitFor(() => {
			expect(screen.getByText(/Loading submission data/i)).toBeVisible();
		});

		submissionOneRefreshDeferred.resolve(
			makeSubmissionTuple({
				projectId: 1n,
				status: 2,
				challenged: false,
				disputeDeadline: NOW_SECONDS + 600n,
			}),
		);

		await waitFor(() => {
			expect(screen.queryByText("#1")).toBeNull();
		});

		submissionTwoDeferred.resolve(
			makeSubmissionTuple({
				projectId: 2n,
				status: 2,
				challenged: false,
				disputeDeadline: NOW_SECONDS + 600n,
			}),
		);

		await waitFor(() => {
			expect(screen.getByText("#2")).toBeVisible();
			expect(screen.queryByText("#1")).toBeNull();
		});
	});

	it("ignores late metadata and artifact merges after route changes", async () => {
		const lifecycleOneDeferred = deferred<
			| readonly [
					number,
					bigint,
					bigint,
					number,
					number,
					`0x${string}`,
					`0x${string}`,
			  ]
			| null
		>();
		const juryOneDeferred = deferred<
			readonly [boolean, string, string] | null
		>();
		const groupingOneDeferred = deferred<
			readonly [boolean, string, string, bigint, bigint] | null
		>();
		const projectOneDeferred = deferred<ReturnType<typeof createMockProject>>();
		const commitOneDeferred = deferred<`0x${string}` | undefined>();
		const sapphireOneDeferred = deferred<`0x${string}` | undefined>();

		mockUseWallet.mockReturnValue({
			address: NON_OWNER,
			walletClient: { writeContract: mockWriteContract },
			isConnected: true,
		});

		mockReadContract.mockImplementation(
			({ functionName, args }: { functionName?: string; args?: [bigint] }) => {
				if (functionName === "submissions") {
					if (args?.[0] === 1n)
						return Promise.resolve(makeSubmissionTuple({ projectId: 1n }));
					if (args?.[0] === 2n)
						return Promise.resolve(makeSubmissionTuple({ projectId: 2n }));
				}

				if (functionName === "getSubmissionLifecycle") {
					if (args?.[0] === 1n) return lifecycleOneDeferred.promise;
					return Promise.resolve(null);
				}

				if (functionName === "getSubmissionJuryMetadata") {
					if (args?.[0] === 1n) return juryOneDeferred.promise;
					return Promise.resolve([false, "", ""]);
				}

				if (functionName === "getSubmissionGroupingMetadata") {
					if (args?.[0] === 1n) return groupingOneDeferred.promise;
					return Promise.resolve([false, "", "", 0n, 0n]);
				}

				return Promise.resolve(null);
			},
		);

		mockReadProjectById.mockImplementation((projectId: bigint) => {
			if (projectId === 1n) return projectOneDeferred.promise;
			return Promise.resolve(createMockProject({ id: 2n, owner: OWNER }));
		});
		mockReadSubmissionCommitTxHash.mockImplementation(
			(submissionId: bigint) => {
				if (submissionId === 1n) return commitOneDeferred.promise;
				return Promise.resolve(undefined);
			},
		);
		mockResolveSapphireTxHash.mockImplementation(
			({ cipherURI }: { cipherURI: string }) => {
				if (cipherURI === "oasis://mock/cipher")
					return sapphireOneDeferred.promise;
				return Promise.resolve(undefined);
			},
		);

		const user = userEvent.setup();
		renderRoutableSubmissionDetail("/submission/1");

		await waitFor(() => {
			expect(screen.getByText("#1")).toBeVisible();
		});

		await user.click(screen.getByRole("link", { name: "Go to submission 2" }));

		await waitFor(() => {
			expect(screen.getByText("#2")).toBeVisible();
			expect(screen.queryByText("#1")).toBeNull();
		});

		lifecycleOneDeferred.resolve([
			6,
			NOW_SECONDS + 1000n,
			NOW_SECONDS + 2000n,
			2,
			0,
			"0x0000000000000000000000000000000000000000000000000000000000000000",
			"0x0000000000000000000000000000000000000000000000000000000000000000",
		]);
		juryOneDeferred.resolve([true, "review", "needs escalation"]);
		groupingOneDeferred.resolve([true, "cohort-a", "group-1", 1n, 3n]);
		projectOneDeferred.resolve(createMockProject({ id: 1n, owner: OWNER }));
		commitOneDeferred.resolve(
			"0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
		);
		sapphireOneDeferred.resolve(
			"0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
		);

		await waitFor(() => {
			expect(screen.getByText("#2")).toBeVisible();
			expect(screen.queryByText("LIFECYCLE_METADATA")).toBeNull();
			expect(screen.queryByText("GROUPING_METADATA")).toBeNull();
			expect(screen.queryByText("JURY_OUTPUT")).toBeNull();
			expect(screen.queryByText("SEPOLIA_COMMIT_TX")).toBeNull();
			expect(screen.queryByText("SAPPHIRE_TX")).toBeNull();
		});
	});

	it("shows both Sapphire and Sepolia transaction hashes from chain-derived artifacts", async () => {
		mockUseWallet.mockReturnValue({
			address: AUDITOR,
			walletClient: { writeContract: mockWriteContract },
			isConnected: true,
		});
		mockReadContract.mockImplementation((config) => {
			const functionName = config.functionName;

			if (functionName === "submissions")
				return Promise.resolve(makeSubmissionTuple());
			return Promise.resolve(null);
		});

		renderSubmissionDetail();

		await waitFor(() => {
			expect(screen.getByText("SAPPHIRE_TX")).toBeVisible();
			expect(screen.getByText("SEPOLIA_COMMIT_TX")).toBeVisible();
		});

		expect(screen.queryByText("COMMIT_HASH")).not.toBeInTheDocument();
		expect(screen.queryByText("CIPHER_URI")).not.toBeInTheDocument();
		expect(
			screen.getByRole("link", {
				name: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
			}),
		).toHaveAttribute(
			"href",
			expect.stringContaining(
				"explorer.oasis.io/testnet/sapphire/tx/0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
			),
		);
	});

	it("renders core submission details before auxiliary artifact lookups resolve", async () => {
		const projectDeferred = deferred<ReturnType<typeof createMockProject>>();
		const commitTxDeferred = deferred<`0x${string}` | undefined>();
		const sapphireTxDeferred = deferred<`0x${string}` | undefined>();

		mockUseWallet.mockReturnValue({
			address: AUDITOR,
			walletClient: { writeContract: mockWriteContract },
			isConnected: true,
		});
		mockReadContract.mockImplementation((config) => {
			const functionName = config.functionName;
			if (functionName === "submissions")
				return Promise.resolve(makeSubmissionTuple());
			if (functionName === "getSubmissionLifecycle")
				return Promise.resolve(null);
			if (functionName === "getSubmissionJuryMetadata")
				return Promise.resolve([false, "", ""]);
			if (functionName === "getSubmissionGroupingMetadata")
				return Promise.resolve([false, "", "", 0n, 0n]);
			return Promise.resolve(null);
		});
		mockReadProjectById.mockReturnValue(projectDeferred.promise);
		mockReadSubmissionCommitTxHash.mockReturnValue(commitTxDeferred.promise);
		mockResolveSapphireTxHash.mockReturnValue(sapphireTxDeferred.promise);

		renderSubmissionDetail();

		await waitFor(() => {
			expect(screen.getByText(/SUBMISSION_#1/i)).toBeVisible();
			expect(
				screen.getByText(/0x1111111111111111111111111111111111111111/),
			).toBeVisible();
		});

		expect(screen.queryByText("SEPOLIA_COMMIT_TX")).toBeNull();
		expect(screen.queryByText("SAPPHIRE_TX")).toBeNull();

		projectDeferred.resolve(createMockProject({ id: 1n, owner: OWNER }));
		commitTxDeferred.resolve(
			"0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
		);
		sapphireTxDeferred.resolve(
			"0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
		);

		await waitFor(() => {
			expect(screen.getByText("SEPOLIA_COMMIT_TX")).toBeVisible();
			expect(screen.getByText("SAPPHIRE_TX")).toBeVisible();
		});
	});

	it("renders core submission details before lifecycle metadata lookups resolve", async () => {
		const lifecycleDeferred = deferred<
			| readonly [
					number,
					bigint,
					bigint,
					number,
					number,
					`0x${string}`,
					`0x${string}`,
			  ]
			| null
		>();
		const juryDeferred = deferred<readonly [boolean, string, string] | null>();
		const groupingDeferred = deferred<
			readonly [boolean, string, string, bigint, bigint] | null
		>();

		mockUseWallet.mockReturnValue({
			address: AUDITOR,
			walletClient: { writeContract: mockWriteContract },
			isConnected: true,
		});
		mockReadContract.mockImplementation((config) => {
			const functionName = config.functionName;
			if (functionName === "submissions")
				return Promise.resolve(makeSubmissionTuple());
			if (functionName === "getSubmissionLifecycle")
				return lifecycleDeferred.promise;
			if (functionName === "getSubmissionJuryMetadata")
				return juryDeferred.promise;
			if (functionName === "getSubmissionGroupingMetadata")
				return groupingDeferred.promise;
			return Promise.resolve(null);
		});

		renderSubmissionDetail();

		await waitFor(() => {
			expect(screen.getByText(/SUBMISSION_#1/i)).toBeVisible();
			expect(
				screen.getByText(/0x1111111111111111111111111111111111111111/),
			).toBeVisible();
		});

		expect(screen.queryByText("LIFECYCLE_METADATA")).toBeNull();
		expect(screen.queryByText("GROUPING_METADATA")).toBeNull();
		expect(screen.queryByText("JURY_OUTPUT")).toBeNull();

		lifecycleDeferred.resolve([
			6,
			NOW_SECONDS + 1000n,
			NOW_SECONDS + 2000n,
			2,
			0,
			"0x0000000000000000000000000000000000000000000000000000000000000000",
			"0x0000000000000000000000000000000000000000000000000000000000000000",
		]);
		juryDeferred.resolve([true, "review", "needs escalation"]);
		groupingDeferred.resolve([true, "cohort-a", "group-1", 1n, 3n]);

		await waitFor(() => {
			expect(screen.getByText("LIFECYCLE_METADATA")).toBeVisible();
			expect(screen.getByText("GROUPING_METADATA")).toBeVisible();
			expect(screen.getByText("JURY_OUTPUT")).toBeVisible();
		});
	});

	it("passes the active wallet provider into Sapphire preview reads", async () => {
		const walletClient = {
			writeContract: mockWriteContract,
			request: vi.fn(),
		};

		mockUseWallet.mockReturnValue({
			address: AUDITOR,
			walletClient,
			isConnected: true,
		});
		mockReadContract.mockResolvedValue(makeSubmissionTuple());

		renderSubmissionDetail();
		const user = userEvent.setup();

		await waitFor(() => {
			expect(
				screen.getByRole("button", { name: "[ VIEW_POC ]" }),
			).toBeVisible();
		});

		await user.click(screen.getByRole("button", { name: "[ VIEW_POC ]" }));

		await waitFor(() => {
			expect(mockReadStoredPoCPreview).toHaveBeenCalledWith(
				expect.objectContaining({
					cipherURI: "oasis://mock/cipher",
					fallbackAuditor: AUDITOR,
					ethereumProvider: walletClient,
				}),
			);
		});
	});

	it("shows a hard error instead of local补全 when chain read fails", async () => {
		mockUseWallet.mockReturnValue({
			address: AUDITOR,
			walletClient: { writeContract: mockWriteContract },
			isConnected: true,
		});
		mockReadContract.mockRejectedValue(new Error("rpc down"));

		renderSubmissionDetail();

		await waitFor(() => {
			expect(
				screen.getByText(/Failed to load submission from blockchain/i),
			).toBeVisible();
		});
	});
	it("renders jury and adjudication statuses with correct actions", async () => {
		mockUseWallet.mockReturnValue({
			address: NON_OWNER,
			walletClient: { writeContract: mockWriteContract },
			isConnected: true,
		});

		// We need to return an array of resolves because readContractWithRpcFallback is called multiple times now
		// [submissions, getSubmissionLifecycle, getSubmissionJuryMetadata, getSubmissionGroupingMetadata]
		mockReadContract.mockImplementation((config) => {
			const functionName = config.functionName;

			if (functionName === "submissions")
				return Promise.resolve(
					makeSubmissionTuple({
						status: 2,
						disputeDeadline: NOW_SECONDS - 100n,
					}),
				);
			if (functionName === "getSubmissionLifecycle")
				return Promise.resolve([
					6,
					NOW_SECONDS + 1000n,
					0n,
					0,
					0,
					"0x0",
					"0x0",
				]); // JuryPending
			if (functionName === "getSubmissionJuryMetadata")
				return Promise.resolve([false, "", ""]);
			if (functionName === "getSubmissionGroupingMetadata")
				return Promise.resolve([false, "", "", 0n, 0n]);
			return Promise.resolve(null);
		});

		renderSubmissionDetail();

		await waitFor(() => {
			expect(screen.getAllByText(/JuryPending/i)[0]).toBeVisible();
			expect(screen.getByText("[ PENDING REVIEW ]")).toBeVisible();
		});

		// Actions should not be visible
		expect(
			screen.queryByRole("button", { name: "[ CHALLENGE RESULT ]" }),
		).toBeNull();
		expect(
			screen.queryByRole("button", { name: "[ FINALIZE PAYOUT ]" }),
		).toBeNull();
	});

	it("renders a verification workflow section with jury review as the active branch", async () => {
		mockUseWallet.mockReturnValue({
			address: NON_OWNER,
			walletClient: { writeContract: mockWriteContract },
			isConnected: true,
		});

		mockReadContract.mockImplementation((config) => {
			const functionName = config.functionName;

			if (functionName === "submissions") {
				return Promise.resolve(
					makeSubmissionTuple({
						status: 2,
						disputeDeadline: NOW_SECONDS - 100n,
					}),
				);
			}
			if (functionName === "getSubmissionLifecycle") {
				return Promise.resolve([
					6,
					NOW_SECONDS + 1000n,
					0n,
					0,
					0,
					"0x0",
					"0x0",
				]);
			}
			if (functionName === "getSubmissionJuryMetadata")
				return Promise.resolve([false, "", ""]);
			if (functionName === "getSubmissionGroupingMetadata")
				return Promise.resolve([false, "", "", 0n, 0n]);
			return Promise.resolve(null);
		});

		renderSubmissionDetail();

		await waitFor(() => {
			expect(screen.getByText("VERIFICATION_WORKFLOW")).toBeVisible();
			expect(screen.getByText("PROTOCOL_NODE_STATUS")).toBeVisible();
			expect(screen.getByText("JURY_AGGREGATE_STATE")).toBeVisible();
			expect(
				screen.getByText(/no per-juror roster or vote records are public/i),
			).toBeVisible();
			expect(screen.getByText("verify-poc")).toBeVisible();
			expect(screen.getByText("jury-orchestrator")).toBeVisible();
			expect(screen.getByText("owner adjudication")).toBeVisible();
			expect(screen.getByText("BountyHub write-back")).toBeVisible();
			expect(screen.getAllByText("Strict Verification").length).toBeGreaterThan(
				0,
			);
			expect(screen.getAllByText("Jury Review").length).toBeGreaterThan(0);
			expect(screen.getAllByText("Owner Adjudication").length).toBeGreaterThan(
				0,
			);
			expect(screen.getAllByText("Final Result").length).toBeGreaterThan(0);
			expect(screen.getAllByText("[ACTIVE]").length).toBeGreaterThan(0);
			expect(screen.getByText(/entered jury review/i)).toBeVisible();
		});

		expect(screen.queryByText("LLM_JUROR_1")).toBeNull();
		expect(screen.queryByText("HUMAN_JUROR_5")).toBeNull();
	});

	it("renders owner adjudication as the active fallback when jury consensus has not settled the case", async () => {
		mockUseWallet.mockReturnValue({
			address: OWNER,
			walletClient: { writeContract: mockWriteContract },
			isConnected: true,
		});

		mockReadContract.mockImplementation((config) => {
			const functionName = config.functionName;

			if (functionName === "submissions") {
				return Promise.resolve(
					makeSubmissionTuple({
						status: 2,
						disputeDeadline: NOW_SECONDS - 100n,
					}),
				);
			}
			if (functionName === "getSubmissionLifecycle") {
				return Promise.resolve([
					7,
					NOW_SECONDS - 1000n,
					NOW_SECONDS + 2000n,
					0,
					0,
					"0x0",
					"0x0",
				]);
			}
			if (functionName === "getSubmissionJuryMetadata")
				return Promise.resolve([false, "", ""]);
			if (functionName === "getSubmissionGroupingMetadata")
				return Promise.resolve([false, "", "", 0n, 0n]);
			return Promise.resolve(null);
		});

		renderSubmissionDetail();

		await waitFor(() => {
			expect(screen.getByText("VERIFICATION_WORKFLOW")).toBeVisible();
			expect(
				screen.getAllByText(/owner adjudication is now open/i).length,
			).toBeGreaterThan(0);
			expect(screen.getByText("OWNER_TESTIMONY_INPUT")).toBeVisible();
			expect(screen.getByLabelText("Owner Testimony")).toBeVisible();
			expect(
				screen.getAllByText(/adjudication deadline/i).length,
			).toBeGreaterThan(0);
			expect(
				screen.getByText(/final adjudication submission is still blocked/i),
			).toBeVisible();
		});
	});

	it("prepares an owner testimony payload and surfaces real workflow blockers", async () => {
		const user = userEvent.setup();
		mockUseWallet.mockReturnValue({
			address: OWNER,
			walletClient: { writeContract: mockWriteContract },
			isConnected: true,
		});

		mockReadContract.mockImplementation((config) => {
			const functionName = config.functionName;

			if (functionName === "submissions") {
				return Promise.resolve(
					makeSubmissionTuple({
						status: 2,
						disputeDeadline: NOW_SECONDS - 100n,
					}),
				);
			}
			if (functionName === "getSubmissionLifecycle") {
				return Promise.resolve([
					7,
					NOW_SECONDS - 1000n,
					NOW_SECONDS + 2000n,
					0,
					0,
					"0x0",
					"0x0",
				]);
			}
			if (functionName === "getSubmissionJuryMetadata")
				return Promise.resolve([false, "", ""]);
			if (functionName === "getSubmissionGroupingMetadata")
				return Promise.resolve([false, "", "", 0n, 0n]);
			return Promise.resolve(null);
		});

		renderSubmissionDetail();

		await screen.findByText("OWNER_TESTIMONY_INPUT");
		await user.click(
			screen.getByRole("button", { name: "[ PREPARE TESTIMONY PAYLOAD ]" }),
		);

		expect(
			screen.getByText(
				/add owner testimony before preparing the workflow payload/i,
			),
		).toBeVisible();

		await user.type(
			screen.getByLabelText("Owner Testimony"),
			"Manual owner review confirms the fallback branch should settle this case.",
		);
		await user.click(
			screen.getByRole("button", { name: "[ PREPARE TESTIMONY PAYLOAD ]" }),
		);

		expect(screen.getByText("TESTIMONY_PAYLOAD_READY")).toBeVisible();
		expect(
			screen.getAllByText(/jury-recommendation\/v1/i).length,
		).toBeGreaterThan(0);
		expect(
			screen.getAllByText(
				/Manual owner review confirms the fallback branch should settle this case\./i,
			).length,
		).toBeGreaterThan(0);
		expect(screen.queryByLabelText("Final Judgment")).toBeNull();
	});

	it("submits a manual-jury trigger payload from the workflow panel", async () => {
		const user = userEvent.setup();
		const fetchMock = vi.fn(
			async (_input: RequestInfo | URL, _init?: RequestInit) =>
				new Response(
					JSON.stringify({
						ok: true,
						triggerName: "manual-jury",
						executionKey: "http:manual-jury:1",
						result: {
							result: {
								finalReportType: "adjudication-final/v1",
							},
						},
					}),
					{
						status: 200,
						headers: { "content-type": "application/json" },
					},
				),
		);
		vi.stubEnv("VITE_CRE_SIM_API_URL", "https://cre.example");
		vi.stubGlobal("fetch", fetchMock);

		mockUseWallet.mockReturnValue({
			address: OWNER,
			walletClient: { writeContract: mockWriteContract },
			isConnected: true,
		});

		mockReadContract.mockImplementation((config) => {
			const functionName = config.functionName;

			if (functionName === "submissions") {
				return Promise.resolve(
					makeSubmissionTuple({
						status: 2,
						disputeDeadline: NOW_SECONDS - 100n,
					}),
				);
			}
			if (functionName === "getSubmissionLifecycle") {
				return Promise.resolve([
					7,
					NOW_SECONDS - 1000n,
					NOW_SECONDS + 2000n,
					0,
					0,
					"0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
					"0x0",
				]);
			}
			if (functionName === "getSubmissionJuryMetadata")
				return Promise.resolve([false, "", ""]);
			if (functionName === "getSubmissionGroupingMetadata")
				return Promise.resolve([false, "", "", 0n, 0n]);
			return Promise.resolve(null);
		});

		renderSubmissionDetail();

		await screen.findByText("MANUAL_JURY_DEMO");
		await user.click(
			screen.getByRole("button", { name: "[ SUBMIT MANUAL JURY DEMO ]" }),
		);

		await waitFor(() => {
			expect(fetchMock).toHaveBeenCalledTimes(1);
		});

		const [requestUrl, requestInit] = fetchMock.mock.calls[0] as [
			string,
			RequestInit,
		];
		expect(requestUrl).toBe(
			"https://cre.example/api/cre-simulator/triggers/manual-jury",
		);
		expect(requestInit.method).toBe("POST");
		expect(requestInit.headers).toEqual({ "Content-Type": "application/json" });

		const parsedBody = JSON.parse(String(requestInit.body)) as {
			inputPayload: {
				verifiedReport: {
					reportType: string;
					payload: {
						submissionId: string;
						projectId: string;
					};
				};
				humanOpinions: Array<{ jurorId: string }>;
				juryRoundId: number;
			};
		};
		expect(parsedBody.inputPayload.verifiedReport.reportType).toBe(
			"verified-report/v3",
		);
		expect(parsedBody.inputPayload.verifiedReport.payload).toMatchObject({
			submissionId: "1",
			projectId: "1",
		});
		expect(
			parsedBody.inputPayload.humanOpinions.map((opinion) => opinion.jurorId),
		).toEqual([
			"human:alice",
			"human:bob",
			"human:carol",
			"human:dora",
			"human:erin",
		]);
		expect(parsedBody.inputPayload.juryRoundId).toBe(1);

		expect(screen.getByText("MANUAL_JURY_SUBMITTED")).toBeVisible();
		expect(screen.getByText(/http:manual-jury:1/i)).toBeVisible();
	});

	it("submits a manual-reveal trigger from the workflow panel for committed submissions", async () => {
		const user = userEvent.setup();
		const fetchMock = vi.fn(
			async (_input: RequestInfo | URL, _init?: RequestInit) =>
				new Response(
					JSON.stringify({
						ok: true,
						triggerName: "manual-reveal",
						executionKey: "http:manual-reveal:1",
						adapter: "auto-reveal-relayer",
						result: {
							adapter: "auto-reveal-relayer",
							result: { executedCount: 1 },
						},
					}),
					{
						status: 200,
						headers: { "content-type": "application/json" },
					},
				),
		);
		vi.stubEnv("VITE_CRE_SIM_API_URL", "https://cre.example");
		vi.stubGlobal("fetch", fetchMock);

		mockUseWallet.mockReturnValue({
			address: OWNER,
			walletClient: { writeContract: mockWriteContract },
			isConnected: true,
		});

		mockReadContract.mockImplementation((config) => {
			const functionName = config.functionName;

			if (functionName === "submissions") {
				return Promise.resolve(
					makeSubmissionTuple({
						status: 0,
						revealTimestamp: 0n,
						projectId: 1n,
					}),
				);
			}
			if (functionName === "getSubmissionLifecycle") return Promise.resolve(null);
			if (functionName === "getSubmissionJuryMetadata")
				return Promise.resolve([false, "", ""]);
			if (functionName === "getSubmissionGroupingMetadata")
				return Promise.resolve([false, "", "", 0n, 0n]);
			return Promise.resolve(null);
		});

		renderSubmissionDetail();

		await screen.findByText("MANUAL_AUTO_REVEAL");
		await user.click(
			screen.getByRole("button", { name: "[ TRIGGER AUTO-REVEAL ]" }),
		);

		await waitFor(() => {
			expect(fetchMock).toHaveBeenCalledTimes(1);
		});

		const [requestUrl, requestInit] = fetchMock.mock.calls[0] as [
			string,
			RequestInit,
		];
		expect(requestUrl).toBe(
			"https://cre.example/api/cre-simulator/triggers/manual-reveal",
		);
		expect(requestInit.method).toBe("POST");
		expect(requestInit.headers).toEqual({ "Content-Type": "application/json" });
		expect(requestInit.body).toBe("{}");

		expect(screen.getByText("MANUAL_AUTO_REVEAL_SUBMITTED")).toBeVisible();
		expect(screen.getByText(/http:manual-reveal:1/i)).toBeVisible();
	});

	it("clears a prepared testimony payload when the testimony changes", async () => {
		const user = userEvent.setup();
		mockUseWallet.mockReturnValue({
			address: OWNER,
			walletClient: { writeContract: mockWriteContract },
			isConnected: true,
		});

		mockReadContract.mockImplementation((config) => {
			const functionName = config.functionName;

			if (functionName === "submissions") {
				return Promise.resolve(
					makeSubmissionTuple({
						status: 2,
						disputeDeadline: NOW_SECONDS - 100n,
					}),
				);
			}
			if (functionName === "getSubmissionLifecycle") {
				return Promise.resolve([
					7,
					NOW_SECONDS - 1000n,
					NOW_SECONDS + 2000n,
					0,
					0,
					"0x0",
					"0x0",
				]);
			}
			if (functionName === "getSubmissionJuryMetadata")
				return Promise.resolve([false, "", ""]);
			if (functionName === "getSubmissionGroupingMetadata")
				return Promise.resolve([false, "", "", 0n, 0n]);
			return Promise.resolve(null);
		});

		renderSubmissionDetail();

		await screen.findByText("OWNER_TESTIMONY_INPUT");
		await user.type(
			screen.getByLabelText("Owner Testimony"),
			"Owner testimony draft.",
		);
		await user.click(
			screen.getByRole("button", { name: "[ PREPARE TESTIMONY PAYLOAD ]" }),
		);

		expect(screen.getByText("TESTIMONY_PAYLOAD_READY")).toBeVisible();

		await user.type(screen.getByLabelText("Owner Testimony"), " Updated");

		expect(screen.queryByText("TESTIMONY_PAYLOAD_READY")).toBeNull();
	});

	it("keeps owner adjudication visible but disables drafting for non-owners", async () => {
		mockUseWallet.mockReturnValue({
			address: NON_OWNER,
			walletClient: { writeContract: mockWriteContract },
			isConnected: true,
		});

		mockReadContract.mockImplementation((config) => {
			const functionName = config.functionName;

			if (functionName === "submissions") {
				return Promise.resolve(
					makeSubmissionTuple({
						status: 2,
						disputeDeadline: NOW_SECONDS - 100n,
					}),
				);
			}
			if (functionName === "getSubmissionLifecycle") {
				return Promise.resolve([
					7,
					NOW_SECONDS - 1000n,
					NOW_SECONDS + 2000n,
					0,
					0,
					"0x0",
					"0x0",
				]);
			}
			if (functionName === "getSubmissionJuryMetadata")
				return Promise.resolve([false, "", ""]);
			if (functionName === "getSubmissionGroupingMetadata")
				return Promise.resolve([false, "", "", 0n, 0n]);
			return Promise.resolve(null);
		});

		renderSubmissionDetail();

		await screen.findByText("OWNER_TESTIMONY_INPUT");
		expect(
			screen.getByText(
				/only the project owner connected to this page can draft/i,
			),
		).toBeVisible();
		expect(screen.getByLabelText("Owner Testimony")).toBeDisabled();
		expect(
			screen.getByRole("button", { name: "[ PREPARE TESTIMONY PAYLOAD ]" }),
		).toBeDisabled();
	});

	it("renders disputed workflow summary with an error banner variant", async () => {
		mockUseWallet.mockReturnValue({
			address: NON_OWNER,
			walletClient: { writeContract: mockWriteContract },
			isConnected: true,
		});

		mockSubmissionReadOnly(
			makeSubmissionTuple({
				status: 3,
				challenged: true,
				challengeBond: MIN_CHALLENGE_BOND_WEI,
				challenger: NON_OWNER,
				disputeDeadline: NOW_SECONDS + 600n,
			}),
		);

		renderSubmissionDetail();

		const workflowSummary = await screen.findByText(
			/currently disputed and not yet operationally settled/i,
		);
		expect(
			workflowSummary.closest('[data-status-variant="error"]'),
		).not.toBeNull();
	});

	it("renders submission detail gracefully even when auxiliary artifact lookups fail", async () => {
		mockUseWallet.mockReturnValue({
			address: AUDITOR,
			walletClient: { writeContract: mockWriteContract },
			isConnected: true,
		});
		mockReadContract.mockImplementation((config) => {
			const functionName = config.functionName;
			if (functionName === "submissions")
				return Promise.resolve(makeSubmissionTuple());
			return Promise.resolve(null);
		});

		mockReadProjectById.mockRejectedValue(new Error("project rpc down"));
		mockReadSubmissionCommitTxHash.mockRejectedValue(
			new Error("commit hash lookup failed"),
		);
		mockResolveSapphireTxHash.mockRejectedValue(
			new Error("sapphire lookup failed"),
		);

		renderSubmissionDetail();

		await waitFor(() => {
			expect(screen.getByText(/SUBMISSION_#1/i)).toBeVisible();
			expect(
				screen.getByText(/0x1111111111111111111111111111111111111111/),
			).toBeVisible(); // AUDITOR
		});
	});

	it("does not allow stale lifecycle data to override terminal statuses 5, 6, or 7", async () => {
		mockUseWallet.mockReturnValue({
			address: NON_OWNER,
			walletClient: { writeContract: mockWriteContract },
			isConnected: true,
		});

		mockReadContract.mockImplementation((config) => {
			const functionName = config.functionName;

			// Status 5 in submissions (terminal Invalid), but lifecycle still says 2 (Verified)
			if (functionName === "submissions")
				return Promise.resolve(
					makeSubmissionTuple({
						status: 5,
						disputeDeadline: NOW_SECONDS - 100n,
					}),
				);
			if (functionName === "getSubmissionLifecycle")
				return Promise.resolve([
					2,
					NOW_SECONDS + 1000n,
					0n,
					2,
					0,
					"0x0",
					"0x0",
				]);
			if (functionName === "getSubmissionJuryMetadata")
				return Promise.resolve([false, "", ""]);
			if (functionName === "getSubmissionGroupingMetadata")
				return Promise.resolve([false, "", "", 0n, 0n]);
			return Promise.resolve(null);
		});

		renderSubmissionDetail();

		await waitFor(() => {
			expect(screen.getByText("[ INVALID ]")).toBeVisible();
		});
	});
});
