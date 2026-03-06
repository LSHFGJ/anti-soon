import type { DocsPage } from "./schema";

export const overviewDocsPage = {
	id: "overview",
	slug: "overview",
	href: "/docs",
	locale: "en",
	title: "Docs Overview",
	summary:
		"AntiSoon keeps docs content as committed TypeScript data so later rendering stays deterministic, offline, and easy to validate. This page serves as the canonical landing page to explore all documentation.",
	sections: [
		{
			id: "overview",
			anchor: {
				id: "overview",
				label: "Overview",
			},
			title: "Overview",
			summary:
				"The docs landing page exposes stable section anchors and grouped entry points for all technical and user guides.",
			blocks: [
				{
					type: "paragraph",
					text: "Welcome to the AntiSoon documentation. This landing page aggregates all child guides into logical sections. Use the link lists below to jump directly into technical deep-dives or user workflows.",
				},
			],
		},
		{
			id: "developer-quick-paths",
			anchor: {
				id: "developer-quick-paths",
				label: "Developer Quick Paths",
			},
			title: "Developer Quick Paths",
			summary:
				"Get up and running with the codebase, architecture, and API contracts.",
			blocks: [
				{
					type: "link-list",
					items: [
						{
							title: "Getting Started",
							href: "/docs/getting-started",
							description: "Developer setup and initial onboarding.",
						},
						{
							title: "Architecture",
							href: "/docs/architecture",
							description: "System architecture and module boundaries.",
						},
						{
							title: "Data Flow",
							href: "/docs/data-flow",
							description: "Data processing and state transitions.",
						},
						{
							title: "API & Contracts",
							href: "/docs/api-and-contracts",
							description: "API boundaries and data contracts.",
						},
					],
				},
			],
		},
		{
			id: "user-workflows",
			anchor: {
				id: "user-workflows",
				label: "User Workflows",
			},
			title: "User Workflows",
			summary:
				"Guides on how to use the platform, create projects, and submit PoCs.",
			blocks: [
				{
					type: "link-list",
					items: [
						{
							title: "Explore Projects",
							href: "/docs/explore-projects",
							description: "How to navigate and filter available projects.",
						},
						{
							title: "Create a Project",
							href: "/docs/create-project",
							description: "Guidelines and workflow for starting new projects.",
						},
						{
							title: "Submit a PoC",
							href: "/docs/submit-poc",
							description:
								"Workflows for creating and submitting Proofs of Concept.",
						},
						{
							title: "Dashboard & Leaderboard",
							href: "/docs/dashboard-and-leaderboard",
							description: "Metrics, tracking, and community standings.",
						},
					],
				},
			],
		},
		{
			id: "technical-library",
			anchor: {
				id: "technical-library",
				label: "Technical Library",
			},
			title: "Technical Library",
			summary:
				"In-depth reference material covering security, operations, and troubleshooting.",
			blocks: [
				{
					type: "link-list",
					items: [
						{
							title: "Security",
							href: "/docs/security",
							description: "Security posture and threat models.",
						},
						{
							title: "Operations",
							href: "/docs/operations",
							description: "Runbooks and operational procedures.",
						},
						{
							title: "Troubleshooting",
							href: "/docs/troubleshooting",
							description: "Guides for common issues and failures.",
						},
						{
							title: "Glossary",
							href: "/docs/glossary",
							description: "Definitions for domains and ubiquitous language.",
						},
					],
				},
			],
		},
		{
			id: "docs-contract",
			anchor: {
				id: "docs-contract",
				label: "Docs Contract",
			},
			title: "Docs Contract",
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
						"Every page has a stable slug and href used by the current /docs experience.",
						"Every section carries an explicit anchor contract for in-page navigation.",
						"Every block stays JSON-friendly so the source is safe to commit and test.",
					],
				},
				{
					type: "callout",
					tone: "info",
					title: "Offline-first docs",
					body: [
						"The content contract is runtime-validated during tests and when the canonical manifest is defined.",
					],
				},
			],
		},
	],
} as const satisfies DocsPage;
