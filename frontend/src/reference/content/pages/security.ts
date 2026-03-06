import type { DocsPage } from "../schema";

export const securityDocsPage = {
	id: "security",
	slug: "security",
	href: "/docs/security",
	locale: "en",
	title: "Security",
	summary: "Security posture and threat models.",
	sections: [
		{
			id: "assets-and-actors",
			anchor: { id: "assets-and-actors", label: "Assets and Actors" },
			title: "Assets and Actors",
			summary: "Core entities and value held.",
			blocks: [
				{
					type: "paragraph",
					text: "The primary actors in the AntiSoon platform are Auditors (who submit PoCs) and Project Owners (who register targets and fund bounty pools). The primary asset is the bounty pool locked in the BountyHub contract, which acts as an escrow until verified PoCs are confirmed by the CRE.",
				},
			],
		},
		{
			id: "trust-boundaries",
			anchor: { id: "trust-boundaries", label: "Trust Boundaries" },
			title: "Trust Boundaries",
			summary: "System boundaries.",
			blocks: [
				{
					type: "paragraph",
					text: "The frontend interacts with the blockchain via client-side wallets and reads contract state directly. The Chainlink Runtime Environment (CRE) operates as a trusted off-chain boundary that orchestrates Tenderly vNets and LLM analysis, submitting results back on-chain via the ReceiverTemplate.",
				},
			],
		},
		{
			id: "submission-confidentiality",
			anchor: { id: "submission-confidentiality", label: "Submission Confidentiality" },
			title: "Submission Confidentiality",
			summary: "How PoCs are protected.",
			blocks: [
				{
					type: "paragraph",
					text: "Confidentiality is maintained through a two-phase commit-reveal mechanism. Auditors first submit a hash of their encrypted PoC payload. Once the commit is mined, they reveal the salt, unlocking the workflow and preventing front-running attacks during the submission phase.",
				},
			],
		},
		{
			id: "privileges-and-admin-actions",
			anchor: { id: "privileges-and-admin-actions", label: "Privileges and Admin Actions" },
			title: "Privileges and Admin Actions",
			summary: "Admin capabilities.",
			blocks: [
				{
					type: "paragraph",
					text: "The BountyHub contract owner has the authority to configure the `s_authorizedWorkflows` provenance list to restrict which workflows can report results. Project Owners can register new targets and top-up existing bounties. There is an ACL-only hard cutover marker (`acl-only-v1`) that enforces strict API submission modes.",
				},
			],
		},
		{
			id: "security-assumptions",
			anchor: { id: "security-assumptions", label: "Security Assumptions" },
			title: "Security Assumptions",
			summary: "Underlying assumptions.",
			blocks: [
				{
					type: "paragraph",
					text: "The system assumes that the underlying RPC endpoints and Tenderly vNet services are available to execute verified workflows. It also assumes that the BFT consensus among the DON nodes running the `verify-poc` workflow is sufficient to prevent manipulation of the execution result.",
				},
			],
		},
	],
} as const satisfies DocsPage;
