import type { DocsPage } from "../schema";

export const submitPocDocsPage = {
	id: "submit-poc",
	slug: "submit-poc",
	href: "/docs/submit-poc",
	locale: "en",
	title: "Submit a PoC",
	summary: "Workflows for creating and submitting Proofs of Concept.",
	sections: [
		{
			id: "choose-a-project",
			anchor: {
				id: "choose-a-project",
				label: "Choose a Project",
			},
			title: "Choose a Project",
			summary: "Selecting a vulnerable target for your PoC.",
			blocks: [
				{
					type: "paragraph",
					text: "Before building a Proof of Concept, you must select an active project. The Builder automatically populates project context when navigating from the Explorer. If no project is selected, the commit step will require you to select one or retry context linking.",
				}
			],
		},
		{
			id: "builder-inputs",
			anchor: {
				id: "builder-inputs",
				label: "Builder Inputs",
			},
			title: "Builder Inputs",
			summary: "The steps required to construct your exploit payload.",
			blocks: [
				{
					type: "paragraph",
					text: "The PoC Builder uses a five-step wizard to construct a simulated execution environment and attack vector:",
				},
				{
					type: "steps",
					items: [
						{
							title: "Target",
							body: "Specify the vulnerable contract address and chain. The ABI is required to encode function calls."
						},
						{
							title: "Conditions",
							body: "Set up the initial blockchain state. You can manipulate ETH balances, block timestamps, or directly edit storage slots."
						},
						{
							title: "Transactions",
							body: "Define the sequence of exploit transactions, including target address, ETH value, and ABI-encoded calldata."
						},
						{
							title: "Impact",
							body: "Describe the expected impact (e.g., funds drained) and estimate the loss to help validators verify the vulnerability."
						},
						{
							title: "Review",
							body: "Inspect the generated JSON payload before beginning the on-chain submission flow."
						}
					]
				}
			]
		},
		{
			id: "commit-reveal-flow",
			anchor: {
				id: "commit-reveal-flow",
				label: "Commit-Reveal Flow",
			},
			title: "Commit-Reveal Flow",
			summary: "The on-chain submission process.",
			blocks: [
				{
					type: "paragraph",
					text: "Submitting a PoC uses a two-step commit-reveal scheme to prevent front-running:",
				},
				{
					type: "steps",
					items: [
						{
							title: "Commit",
							body: "Your PoC JSON is encrypted and hashed. An on-chain transaction registers this hash to secure your claim."
						},
						{
							title: "Reveal",
							body: "After the commit is confirmed, a second transaction publishes the decryption key or full payload so nodes can verify it."
						}
					]
				},
				{
					type: "callout",
					tone: "warning",
					title: "Do Not Close the Tab",
					body: [
						"Navigating away during the encrypting, committing, or revealing phases may interrupt the flow. The UI provides a prompt if you attempt to leave early."
					]
				}
			]
		},
		{
			id: "submission-outcomes",
			anchor: {
				id: "submission-outcomes",
				label: "Submission Outcomes",
			},
			title: "Submission Outcomes",
			summary: "What happens after reveal.",
			blocks: [
				{
					type: "paragraph",
					text: "Once the reveal transaction is successful, the verification network takes over. You can track the status of your PoC via the provided verification link. Outcomes include passing validation with automated payout or rejection if the nodes cannot reproduce the exploit.",
				}
			]
		},
		{
			id: "common-failure-cases",
			anchor: {
				id: "common-failure-cases",
				label: "Common Failure Cases",
			},
			title: "Common Failure Cases",
			summary: "Troubleshooting the submission process.",
			blocks: [
				{
					type: "list",
					style: "unordered",
					items: [
						"Missing Project Context: Trying to commit without a linked target project.",
						"Wallet Disconnected: Connection drops before the reveal transaction completes.",
						"Transaction Reverted: Gas issues or network congestion during commit or reveal."
					]
				},
				{
					type: "paragraph",
					text: "If a transaction fails, the Builder displays a failure state with options to Retry the transaction or Reset the flow."
				}
			]
		}
	],
} as const satisfies DocsPage;
