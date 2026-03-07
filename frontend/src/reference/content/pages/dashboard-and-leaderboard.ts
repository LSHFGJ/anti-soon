import type { DocsPage } from "../schema";

export const dashboardAndLeaderboardDocsPage = {
	id: "dashboard-and-leaderboard",
	slug: "dashboard-and-leaderboard",
	href: "/docs/dashboard-and-leaderboard",
	locale: "en",
	title: "Dashboard & Leaderboard",
	summary: "How to use `/dashboard` and `/leaderboard` to track your own submissions, payouts, and public ranking.",
	sections: [
		{
			id: "visibility-model",
			anchor: { id: "visibility-model", label: "Use the Dashboard" },
			title: "Use the Dashboard",
			summary: "What the dashboard actually shows you after you connect your wallet.",
			blocks: [
				{
					type: "paragraph",
					text: "`/dashboard` is the page for your own activity. When your wallet is connected, it loads the submissions committed by that address and summarizes them into four top-line metrics before showing the recent-submissions table below.",
				},
				{
					type: "table",
					columns: ["Dashboard area", "What it shows", "How to use it"],
					rows: [
						["Connect wallet screen", "A prompt to connect before personalized data can load.", "If you only want public ranking data, go to `/leaderboard` instead. If you want your own submissions, connect first."],
						["Top metrics", "`TOTAL EARNED`, `SUBMISSIONS`, `VALID`, and `PENDING`.", "Use these cards for a quick read on whether you are getting paid, how many submissions you have, and how much unresolved work is still in flight."],
						["Pending payouts", "Rows that show project id, severity, and ETH amount for payouts still waiting to clear.", "Treat this as your watchlist for money that looks positive but is not fully settled yet."],
						["Recent submissions", "A table of submission id, project, severity, status, payout, and date.", "Open the linked project when you need more competition context around a specific submission."],
					],
				},
			],
		},
		{
			id: "verdict-and-payout-signals",
			anchor: { id: "verdict-and-payout-signals", label: "Read Submission Status" },
			title: "Read Submission Status",
			summary: "How to interpret the most important columns in your submission history.",
			blocks: [
				{
					type: "table",
					columns: ["Column", "What to look for", "Practical interpretation"],
					rows: [
						["Severity", "The badge and any extra grouping marker.", "Use this to understand the quality of the current result package, but remember that severity alone does not mean the payout has already landed."],
						["Status", "The status badge in the table row.", "Treat it as the current chain-derived stage for that submission. If the row still looks in-flight, keep checking here instead of assuming a payout is already due."],
						["Payout", "Either an ETH amount or `-`.", "An ETH value means the system has a payout amount for the submission. `-` means nothing has been paid yet, even if other fields look promising."],
						["Date", "The commit timestamp.", "Use it to understand recency and to distinguish a new submission from an older result that has simply changed status later."],
					],
				},
				{
					type: "list",
					style: "unordered",
					items: [
						"If the dashboard says `No submissions found`, the fastest next action is to return to `/builder` and create your first submission.",
						"If a row shows a positive payout amount and also appears in `PENDING PAYOUTS`, treat it as good news that still needs final settlement.",
						"If the dashboard is showing a preview-mode warning, verify important payout and status data before acting on it.",
					],
				},
			],
		},
		{
			id: "grouping-and-ranking",
			anchor: { id: "grouping-and-ranking", label: "Use the Leaderboard" },
			title: "Use the Leaderboard",
			summary: "What the public ranking view is for, and what it is not for.",
			blocks: [
				{
					type: "paragraph",
					text: "`/leaderboard` is the public summary screen. It ranks auditors by total earned bounty and shows how many valid, high, and critical results each address has accumulated. If your wallet is connected, your own row is highlighted so you can see where you stand without scanning the whole table manually.",
				},
				{
					type: "table",
					columns: ["Leaderboard column", "What it means", "How to use it"],
					rows: [
						["Rank", "Relative position by earnings.", "Use it as a quick public standing, not as a guarantee of current submission quality."],
						["Auditor", "Shortened wallet address.", "If you connect your wallet, your own row is highlighted to help you spot yourself quickly."],
						["Valid / High / Critical", "Counts of stronger recorded outcomes.", "Use these columns to understand why someone ranks highly, not just how much they have earned."],
						["Earnings", "Total bounty amount paid to that address.", "This is the key ranking signal. New submissions do not change it until real payouts have happened."],
					],
				},
				{
					type: "callout",
					tone: "info",
					title: "Do not use the leaderboard as a live submission tracker",
					body: [
						"The leaderboard can be empty even when people are actively working, because it is driven by bounty payout events rather than drafts or pending submissions.",
						"Use `/dashboard` for your own in-flight work and `/leaderboard` for public results after money has actually moved.",
					],
				},
			],
		},
	],
} as const satisfies DocsPage;
