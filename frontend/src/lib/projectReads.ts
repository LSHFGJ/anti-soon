import { BOUNTY_HUB_ADDRESS, BOUNTY_HUB_PROJECTS_V4_ABI } from "../config";
import type { Project } from "../types";
import { mapProjectTupleV4, type ProjectV4OnChain } from "./projectMapping";
import { multicallWithRpcFallback } from "./publicClient";

function buildV4Contracts(projectIds: readonly bigint[]) {
	return projectIds.map((projectId) => ({
		address: BOUNTY_HUB_ADDRESS,
		abi: BOUNTY_HUB_PROJECTS_V4_ABI,
		functionName: "projects" as const,
		args: [projectId] as const,
	}));
}

export async function readProjectById(projectId: bigint): Promise<Project> {
	const [project] = await readProjectsByIds([projectId]);
	return project;
}

export async function readProjectsByIds(
	projectIds: readonly bigint[],
): Promise<Project[]> {
	if (projectIds.length === 0) {
		return [];
	}

	try {
		const v4 = (await multicallWithRpcFallback({
			contracts: buildV4Contracts(projectIds),
			allowFailure: false,
		})) as ProjectV4OnChain[];
		return v4.map((row, index) => mapProjectTupleV4(projectIds[index], row));
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		throw new Error(`PROJECT_READ_V4_ONLY_FAILED: ${reason}`);
	}
}
