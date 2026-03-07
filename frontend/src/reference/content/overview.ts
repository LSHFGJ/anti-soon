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
	],
} as const satisfies DocsPage;
