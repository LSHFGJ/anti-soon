import type { DocsPage } from "../schema";

export const troubleshootingDocsPage = {
	id: "troubleshooting",
	slug: "troubleshooting",
	href: "/docs/troubleshooting",
	locale: "en",
	title: "Troubleshooting",
	summary: "How to debug the lifecycle model when docs, reads, and protocol progress do not line up.",
	sections: [
		{
			id: "lifecycle-debugging-lens",
			anchor: { id: "lifecycle-debugging-lens", label: "Lifecycle Debugging Lens" },
			title: "Lifecycle Debugging Lens",
			summary: "Start by asking which lifecycle checkpoint failed, not which page looks odd.",
			blocks: [
				{
					type: "paragraph",
					text: "Most AntiSoon issues make more sense when you debug by protocol checkpoint. Ask whether the project activated after registration, whether the submission reached `PoCCommitted`, whether reveal orchestration advanced, whether result write-back happened, and whether the current page is merely lagging behind the real protocol stage. That framing is more reliable than assuming every visible glitch is a UI bug.",
				},
			],
		},
		{
			id: "commit-and-visibility-issues",
			anchor: { id: "commit-and-visibility-issues", label: "Commit and Visibility Issues" },
			title: "Commit and Visibility Issues",
			summary: "Symptoms where the researcher path and public read surfaces disagree.",
			blocks: [
				{
					type: "table",
					columns: ["Symptom", "Likely lifecycle meaning", "What to check"],
					rows: [
						["Local UI thinks the submission exists, but the project page does not", "Recovery state was persisted without a trustworthy protocol checkpoint or the read model is still behind", "Look for a real `PoCCommitted` event before trusting local state"],
						["A non-submitter cannot inspect a committed submission", "This may be expected pre-reveal access control rather than missing data", "Check whether the submission has actually reached the reveal stage"],
						["Commit succeeded, but later stages do not advance", "Reveal orchestration or verification did not pick up the submission", "Check project mode, commit-window timing, and whether the protocol moved into the correct workflow branch"],
					],
				},
			],
		},
		{
			id: "read-model-and-routing-issues",
			anchor: { id: "read-model-and-routing-issues", label: "Read-Model and Routing Issues" },
			title: "Read-Model and Routing Issues",
			summary: "Symptoms where the docs or app surface do not match the protocol path.",
			blocks: [
				{
					type: "list",
					style: "unordered",
					items: [
						"If `/docs` is missing, verify the docs feature flag and rebuild path before assuming the content itself is wrong.",
						"If project or dashboard reads fall back to preview data, treat that as a read-model problem first, not as evidence that the protocol lifecycle is empty.",
						"If a deep docs route behaves unexpectedly, confirm the flat `/docs/<slug>` manifest path instead of testing unsupported nested routes.",
						"If a page narrative conflicts with the product surface, prefer the lifecycle-aligned docs and then verify whether the product is simply behind the architecture.",
					],
				},
			],
		},
	],
} as const satisfies DocsPage;
