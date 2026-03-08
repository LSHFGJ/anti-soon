import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import type { Address } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProjectDetail } from "../pages/ProjectDetail";

const { readProjectByIdMock, publicClientMock } = vi.hoisted(() => ({
	readProjectByIdMock: vi.fn(),
	publicClientMock: {
		readContract: vi.fn(),
		getLogs: vi.fn(),
		getBlockNumber: vi.fn(),
		multicall: vi.fn(),
		getCode: vi.fn(),
	},
}));

vi.mock("../lib/projectReads", () => ({
	readProjectById: (...args: unknown[]) => readProjectByIdMock(...args),
}));

vi.mock("../lib/publicClient", () => ({
	publicClient: publicClientMock,
	readContractWithRpcFallback: (...args: unknown[]) =>
		publicClientMock.readContract(...args),
	getLogsWithRpcFallback: (...args: unknown[]) =>
		publicClientMock.getLogs(...args),
	getBlockNumberWithRpcFallback: (...args: unknown[]) =>
		publicClientMock.getBlockNumber(...args),
	multicallWithRpcFallback: (...args: unknown[]) =>
		publicClientMock.multicall(...args),
	getCodeWithRpcFallback: (...args: unknown[]) =>
		publicClientMock.getCode(...args),
}));

const mockProject = {
	id: 1n,
	owner: "0x1111111111111111111111111111111111111111" as Address,
	bountyPool: 1_000_000_000_000_000_000n,
	maxPayoutPerBug: 500_000_000_000_000_000n,
	targetContract: "0x2222222222222222222222222222222222222222" as Address,
	forkBlock: 20_000_000n,
	active: true,
	mode: 0,
	commitDeadline: 0n,
	revealDeadline: 0n,
	disputeWindow: 86_400n,
	rulesHash: `0x${"11".repeat(32)}` as `0x${string}`,
	vnetStatus: 2,
	vnetRpcUrl: "",
	baseSnapshotId: `0x${"00".repeat(32)}` as `0x${string}`,
	vnetCreatedAt: 0n,
	repoUrl: "",
};

const mockRulesTuple = [
	1_000_000_000_000_000_000n,
	3_600n,
	true,
	{
		criticalDrainWei: 1_000_000_000_000_000_000n,
		highDrainWei: 500_000_000_000_000_000n,
		mediumDrainWei: 100_000_000_000_000_000n,
		lowDrainWei: 10_000_000_000_000_000n,
	},
] as const;

const mockSubmissionTuple = [
	"0xC1A97C6a4030a2089e1D9dA771De552bd67234a3" as Address,
	1n,
	`0x${"aa".repeat(32)}` as `0x${string}`,
	"oasis://mock/cipher",
	`0x${"00".repeat(32)}` as `0x${string}`,
	1_900_000_000n,
	0n,
	0,
	0n,
	0,
	0n,
	0n,
	false,
	"0x0000000000000000000000000000000000000000" as Address,
	0n,
] as const;

function renderProjectDetailRoute() {
	return render(
		<MemoryRouter initialEntries={["/project/1"]}>
			<Routes>
				<Route path="/project/:id" element={<ProjectDetail />} />
			</Routes>
		</MemoryRouter>,
	);
}

function renderRoutableProjectDetail(path = "/project/1") {
	return render(
		<MemoryRouter initialEntries={[path]}>
			<Link to="/project/2">Go to project 2</Link>
			<Routes>
				<Route path="/project/:id" element={<ProjectDetail />} />
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

describe("ProjectDetail submission visibility", () => {
	beforeEach(() => {
		vi.clearAllMocks();

		readProjectByIdMock.mockResolvedValue(mockProject);
		publicClientMock.readContract.mockResolvedValue(mockRulesTuple);
		publicClientMock.multicall.mockResolvedValue([
			mockSubmissionTuple,
			[2, 0n, 0n, 1, 1, "0x0", "0x0"], // lifecycle (verified)
			[false, "", ""], // jury
			[false, "", "", 0n, 0n], // grouping
		]);
		publicClientMock.getBlockNumber.mockResolvedValue(20_000n);
		publicClientMock.getCode.mockRejectedValue(new Error("missing trie node"));
	});

	it("falls back to chunked log reads and still renders committed submission", async () => {
		let logCallCount = 0;
		publicClientMock.getLogs.mockImplementation(async () => {
			logCallCount += 1;
			if (logCallCount === 1) {
				throw new Error("eth_getLogs is limited to a 10,000 range");
			}

			return [{ args: { submissionId: 42n } }];
		});

		renderProjectDetailRoute();

		await waitFor(() => {
			expect(screen.getByText("SUBMISSIONS [1]")).toBeDefined();
		});

		expect(screen.getByText("#42")).toBeDefined();
		expect(publicClientMock.getLogs.mock.calls.length).toBeGreaterThan(1);
	});

	it("shows explicit submissions load error when log query fails", async () => {
		publicClientMock.getLogs.mockRejectedValue(new Error("rpc unavailable"));

		renderProjectDetailRoute();

		await waitFor(() => {
			expect(
				screen.getByText(/Failed to load submissions from blockchain/),
			).toBeDefined();
		});
	});

	it("renders the enforced-rules panel copy from main", async () => {
		publicClientMock.getLogs.mockResolvedValue([
			{ args: { submissionId: 42n } },
		]);

		renderProjectDetailRoute();

		await waitFor(() => {
			expect(screen.getByText("CURRENTLY ENFORCED")).toBeVisible();
			expect(screen.getByText("SEVERITY THRESHOLDS")).toBeVisible();
			expect(screen.getByText("DISPUTE WINDOW")).toBeVisible();
			expect(
				screen.getByText(
					/Execution caps exist on-chain but are not enforced by the current workflow\./,
				),
			).toBeVisible();
		});
	});

	it("ignores stale project responses after route changes", async () => {
		const projectOneDeferred = deferred<typeof mockProject>();

		readProjectByIdMock.mockImplementation((projectId: bigint) => {
			if (projectId === 1n) {
				return projectOneDeferred.promise;
			}

			return Promise.resolve({
				...mockProject,
				id: 2n,
				targetContract: "0x3333333333333333333333333333333333333333" as Address,
			});
		});

		const user = userEvent.setup();
		renderRoutableProjectDetail("/project/1");

		await user.click(screen.getByRole("link", { name: "Go to project 2" }));

		await waitFor(() => {
			expect(screen.getByText("PROJECT #2")).toBeVisible();
		});

		projectOneDeferred.resolve(mockProject);

		await waitFor(() => {
			expect(screen.getByText("PROJECT #2")).toBeVisible();
			expect(screen.queryByText("PROJECT #1")).toBeNull();
		});
	});

	it("renders verdict source and deadlines for adjudicated submissions", async () => {
		publicClientMock.getLogs.mockResolvedValue([
			{
				args: {
					submissionId: 1n,
					auditor: "0x1111111111111111111111111111111111111111",
				},
			},
		]);

		publicClientMock.multicall.mockResolvedValue([
			mockSubmissionTuple,
			[6, 1736200000n, 1736300000n, 2, 0, "0x0", "0x0"], // lifecycle (JuryPending, veredictSource=2)
			[false, "", ""], // jury
			[false, "", "", 0n, 0n], // grouping
		]);

		renderProjectDetailRoute();

		await waitFor(() => {
			expect(screen.getByText("JuryPending")).toBeDefined();
			expect(screen.getByText("Source: Jury")).toBeDefined();
			expect(screen.getByText(/Jury DL:/)).toBeDefined();
			expect(screen.getByText(/Adj DL:/)).toBeDefined();
		});
	});
});
