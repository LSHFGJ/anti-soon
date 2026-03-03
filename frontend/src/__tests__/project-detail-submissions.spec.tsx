import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
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

describe("ProjectDetail submission visibility", () => {
	beforeEach(() => {
		vi.clearAllMocks();

		readProjectByIdMock.mockResolvedValue(mockProject);
		publicClientMock.readContract.mockResolvedValue(mockRulesTuple);
		publicClientMock.multicall.mockResolvedValue([mockSubmissionTuple]);
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
});
