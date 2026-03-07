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
					text: "Welcome to the AntiSoon documentation. This portal is designed to answer two different questions: how the product works for researchers and project owners, and how the underlying contract plus workflow stack behaves for operators and contributors.",
				},
				{
					type: "paragraph",
					text: "Read this landing page as a map rather than a full manual. The sections below tell you which page to open next, what sort of evidence each page contains, and which guides are optimized for implementation detail versus operational usage.",
				},
				{
					type: "link-list",
					items: [
						{
							title: "Why AntiSoon",
							href: "/docs/why-antisoon",
							description: "Read the developer statement that explains why AntiSoon exists, what it critiques in current audit competitions, and what kind of decentralized alternative it is trying to build.",
						},
					],
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
				"Get up and running with the codebase, lifecycle model, and trust boundaries.",
			blocks: [
				{
					type: "paragraph",
					text: "Start here if you are trying to orient yourself in the implementation. These guides explain what the UI is expected to do, how lifecycle stages move through the system, and where trust boundaries sit without forcing you to read the full codebase in source order.",
				},
				{
					type: "link-list",
					items: [
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
							title: "Security",
							href: "/docs/security",
							description: "Trust boundaries, confidentiality, and adjudication safeguards.",
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
					type: "paragraph",
					text: "These pages are the usage manual for the product. They explain where to start, what page to open, what information to prepare, what screen feedback matters, and what result tells you your action actually worked.",
				},
				{
					type: "link-list",
					items: [
						{
							title: "Getting Started",
							href: "/docs/getting-started",
							description: "Choose your role, open the right route, and reach your first useful action quickly.",
						},
						{
							title: "Explore Projects",
							href: "/docs/explore-projects",
							description: "Use the explorer and project detail pages to choose a competition and decide whether to submit.",
						},
						{
							title: "Create a Project",
							href: "/docs/create-project",
							description: "Walk through the owner wizard from repository scan to on-chain registration.",
						},
						{
							title: "Submit a PoC",
							href: "/docs/submit-poc",
							description: "Move through the Builder step by step and know when your submission is actually complete.",
						},
						{
							title: "Dashboard & Leaderboard",
							href: "/docs/dashboard-and-leaderboard",
							description: "Read your own submission history and payouts, then compare public rankings once payouts land.",
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
					type: "paragraph",
					text: "Open the technical library when you need to reason about trust boundaries, workflow side effects, deployment expectations, or common operational failures. These pages prefer explicit tables, runbooks, and state descriptions over product copy.",
				},
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
	],
} as const satisfies DocsPage;
