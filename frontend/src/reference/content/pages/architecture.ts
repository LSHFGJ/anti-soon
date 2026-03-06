import type { DocsPage } from "../schema";

export const architectureDocsPage = {
	id: "architecture",
	slug: "architecture",
	href: "/docs/architecture",
	locale: "en",
	title: "Architecture",
	summary: "System architecture and module boundaries.",
	sections: [
		{
			id: "system-purpose",
			anchor: { id: "system-purpose", label: "System Purpose" },
			title: "System Purpose",
			summary: "High-level goals of the Anti-Soon architecture.",
			blocks: [
				{
					type: "paragraph",
					text: "The Anti-Soon protocol aims to provide a decentralized bounty management and proof-of-concept (PoC) verification system. The overarching goal is to enable automated, deterministic evaluation of exploit submissions using chain-backed workflow verification, ensuring bounties are reliably paid out against configured criteria without manual developer intervention.",
				}
			],
		},
		{
			id: "core-surfaces",
			anchor: { id: "core-surfaces", label: "Core Surfaces" },
			title: "Core Surfaces",
			summary: "Main components making up the platform.",
			blocks: [
				{
					type: "paragraph",
					text: "The system is composed of three primary surfaces:",
				},
				{
					type: "table",
					columns: ["Surface", "Technology", "Responsibility"],
					rows: [
						["Smart Contracts", "Solidity (BountyHub.sol)", "Source of truth for project state, PoC submissions (commit/reveal), and reward distribution."],
						["CRE Workflows", "TypeScript (vnet-init, verify-poc)", "Off-chain deterministic execution environments that simulate PoC execution on virtual networks (VNets)."],
						["Frontend", "React / Viem", "Client-side orchestration of project creation, submission commits/reveals via EIP-712 signatures, and data aggregation."]
					],
				}
			],
		},
		{
			id: "chain-and-workflow-dependencies",
			anchor: { id: "chain-and-workflow-dependencies", label: "Chain and Workflow Dependencies" },
			title: "Chain and Workflow Dependencies",
			summary: "Integration points between on-chain state and off-chain environments.",
			blocks: [
				{
					type: "paragraph",
					text: "The integration relies heavily on the Chainlink Runtime Environment (CRE) triggering off-chain workflows based on emitted contract events. For instance, when a project is registered, the `vnet-init` workflow provisions a Tenderly Virtual Network. Later, the `verify-poc` workflow activates upon detecting the `PoCRevealed` event, executing the payload in the associated VNet and writing back a verification report.",
				}
			],
		},
		{
			id: "trust-boundaries",
			anchor: { id: "trust-boundaries", label: "Trust Boundaries" },
			title: "Trust Boundaries",
			summary: "Security assumptions in the architecture.",
			blocks: [
				{
					type: "paragraph",
					text: "BountyHub enforces workflow provenance by asserting that the `msg.sender` writing verification reports is the authorized CRE Forwarder and that the `workflowId` matches the allowed workflow configuration. However, auditors initially commit their PoC encrypted on Oasis Sapphire, forming a trust boundary where the encrypted payload remains private until explicitly revealed, protecting the zero-day exploit from frontrunning.",
				}
			],
		},
		{
			id: "known-constraints",
			anchor: { id: "known-constraints", label: "Known Constraints" },
			title: "Known Constraints",
			summary: "Current architectural limitations.",
			blocks: [
				{
					type: "paragraph",
					text: "Current project architectures rely on pre-configured Tenderly Virtual Networks. A VNet is initialized only once per project; if this initialization fails, project registration enters a failed VNet state and skips verification. Additionally, the `verify-poc` workflow requires the VNet state to precisely match the target contract's chain block state, halting execution if upstream RPC data indicates a drift or unavailable state.",
				}
			],
		},
	],
} as const satisfies DocsPage;