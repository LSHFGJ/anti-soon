import type { DocsPage } from "../schema";

export const apiAndContractsDocsPage = {
	id: "api-and-contracts",
	slug: "api-and-contracts",
	href: "/docs/api-and-contracts",
	locale: "en",
	title: "API & Contracts",
	summary: "API boundaries and data contracts.",
	sections: [
		{
			id: "frontend-configuration",
			anchor: { id: "frontend-configuration", label: "Frontend Configuration" },
			title: "Frontend Configuration",
			summary: "Connecting to the correct network and smart contracts.",
			blocks: [
				{
					type: "paragraph",
					text: "The frontend interacts with the on-chain application primarily through viem using definitions from `config.ts`. The core configuration exports the `BOUNTY_HUB_ADDRESS` and ABIs like `BOUNTY_HUB_PROJECTS_V4_ABI`. The application enforces operations on the supported chain (e.g., Sepolia testnet) using the appropriate chain selectors.",
				}
			],
		},
		{
			id: "bountyhub-contract-actions",
			anchor: { id: "bountyhub-contract-actions", label: "BountyHub Contract Actions" },
			title: "BountyHub Contract Actions",
			summary: "Key write operations available in BountyHub.sol.",
			blocks: [
				{
					type: "paragraph",
					text: "The main write functions on `BountyHub` manage the lifecycles of projects and submissions. The contract currently supports V2 and V3 project registration endpoints, differing in scope declarations and repo tracking. Submissions are processed through a two-step `commitPoC` and `revealPoC` mechanism, including meta-transaction alternatives enabled via `BySig` suffixes.",
				},
				{
					type: "table",
					columns: ["Function", "Role", "Description"],
					rows: [
						["registerProjectV3", "Project Owner", "Registers a new bounty with scope arrays, rules hash, and repo url."],
						["commitPoC", "Auditor", "Stores the `cipherURI` of the encrypted PoC hash payload."],
						["revealPoC", "Auditor / Relayer", "Publishes the salt and triggers the CRE validation workflow."],
						["challenge", "Anyone", "Posts a minimum bond to challenge a verified exploit report."]
					],
				}
			],
		},
		{
			id: "project-and-submission-reads",
			anchor: { id: "project-and-submission-reads", label: "Project and Submission Reads" },
			title: "Project and Submission Reads",
			summary: "Data fetching models for projects and submissions.",
			blocks: [
				{
					type: "paragraph",
					text: "To optimize RPC calls, the frontend maps tuples fetched directly from the smart contract views using utility functions such as `mapProjectTupleV4` in `src/lib/projectMapping.ts`. Additionally, the frontend utilizes multicall aggregations in `src/lib/projectReads.ts` (via `readProjectsByIds`) and relies on `getSubmissionSyncState` to poll submission sync timestamps and metadata hashes simultaneously without multiple access paths.",
				}
			],
		},
		{
			id: "core-events",
			anchor: { id: "core-events", label: "Core Events" },
			title: "Core Events",
			summary: "Event emissions tracking the asynchronous flow.",
			blocks: [
				{
					type: "paragraph",
					text: "BountyHub emits several vital events used by both the frontend block explorer indexing and the off-chain KE functions.",
				},
				{
					type: "code",
					language: "solidity",
					code: "event ProjectRegisteredV3(uint256 indexed projectId, address indexed owner, string repoUrl, ContractScope[] scopes);\nevent PoCRevealed(uint256 indexed submissionId);\nevent ProjectVnetCreated(uint256 indexed projectId, string vnetRpcUrl, bytes32 baseSnapshotId);\nevent RevealQueued(uint256 indexed submissionId, address indexed auditor, uint256 deadline);"
				}
			],
		},
		{
			id: "workflow-inventory",
			anchor: { id: "workflow-inventory", label: "Workflow Inventory" },
			title: "Workflow Inventory",
			summary: "Registered Chainlink CRE workflows.",
			blocks: [
				{
					type: "paragraph",
					text: "Several off-chain execution boundaries are established in the repository. `vnet-init` monitors project registration to provision the Tenderly fork and base snapshot. `verify-poc` responds to the `PoCRevealed` topic to trigger simulation tests and submit reports back via CRE forwarding. Additionally, `jury-orchestrator` handles validation mechanics and dispute recommendations. Meanwhile, the `auto-reveal-relayer` runs as an off-chain cron job executing queued signatures prior to their expiry deadlines.",
				}
			],
		},
	],
} as const satisfies DocsPage;