import type { DocsPage } from "../schema";

export const exploreProjectsDocsPage = {
	id: "explore-projects",
	slug: "explore-projects",
	href: "/docs/explore-projects",
	locale: "en",
	title: "Explore Projects",
	summary: "Finding and evaluating active bounty projects.",
	sections: [
		{
			id: "explorer-filters",
			anchor: {
				id: "explorer-filters",
				label: "Explorer Filters",
			},
			title: "Explorer Filters",
			summary: "Using the Explorer to find targets.",
			blocks: [
				{
					type: "paragraph",
					text: "The Explorer page provides a list of all registered projects on the network. You can use dropdown filters to refine the list based on specific criteria:",
				},
				{
					type: "list",
					style: "unordered",
					items: [
						"Status Filter: Toggle between Active (currently accepting PoCs), Inactive, or All projects.",
						"Mode Filter: Filter by payout mode, either UNIQUE (first valid submission wins) or MULTI (proportional split among valid submissions)."
					]
				}
			],
		},
		{
			id: "project-statuses",
			anchor: {
				id: "project-statuses",
				label: "Project Statuses",
			},
			title: "Project Statuses",
			summary: "Understanding the timeline of a project.",
			blocks: [
				{
					type: "paragraph",
					text: "Each project moves through a lifecycle based on its on-chain deadlines:",
				},
				{
					type: "list",
					style: "unordered",
					items: [
						"COMMIT OPEN: The current time is before the commit deadline. New PoC hashes can be submitted.",
						"REVEAL PHASE: The commit deadline has passed, but the reveal deadline is still active. Only existing commits can be revealed.",
						"CLOSED: Both deadlines have passed. No further action can be taken."
					]
				}
			]
		},
		{
			id: "project-detail-interpretation",
			anchor: {
				id: "project-detail-interpretation",
				label: "Project Detail Interpretation",
			},
			title: "Project Detail Interpretation",
			summary: "Reading project configurations and history.",
			blocks: [
				{
					type: "paragraph",
					text: "The Project Detail view provides a comprehensive breakdown of the target's parameters, ensuring you understand the rules of engagement before building a PoC. Note that if the application cannot reach the blockchain, it will display a warning and load preview fallback data.",
				},
				{
					type: "list",
					style: "unordered",
					items: [
						"Bounty Information: Total Bounty Pool and Max Payout per bug.",
						"Timers: Live countdowns for both Commit and Reveal deadlines.",
						"Rules & Thresholds: The configuration for execution, including Max Attacker Seed, Max Time Warp, and exact ETH drain thresholds required for each severity level (Critical, High, Medium, Low).",
						"Submissions List: A table of all PoCs submitted against the project, showing auditor addresses, statuses, severities, drain amounts, and any awarded payouts."
					]
				}
			]
		},
		{
			id: "when-to-use-builder-from-project-detail",
			anchor: {
				id: "when-to-use-builder-from-project-detail",
				label: "When to Use Builder from Project Detail",
			},
			title: "When to Use Builder from Project Detail",
			summary: "Seamlessly starting your submission.",
			blocks: [
				{
					type: "paragraph",
					text: "If a project is currently active and you have a valid exploit, you can click the 'SUBMIT POC' button directly on the project's detail page.",
				},
				{
					type: "callout",
					tone: "success",
					title: "Context Injection",
					body: [
						"Navigating to the Builder from the Project Detail page pre-populates the project context, which can save you a manual selection step. Review the selected project before submitting, because the Builder still exposes editable project-selection paths."
					]
				}
			]
		}
	],
} as const satisfies DocsPage;
