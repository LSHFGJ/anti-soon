import type { DocsPage } from "../schema";

export const exploreProjectsDocsPage = {
	id: "explore-projects",
	slug: "explore-projects",
	href: "/docs/explore-projects",
	locale: "en",
	title: "Explore Projects",
	summary: "How to use the explorer and project detail screens to choose the right competition and know when to submit.",
	sections: [
		{
			id: "project-discovery",
			anchor: { id: "project-discovery", label: "Use the Explorer" },
			title: "Use the Explorer",
			summary: "What to do on `/explorer` before you spend time preparing a submission.",
			blocks: [
				{
					type: "paragraph",
					text: "Start on `/explorer` when you want to find a competition that is both open and worth your effort. The page lets you filter by project status and mode, then compare the core numbers on each card before you open a project detail page.",
				},
				{
					type: "steps",
					items: [
						{
							title: "Filter the list first",
							body: "Use the `Status` filter to focus on active projects first, then use the `Mode` filter to narrow the list to `UNIQUE`, `MULTI`, or `All` depending on the kind of competition you want.",
						},
						{
							title: "Read each project card",
							body: "Every card shows the project id, mode badge, bounty pool, max payout, target contract, and a status badge. Use those numbers to decide whether the opportunity is large enough and still open enough to justify deeper work.",
						},
						{
							title: "Open the project detail page",
							body: "Click a card to inspect one project in detail. That page gives you the richer rules, timing information, current submissions, and the `SUBMIT POC` shortcut when the project is active.",
						},
					],
				},
				{
					type: "table",
					columns: ["Card field", "What it tells you", "How to use it"],
					rows: [
						["Mode", "Whether the project is `UNIQUE` or `MULTI`.", "Use it to decide whether you want a first-valid style competition or a batch-style competition."],
						["Bounty / Max payout", "How much funding exists overall and how much one bug can pay.", "Use both numbers together. A large pool with a tiny max payout may still be less attractive than a smaller but better-shaped pool."],
						["Target", "The target contract address shown on the card.", "Use it as a quick sanity check that you are looking at the correct project before opening the detail page."],
						["Status", "Whether the project is currently open, in reveal, or closed.", "Treat open projects as the best candidates for new work. Closed projects are better for review than fresh submission preparation."],
					],
				},
			],
		},
		{
			id: "timeline-and-visibility",
			anchor: { id: "timeline-and-visibility", label: "Read Status and Timing" },
			title: "Read Status and Timing",
			summary: "How to interpret the current status badges you see in the explorer and project detail views.",
			blocks: [
				{
					type: "table",
					columns: ["What you see", "Meaning for you", "What to do next"],
					rows: [
						["`OPEN` on the explorer card", "The project is still open for new commitments.", "Open the project detail page, read the rules, and decide whether to start work now."],
						["`REVEAL` on the explorer card", "The commit deadline has passed and the project is in a later phase.", "Do not assume you can still enter a new submission. Review the detail page before spending time on a fresh PoC."],
						["`CLOSED` on the explorer card", "The competition has moved past the active window.", "Treat it as historical context, not a new submission opportunity."],
						["`COMMIT OPEN` on project detail", "The detail page still considers the project open for new commitments.", "If the project is active and you want to participate, this is the best moment to use the `SUBMIT POC` button."],
						["`REVEAL PHASE` or `CLOSED` on project detail", "The page is showing a later competition stage.", "Use the submission list and status panels for observation, not as a sign that a new commit is definitely possible."],
					],
				},
				{
					type: "list",
					style: "unordered",
					items: [
						"The explorer's top-level `Status` filter controls which projects you see before you ever open a detail page.",
						"Project detail pages add more timing context than the explorer cards, so use the detail page whenever a card looks promising.",
						"A project can be visible in the UI even when it is no longer a good candidate for a new submission, so always check the status badge before opening the Builder.",
					],
				},
			],
		},
		{
			id: "submission-signal-reading",
			anchor: { id: "submission-signal-reading", label: "Decide Whether to Submit" },
			title: "Decide Whether to Submit",
			summary: "The short checklist to run before you click `SUBMIT POC`.",
			blocks: [
				{
					type: "list",
					style: "unordered",
					items: [
						"Confirm that the project is active and still shows an open commit state before you invest time in final submission prep.",
						"Read the detail page's payout numbers and rules so you understand whether the target and reward justify the effort.",
						"Use the visible target contract and project metadata as a sanity check that you are preparing the PoC for the right competition.",
						"Start the Builder from the project detail page when possible so the project context is already selected for you.",
					],
				},
				{
					type: "callout",
					tone: "info",
					title: "Not every missing detail is a bug",
					body: [
						"Project detail pages can show less information than you expect, especially around submission contents or pre-reveal activity.",
						"If you are browsing as an outsider, limited visibility can be intentional. Use the published rules, status badges, and payout terms to decide whether to participate.",
					],
				},
			],
		},
	],
} as const satisfies DocsPage;
