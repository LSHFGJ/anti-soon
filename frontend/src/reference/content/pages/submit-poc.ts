import type { DocsPage } from "../schema";

export const submitPocDocsPage = {
	id: "submit-poc",
	slug: "submit-poc",
	href: "/docs/submit-poc",
	locale: "en",
	title: "Submit a PoC",
	summary: "How a researcher goes from choosing a project to completing a confirmed submission in the Builder.",
	sections: [
		{
			id: "submission-readiness",
			anchor: { id: "submission-readiness", label: "Before You Open the Builder" },
			title: "Before You Open the Builder",
			summary: "What to prepare so the submission flow feels smooth instead of brittle.",
			blocks: [
				{
					type: "paragraph",
					text: "The best submission flow starts from a chosen project, not from an empty builder. Use `/explorer` and the project detail page first, then move into `/builder` when you already know the target, the competition is still open, and you have the PoC details ready.",
				},
				{
					type: "list",
					style: "unordered",
					items: [
						"Choose the project first and, if possible, enter the Builder from that project's `SUBMIT POC` button so the project context is preselected.",
						"Prepare the exploit scenario, setup assumptions, transaction sequence, and impact explanation before you start entering data into the wizard.",
						"Connect a wallet that can sign on Sepolia and stay connected through the final review and submission step.",
						"Keep enough time before the project's deadline so you can review and retry if your first submit attempt fails.",
					],
				},
			],
		},
		{
			id: "commit-path",
			anchor: { id: "commit-path", label: "Use the Builder" },
			title: "Use the Builder",
			summary: "How the current step-based submission flow works from a user's point of view.",
			blocks: [
				{
					type: "paragraph",
					text: "The Builder is a five-step flow: `TARGET`, `CONDITIONS`, `TRANSACTIONS`, `IMPACT`, and `REVIEW`. Work through the steps in order and treat the final review screen as the moment to verify that the selected project, exploit path, and expected impact all still match your intent.",
				},
				{
					type: "steps",
					items: [
						{
							title: "Target",
							body: "Confirm the project context and target contract you are attacking. If you entered from a project detail page, this step is usually easier because the project is already selected.",
						},
						{
							title: "Conditions",
							body: "Describe the state assumptions or setup requirements the exploit needs before it can run. This is where you make the scenario reproducible for later review.",
						},
						{
							title: "Transactions",
							body: "Enter the exploit transaction sequence in the order it should execute. This step is the heart of the PoC because it defines what the replay path will actually try to run.",
						},
						{
							title: "Impact",
							body: "Choose the impact type and explain what the exploit achieves so the review path can tell the difference between a technical trick and a meaningful security issue.",
						},
						{
							title: "Review and submit",
							body: "Check the final summary, connect your wallet if needed, and submit. Do not treat the PoC as complete until the wallet transaction succeeds and the app shows a real committed result instead of local draft state.",
						},
					],
				},
				{
					type: "callout",
					tone: "info",
					title: "Practical completion check",
					body: [
						"A draft in the Builder is not a submission yet.",
						"Treat the submission as complete only after the transaction succeeds and you can later find the result through the project page or your dashboard rather than only in local browser state.",
					],
				},
			],
		},
		{
			id: "post-commit-lifecycle",
			anchor: { id: "post-commit-lifecycle", label: "After You Submit" },
			title: "After You Submit",
			summary: "Where to look next and what changes to expect after a successful submission.",
			blocks: [
				{
					type: "paragraph",
					text: "After a successful submit, your next job is to track the result instead of re-submitting blindly. Use the project detail page to watch the competition itself, use `/dashboard` to watch your own submission history and pending payouts, and use `/leaderboard` only when you care about public ranking after payouts have actually happened.",
				},
				{
					type: "table",
					columns: ["Where to look", "What you should expect", "Why it matters"],
					rows: [
						["Project detail page", "The competition's current status, rules, and submission list.", "Use it to understand the project's overall stage and whether the project is still open or already moving through later phases."],
						["Dashboard", "Your own recent submissions, severity, status, payout amount, and date.", "This is the best place to answer: did my submission land, is it still pending, and has anything been paid yet?"],
						["Leaderboard", "Public ranking by total earnings after real bounty payouts.", "Do not expect a fresh submission to change the leaderboard immediately. The leaderboard is payout-driven, not draft-driven."],
					],
				},
			],
		},
	],
} as const satisfies DocsPage;
