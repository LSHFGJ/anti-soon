import type { DocsPage } from "../schema";

export const gettingStartedDocsPage = {
	id: "getting-started",
	slug: "getting-started",
	href: "/docs/getting-started",
	locale: "en",
	title: "Getting Started",
	summary: "The fastest way for a researcher or project owner to reach a useful first action in AntiSoon.",
	sections: [
		{
			id: "protocol-orientation",
			anchor: { id: "protocol-orientation", label: "Start Here" },
			title: "Start Here",
			summary: "What to do in your first AntiSoon session.",
			blocks: [
				{
					type: "paragraph",
					text: "Treat AntiSoon as a small set of practical entry points rather than one giant workflow. Researchers usually start in `/explorer` and move into `/builder`. Project owners usually start in `/create-project`. Returning users usually come back through `/dashboard` or `/leaderboard` to check progress and payouts.",
				},
				{
					type: "steps",
					items: [
						{
							title: "Decide what you want to do",
							body: "Pick one immediate goal: browse active competitions, create a new project, submit a PoC, or check the status of your existing submissions and payouts.",
						},
						{
							title: "Open the matching page",
							body: "Use `/explorer` to browse projects, `/create-project` to launch the owner wizard, `/builder` to prepare a submission, `/dashboard` to review your own activity, and `/leaderboard` to see public rankings.",
						},
						{
							title: "Connect a wallet when you need to act",
							body: "Browsing can happen without a wallet, but project creation, PoC submission, and personalized dashboard data all depend on a connected wallet.",
						},
						{
							title: "Use the page-specific guide next",
							body: "Once you know your route, switch to the guide for that page. The rest of the user docs explain what information to prepare, what the UI shows, and what result confirms that your action worked.",
						},
					],
				},
			],
		},
		{
			id: "researcher-and-owner-entry-points",
			anchor: {
				id: "researcher-and-owner-entry-points",
				label: "Choose Your Path",
			},
			title: "Choose Your Path",
			summary: "Start from the route that matches your goal, not from protocol theory.",
			blocks: [
				{
					type: "table",
					columns: ["User", "Open this route", "First goal", "Read next"],
					rows: [
						["Researcher looking for a target", "`/explorer`", "Filter active projects, compare bounty terms, and decide whether a competition is worth your time.", "`/docs/explore-projects`"],
						["Researcher ready to submit", "`/builder` or a project's `SUBMIT POC` button", "Prepare the PoC, review the steps, and complete a confirmed submission.", "`/docs/submit-poc`"],
						["Project owner", "`/create-project`", "Scan the repository, define scope, set bounty rules, and register the project on-chain.", "`/docs/create-project`"],
						["Returning auditor", "`/dashboard`", "Check your submission history, pending payouts, and recent results.", "`/docs/dashboard-and-leaderboard`"],
						["Anyone checking public standings", "`/leaderboard`", "See who has been paid and how the ranking table is sorted.", "`/docs/dashboard-and-leaderboard`"],
					],
				},
				{
					type: "paragraph",
					text: "If you are unsure where to start, default to the route that matches your immediate job. The docs are most useful when they help you complete a task on the screen in front of you, not when they try to explain the whole protocol up front.",
				},
			],
		},
		{
			id: "onboarding-prerequisites",
			anchor: { id: "onboarding-prerequisites", label: "Before You Start" },
			title: "Before You Start",
			summary: "The small checklist that avoids most first-time user confusion.",
			blocks: [
				{
					type: "list",
					style: "unordered",
					items: [
						"Have a wallet ready if you plan to create a project, submit a PoC, or open your personal dashboard data.",
						"Keep some Sepolia ETH available for gas; owners also need enough balance to fund the bounty pool they enter in the wizard.",
						"If you are an owner, prepare a public GitHub repository URL and make sure the repo contains Foundry deployment scripts in `script/` so the Create Project wizard can scan them.",
						"If you are a researcher, decide which project you are targeting before opening the Builder. The cleanest path is to choose the project in `/explorer` or on a project detail page first.",
						"If a page shows a preview-mode warning or blockchain load error, treat the screen as a partial fallback and verify important details before acting on them.",
					],
				},
			],
		},
	],
} as const satisfies DocsPage;
