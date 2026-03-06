import type { DocsPage } from "./schema";

export const overviewDocsPage = {
	id: "overview",
	slug: "overview",
	href: "/docs",
	locale: "en",
	title: "Docs Overview",
	summary:
		"AntiSoon keeps docs content as committed TypeScript data so later rendering stays deterministic, offline, and easy to validate.",
	sections: [
		{
			id: "overview",
			anchor: {
				id: "overview",
				label: "Overview",
			},
			title: "Overview",
			summary:
				"The docs landing page exposes stable section anchors so direct /docs#... links resolve against committed content.",
			blocks: [
				{
					type: "paragraph",
					text: "This page is the canonical docs entrypoint. Each section below keeps a stable anchor id so hash links land on real content instead of synthetic client-side state.",
				},
			],
		},
		{
			id: "why-this-contract-exists",
			anchor: {
				id: "why-this-contract-exists",
				label: "Why this contract exists",
			},
			title: "Why this contract exists",
			summary:
				"The docs source stays lightweight and schema-driven instead of introducing markdown parsing or generated artifacts.",
			blocks: [
				{
					type: "paragraph",
					text: "Canonical docs content lives under src/reference/content as plain objects with stable ids, summaries, and rendering-ready blocks.",
				},
				{
					type: "list",
					style: "unordered",
					items: [
						"Every page has a stable slug and href for future /docs rendering.",
						"Every section carries an explicit anchor contract for in-page navigation.",
						"Every block stays JSON-friendly so the source is safe to commit and test.",
					],
				},
			],
		},
		{
			id: "validation-rules",
			anchor: {
				id: "validation-rules",
				label: "Validation rules",
			},
			title: "Validation rules",
			summary:
				"Malformed content fails fast with path-aware errors so bad fixtures never silently ship.",
			blocks: [
				{
					type: "callout",
					tone: "info",
					title: "Offline-first docs",
					body: [
						"The content contract is runtime-validated during tests and when the canonical manifest is defined.",
						"Later tasks can render these blocks directly without changing the current placeholder route behavior.",
					],
				},
				{
					type: "steps",
					items: [
						{
							title: "Author",
							body: "Write docs pages as plain objects with stable metadata and structured blocks.",
						},
						{
							title: "Validate",
							body: "Run the docs schema tests so malformed ids, anchors, or callouts throw immediately.",
						},
						{
							title: "Render later",
							body: "Future rollout tasks can map block types to UI components without changing the content source.",
						},
					],
				},
			],
		},
	],
} as const satisfies DocsPage;
