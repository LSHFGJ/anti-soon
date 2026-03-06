import type { DocsPage } from "../schema";

export const createProjectDocsPage = {
	id: "create-project",
	slug: "create-project",
	href: "/docs/create-project",
	locale: "en",
	title: "Create a Project",
	summary: "Guidelines and workflow for starting new projects.",
	sections: [
		{
			id: "required-inputs",
			anchor: {
				id: "required-inputs",
				label: "Required Inputs",
			},
			title: "Required Inputs",
			summary: "What you need to start a project.",
			blocks: [
				{
					type: "paragraph",
					text: "The Create Project flow guides you through a seven-step process to establish a target on AntiSoon. The UI assists in scanning a public GitHub repository for Foundry deployment scripts (`.s.sol`), but the final on-chain registration primarily captures economic rules and target details.",
				},
				{
					type: "list",
					style: "unordered",
					items: [
						"Target Contract: A valid Ethereum address where the vulnerability lies.",
						"Bounty Pool: Total ETH deposited to fund valid payouts.",
						"Max Payout Per Bug: The maximum ETH paid out for a single Critical finding.",
						"Mode: UNIQUE (first valid reveal wins) or MULTI (batch verification)."
					]
				}
			],
		},
		{
			id: "rules-and-thresholds",
			anchor: {
				id: "rules-and-thresholds",
				label: "Rules and Thresholds",
			},
			title: "Rules and Thresholds",
			summary: "Defining the limits of execution.",
			blocks: [
				{
					type: "paragraph",
					text: "During project creation, you must specify the parameters that the verifier nodes will enforce:",
				},
				{
					type: "list",
					style: "unordered",
					items: [
						"Max Attacker Seed: The maximum ETH an attacker can use during environment setup.",
						"Max Warp Seconds: Maximum allowed time the PoC can warp forward (0 = unlimited).",
						"Impersonation: Whether the PoC is allowed to impersonate arbitrary addresses.",
						"Thresholds: Exact ETH drain amounts required to classify an exploit as Critical, High, Medium, or Low severity."
					]
				}
			]
		},
		{
			id: "deadlines-and-dispute-windows",
			anchor: {
				id: "deadlines-and-dispute-windows",
				label: "Deadlines and Dispute Windows",
			},
			title: "Deadlines and Dispute Windows",
			summary: "Timing configuration.",
			blocks: [
				{
					type: "paragraph",
					text: "Timing rules determine the lifecycle of the project and its submissions.",
				},
				{
					type: "list",
					style: "unordered",
					items: [
						"Commit Deadline: When the project stops accepting new encrypted PoC commitments.",
						"Reveal Deadline: The absolute cutoff for revealing committed PoCs.",
						"Dispute Window: The length of time project owners have to dispute AI verdicts after a successful execution."
					]
				}
			]
		},
		{
			id: "on-chain-registration-flow",
			anchor: {
				id: "on-chain-registration-flow",
				label: "On-chain Registration Flow",
			},
			title: "On-chain Registration Flow",
			summary: "What is actually persisted on-chain.",
			blocks: [
				{
					type: "paragraph",
					text: "When you click 'Submit Project', a single transaction is sent to the BountyHub contract. This transaction transfers the total Bounty Pool ETH.",
				},
				{
					type: "callout",
					tone: "info",
					title: "On-Chain Scope Note",
					body: [
						"The on-chain transaction records the target contract, mode, deadlines, and rules thresholds. It does not natively store the GitHub repository URL, the selected script text, or the contract scopes. Those are used to help build the project configuration and assist auditors."
					]
				}
			]
		},
		{
			id: "risk-warnings",
			anchor: {
				id: "risk-warnings",
				label: "Risk Warnings",
			},
			title: "Risk Warnings",
			summary: "Precautions to take.",
			blocks: [
				{
					type: "paragraph",
					text: "Be aware of the following risks when creating a project:",
				},
				{
					type: "list",
					style: "unordered",
					items: [
						"Funds Lockup: The bounty pool is locked in the contract and can only be withdrawn according to protocol rules.",
						"Irreversible Deadlines: Ensure commit and reveal deadlines are sufficiently long.",
						"Correct Thresholds: Setting drain thresholds too low could result in payouts for unintended behaviors."
					]
				}
			]
		}
	],
} as const satisfies DocsPage;
