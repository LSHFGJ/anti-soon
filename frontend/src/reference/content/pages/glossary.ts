import type { DocsPage } from "../schema";

export const glossaryDocsPage = {
	id: "glossary",
	slug: "glossary",
	href: "/docs/glossary",
	locale: "en",
	title: "Glossary",
	summary: "Definitions for domains and ubiquitous language.",
	sections: [
		{
			id: "overview",
			anchor: { id: "overview", label: "Overview" },
			title: "Overview",
			summary: "Core terminology used across the platform.",
			blocks: [
				{
					type: "paragraph",
					text: "The following terms are fundamental to understanding the AntiSoon architecture and platform operations:",
				},
				{
					type: "list",
					style: "unordered",
					items: [
						"PoC: Proof of Concept. The executable payload submitted by an auditor demonstrating a vulnerability, containing preconditions and attack transactions.",
						"CRE: Chainlink Runtime Environment. The decentralized off-chain execution network that orchestrates our validation workflows and LLM analysis.",
						"BountyHub: The core smart contract deployed on-chain that manages project registrations, escrows bounty pools, and coordinates the commit-reveal cycle.",
						"commit-reveal: A two-phase submission pattern where an auditor first commits an encrypted PoC hash to lock in their submission, and later reveals the salt to allow processing.",
						"reveal queue: An off-chain relay mechanism in MULTI mode that safely holds auditor-signed reveal payloads and automatically executes them after the commit deadline.",
						"dispute window: The configured timeframe after a verified submission where a payout is escrowed, allowing challenged results to be reviewed before finalization.",
						"vnet: Tenderly Virtual TestNet. An isolated, on-demand blockchain fork used by the CRE to safely simulate and evaluate a PoC against live state.",
						"ACL-only: The strict mode enforced via acl-only-v1 marker which limits API and execution capabilities to authorized endpoints, rejecting legacy submission paths.",

					],
				},
			],
		},
	],
} as const satisfies DocsPage;
