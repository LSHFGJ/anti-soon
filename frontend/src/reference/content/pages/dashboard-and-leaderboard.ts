import type { DocsPage } from "../schema";

export const dashboardAndLeaderboardDocsPage = {
	id: "dashboard-and-leaderboard",
	slug: "dashboard-and-leaderboard",
	href: "/docs/dashboard-and-leaderboard",
	locale: "en",
	title: "Dashboard & Leaderboard",
	summary: "Metrics, tracking, and community standings.",
	sections: [
		{
			id: "wallet-connection",
			anchor: {
				id: "wallet-connection",
				label: "Wallet Connection",
			},
			title: "Wallet Connection",
			summary: "Accessing the Dashboard.",
			blocks: [
				{
					type: "paragraph",
					text: "The Dashboard is auditor-specific. You must connect your wallet to view your submissions, earnings, and pending payouts. The Leaderboard, however, is a global view and can be viewed without a connected wallet.",
				},
			],
		},
		{
			id: "metrics-and-states",
			anchor: {
				id: "metrics-and-states",
				label: "Metrics and States",
			},
			title: "Metrics and States",
			summary: "Understanding your Dashboard numbers.",
			blocks: [
				{
					type: "paragraph",
					text: "Your Dashboard aggregates data from all your on-chain submissions:",
				},
				{
					type: "list",
					style: "unordered",
					items: [
						"Total Earned: The sum of payouts only for submissions that have reached the Finalized status.",
						"Valid Submissions: The count of submissions evaluated as severity > 0 that are Verified or Finalized.",
						"Pending Submissions: The count of submissions currently in the Verified state, awaiting finalization."
					]
				},
				{
					type: "callout",
					tone: "info",
					title: "Pending vs Finalized",
					body: [
						"Verified submissions with a nonzero payout are visually highlighted as 'Pending Payouts', but they are not included in the 'Total Earned' metric until they are officially Finalized."
					]
				}
			]
		},
		{
			id: "submission-history",
			anchor: {
				id: "submission-history",
				label: "Submission History",
			},
			title: "Submission History",
			summary: "Tracking your PoCs.",
			blocks: [
				{
					type: "paragraph",
					text: "The recent submissions table displays the lifecycle of each PoC. The statuses you will see include:",
				},
				{
					type: "list",
					style: "unordered",
					items: [
						"Committed: The encrypted hash is registered on-chain.",
						"Revealed: The payload is public and awaiting verification.",
						"Verified: Nodes have confirmed the exploit and severity.",
						"Disputed: The project owner has challenged the verdict.",
						"Finalized: The payout has been executed.",
						"Invalid: The exploit failed or did not meet severity thresholds."
					]
				}
			]
		},
		{
			id: "leaderboard-interpretation",
			anchor: {
				id: "leaderboard-interpretation",
				label: "Leaderboard Interpretation",
			},
			title: "Leaderboard Interpretation",
			summary: "How standings are calculated.",
			blocks: [
				{
					type: "paragraph",
					text: "The Leaderboard ranks addresses globally based on total finalized earnings.",
				},
				{
					type: "list",
					style: "unordered",
					items: [
						"Ranking: Sorted descending by total ETH earned from BountyPaid events.",
						"Tie-breaking: In the event of a tie, the address with the earliest payout takes precedence.",
						"Summary Stats: The page also shows total hunters, total payouts distributed, and counts for Critical and High severity bugs found across the network."
					]
				}
			]
		},
		{
			id: "empty-and-error-states",
			anchor: {
				id: "empty-and-error-states",
				label: "Empty and Error States",
			},
			title: "Empty and Error States",
			summary: "Handling missing data.",
			blocks: [
				{
					type: "paragraph",
					text: "If you have not submitted any PoCs, the Dashboard will guide you to the Explorer. If the application cannot connect to the blockchain, a warning banner will appear. In some environments, the app may fall back to 'Preview Mode' and display synthetic demo data to keep the UI functional for testing."
				}
			]
		}
	],
} as const satisfies DocsPage;
