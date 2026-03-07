import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import type { Address } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProjectDetail } from "../pages/ProjectDetail";

function getFunctionName(parameters: unknown): string | null {
	if (typeof parameters !== "object" || parameters === null || !("functionName" in parameters)) {
		return null;
	}

	const value = parameters.functionName;
	return typeof value === "string" ? value : null;
}

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
	readContractWithRpcFallback: (...args: unknown[]) => publicClientMock.readContract(...args),
	getLogsWithRpcFallback: (...args: unknown[]) => publicClientMock.getLogs(...args),
	getBlockNumberWithRpcFallback: (...args: unknown[]) => publicClientMock.getBlockNumber(...args),
	multicallWithRpcFallback: (...args: unknown[]) => publicClientMock.multicall(...args),
	getCodeWithRpcFallback: (...args: unknown[]) => publicClientMock.getCode(...args),
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
		publicClientMock.readContract.mockImplementation(async (parameters: unknown) => {
			const functionName = getFunctionName(parameters);
			if (functionName === "projectRules") {
				return mockRulesTuple;
			}
			if (functionName === "getProjectSubmissionIds") {
				return [[42n], 0n];
			}

			throw new Error(`Unexpected readContract call: ${String(functionName)}`);
		});
		publicClientMock.multicall.mockResolvedValue([mockSubmissionTuple]);
		publicClientMock.getBlockNumber.mockResolvedValue(20_000n);
		publicClientMock.getCode.mockRejectedValue(new Error("missing trie node"));
		publicClientMock.getLogs.mockRejectedValue(new Error("legacy log discovery should not run"));
	});

	it("uses the contract submission index and still renders committed submission", async () => {
		renderProjectDetailRoute();

		await waitFor(() => {
			expect(screen.getByText("SUBMISSIONS [1]")).toBeDefined();
		});

		expect(screen.getByText("#42")).toBeDefined();
		expect(publicClientMock.getLogs).not.toHaveBeenCalled();
	});

	it("shows explicit submissions load error when log query fails", async () => {
		publicClientMock.readContract.mockImplementation(async (parameters: unknown) => {
			const functionName = getFunctionName(parameters);
			if (functionName === "projectRules") {
				return mockRulesTuple;
			}
			if (functionName === "getProjectSubmissionIds") {
				throw new Error("rpc unavailable");
			}

			throw new Error(`Unexpected readContract call: ${String(functionName)}`);
		});

		renderProjectDetailRoute();

		await waitFor(() => {
			expect(
				screen.getByText(/Failed to load submissions from blockchain/),
			).toBeDefined();
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
});
