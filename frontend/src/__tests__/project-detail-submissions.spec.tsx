import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import type { Address } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProjectDetail } from "../pages/ProjectDetail";

const { readProjectByIdMock, readAllProjectSubmissionIdsMock, publicClientMock } = vi.hoisted(() => ({
	readProjectByIdMock: vi.fn(),
	readAllProjectSubmissionIdsMock: vi.fn(),
	publicClientMock: {
		readContract: vi.fn(),
		multicall: vi.fn(),
	},
}));

vi.mock("../lib/projectReads", () => ({
	readProjectById: (...args: unknown[]) => readProjectByIdMock(...args),
}));

vi.mock("../lib/submissionIndex", () => ({
	readAllProjectSubmissionIds: (...args: unknown[]) =>
		readAllProjectSubmissionIdsMock(...args),
}));

vi.mock("../lib/publicClient", () => ({
	readContractWithRpcFallback: (...args: unknown[]) =>
		publicClientMock.readContract(...args),
	multicallWithRpcFallback: (...args: unknown[]) =>
		publicClientMock.multicall(...args),
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
		readAllProjectSubmissionIdsMock.mockResolvedValue([42n]);
		publicClientMock.readContract.mockResolvedValue(mockRulesTuple);
		publicClientMock.multicall.mockResolvedValue([
			mockSubmissionTuple,
			[2, 0n, 0n, 1, 1, "0x0", "0x0"], // lifecycle (verified)
			[false, "", ""], // jury
			[false, "", "", 0n, 0n], // grouping
		]);
	});

	it("uses indexed project submission ids and still renders committed submission", async () => {
		renderProjectDetailRoute();

		await waitFor(() => {
			expect(screen.getByText("SUBMISSIONS [1]")).toBeDefined();
		});

		expect(screen.getByText("#42")).toBeDefined();
		expect(readAllProjectSubmissionIdsMock).toHaveBeenCalledWith(1n);
	});

	it("shows explicit submissions load error when indexed submission lookup fails", async () => {
		readAllProjectSubmissionIdsMock.mockRejectedValue(new Error("rpc unavailable"));

		renderProjectDetailRoute();

		await waitFor(() => {
			expect(
				screen.getByText(/Failed to load submissions from blockchain/),
			).toBeDefined();
		});
	});

	it("preserves preview submissions without retrying live reads in preview fallback mode", async () => {
		readProjectByIdMock.mockRejectedValue(new Error("project rpc down"));
		readAllProjectSubmissionIdsMock.mockRejectedValue(new Error("submission rpc down"));

		renderProjectDetailRoute();

		await waitFor(() => {
			expect(screen.getByText(/Preview mode active/)).toBeVisible();
		});

		expect(screen.getByText("#3001")).toBeVisible();
		expect(screen.getByText("#3002")).toBeVisible();
		expect(readAllProjectSubmissionIdsMock).not.toHaveBeenCalled();
	});

	it("renders the enforced-rules panel copy from main", async () => {
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
		readAllProjectSubmissionIdsMock.mockResolvedValue([1n]);

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

	it("keeps rendering indexed submissions when optional lifecycle metadata reverts", async () => {
		publicClientMock.multicall.mockResolvedValue([
			{ status: "success", result: mockSubmissionTuple },
			{ status: "failure", error: new Error("legacy submission lifecycle unavailable") },
			{ status: "success", result: [false, "", ""] },
			{ status: "success", result: [false, "", "", 0n, 0n] },
		]);

		renderProjectDetailRoute();

		await waitFor(() => {
			expect(screen.getByText("#42")).toBeVisible();
		});

		expect(
			screen.queryByText(/Failed to load submissions from blockchain/),
		).toBeNull();
	});

	it("keeps rendering indexed submissions when optional jury and grouping metadata revert", async () => {
		publicClientMock.multicall.mockResolvedValue([
			{ status: "success", result: mockSubmissionTuple },
			{ status: "success", result: [2, 0n, 0n, 1, 1, "0x0", "0x0"] },
			{ status: "failure", error: new Error("legacy jury metadata unavailable") },
			{ status: "failure", error: new Error("legacy grouping metadata unavailable") },
		]);

		renderProjectDetailRoute();

		await waitFor(() => {
			expect(screen.getByText("#42")).toBeVisible();
		});

		expect(
			screen.queryByText(/Failed to load submissions from blockchain/),
		).toBeNull();
	});

	it("ignores stale submission responses after route changes", async () => {
		const projectOneSubmissionsDeferred = deferred<bigint[]>();
		const projectTwoDeferred = deferred<typeof mockProject>();
		const projectTwoSubmissionsDeferred = deferred<bigint[]>();

		readProjectByIdMock.mockImplementation((projectId: bigint) => {
			if (projectId === 1n) {
				return Promise.resolve(mockProject);
			}

			return projectTwoDeferred.promise;
		});
		readAllProjectSubmissionIdsMock.mockImplementation((projectId: bigint) => {
			if (projectId === 1n) {
				return projectOneSubmissionsDeferred.promise;
			}

			return projectTwoSubmissionsDeferred.promise;
		});
		publicClientMock.multicall.mockImplementation(async ({ contracts }) => {
			const submissionId = contracts[0]?.args?.[0];
			const submissionTuple = [
				mockSubmissionTuple[0],
				submissionId === 84n ? 2n : 1n,
				mockSubmissionTuple[2],
				mockSubmissionTuple[3],
				mockSubmissionTuple[4],
				mockSubmissionTuple[5],
				mockSubmissionTuple[6],
				mockSubmissionTuple[7],
				mockSubmissionTuple[8],
				mockSubmissionTuple[9],
				mockSubmissionTuple[10],
				mockSubmissionTuple[11],
				mockSubmissionTuple[12],
				mockSubmissionTuple[13],
				mockSubmissionTuple[14],
			] as const;

			return [
				submissionTuple,
				[2, 0n, 0n, 1, 1, "0x0", "0x0"],
				[false, "", ""],
				[false, "", "", 0n, 0n],
			];
		});

		const user = userEvent.setup();
		renderRoutableProjectDetail("/project/1");

		await user.click(screen.getByRole("link", { name: "Go to project 2" }));
		projectOneSubmissionsDeferred.resolve([42n]);
		projectTwoDeferred.resolve({
			...mockProject,
			id: 2n,
			targetContract: "0x3333333333333333333333333333333333333333" as Address,
		});

		await waitFor(() => {
			expect(screen.getByText("PROJECT #2")).toBeVisible();
			expect(screen.queryByText("#42")).toBeNull();
		});

		projectTwoSubmissionsDeferred.resolve([84n]);

		await waitFor(() => {
			expect(screen.getByText("PROJECT #2")).toBeVisible();
			expect(screen.getByText("#84")).toBeVisible();
			expect(screen.queryByText("#42")).toBeNull();
		});
	});
});
