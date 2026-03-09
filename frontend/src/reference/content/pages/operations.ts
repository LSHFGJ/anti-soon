import type { DocsPage } from "../schema";

export const operationsDocsPage = {
	id: "operations",
	slug: "operations",
	href: "/docs/operations",
	locale: "en",
	title: "Operations",
	summary: "Operational checkpoints for the workflow-driven AntiSoon protocol path.",
	sections: [
		{
			id: "runtime-topology",
			anchor: { id: "runtime-topology", label: "Runtime Topology" },
			title: "Runtime Topology",
			summary: "The active operational surfaces that must cooperate for the protocol to move forward.",
			blocks: [
				{
					type: "paragraph",
					text: "Operations are organized around a runtime topology where project registration is the source event. That registration fans out into the `vnet-init` path and registration-time scheduler bootstrap, then the protocol advances through reveal orchestration via `verify-poc`, strict verification, `jury-orchestrator` consensus, and settlement-facing write-back to `BountyHub`.",
				},
				{
					type: "table",
					columns: ["Runtime surface", "Operational responsibility", "Critical dependency"],
					rows: [
						["BountyHub", "Emit lifecycle events and persist accepted reports", "Authorized workflow provenance"],
						["`vnet-init` path", "Activate projects by provisioning or reusing Tenderly state", "Registration events and Tenderly environment health"],
						["Commit-window scheduler", "Track mode-specific timing after registration-time scheduler bootstrap", "Stored project timing rules"],
						["`verify-poc` path", "Replay revealed submissions and compute strict metrics", "Sapphire payload access plus Tenderly execution"],
						["`jury-orchestrator` path", "Aggregate hidden jury opinions and final package inputs", "Confidential storage and deadline-aware orchestration"],
					],
				},
			],
		},
		{
			id: "orchestration-checkpoints",
			anchor: { id: "orchestration-checkpoints", label: "Orchestration Checkpoints" },
			title: "Orchestration Checkpoints",
			summary: "The operator-friendly milestones that prove the protocol is advancing correctly.",
			blocks: [
				{
					type: "steps",
					items: [
						{
							title: "Bootstrap confirmation",
							body: "After registration, confirm that project registration is the source event for both downstream bootstrap branches: the project moved through the pending VNet phase and received a valid activation write-back, and the registration-time scheduler bootstrap captured the timing needed for later commit-window automation.",
						},
						{
							title: "Commit identity confirmation",
							body: "Treat `PoCCommitted` as the checkpoint where a submission becomes operationally real; until then, local recovery data is not enough.",
						},
						{
							title: "Reveal orchestration checkpoint",
							body: "Confirm that UNIQUE submissions or MULTI commit windows are advancing into their correct reveal workflow path rather than assuming a generic manual reveal stage.",
						},
						{
							title: "Verification branch checkpoint",
							body: "Determine whether the case passed the `verify-poc` strict gate or moved into `jury-orchestrator` consensus or adjudication, as downstream timelines depend on this branch.",
						},
						{
							title: "Result write-back checkpoint",
							body: "Only treat a case as operationally complete when the final package has been accepted by BountyHub and is visible to settlement-facing readers.",
						},
					],
				},
			],
		},
		{
			id: "release-and-docs-gates",
			anchor: { id: "release-and-docs-gates", label: "Release and Docs Gates" },
			title: "Release and Docs Gates",
			summary: "Minimum verification loops for shipping protocol or docs changes.",
			blocks: [
				{
					type: "paragraph",
					text: "Because the docs are intended to describe the protocol path, release discipline matters. Contract sync, docs schema validation, preview checks, and build verification should happen together so that protocol-facing language and runtime-facing configuration do not drift apart.",
				},
				{
					type: "code",
					language: "bash",
					code: "bun run contracts:check\nbunx vitest run src/__tests__/docs-content.spec.ts src/__tests__/Docs.test.tsx src/__tests__/App.docs-route.spec.tsx\nbun run build",
					caption: "Minimum verification loop for this docs corpus as it describes the shipped adjudication authority model.",
				},
			],
		},
	],
} as const satisfies DocsPage;
