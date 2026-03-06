import type { DocsPage } from "../schema";

export const operationsDocsPage = {
	id: "operations",
	slug: "operations",
	href: "/docs/operations",
	locale: "en",
	title: "Operations",
	summary: "Runbooks and operational procedures.",
	sections: [
		{
			id: "environment-and-workflow-inventory",
			anchor: { id: "environment-and-workflow-inventory", label: "Environment and Workflow Inventory" },
			title: "Environment and Workflow Inventory",
			summary: "Current environments and workflows.",
			blocks: [
				{
					type: "paragraph",
					text: "The platform relies on two main Chainlink CRE workflows: `verify-poc` for assessing submissions against a live Tenderly vNet, and `vnet-init` for initializing the environment. A separate `auto-reveal-relayer` runs as a Node.js process to execute queued reveals.",
				},
			],
		},
		{
			id: "contracts-sync-and-build-gates",
			anchor: { id: "contracts-sync-and-build-gates", label: "Contracts Sync and Build Gates" },
			title: "Contracts Sync and Build Gates",
			summary: "Pre-deployment synchronization.",
			blocks: [
				{
					type: "paragraph",
					text: "Prior to deploying the frontend, operators must run the contract sync tasks to ensure the UI has the latest BountyHub ABI and addresses. The pipeline strictly enforces docs quality through GitHub actions (e.g., `docs-scope-quality-gate.yml`) to prevent regression in the offline-first authoring process.",
				},
			],
		},
		{
			id: "incident-response",
			anchor: { id: "incident-response", label: "Incident Response" },
			title: "Incident Response",
			summary: "Handling operational failures.",
			blocks: [
				{
					type: "paragraph",
					text: "If the `verify-poc` workflow fails due to Tenderly rate limits or RPC issues, the submission will remain in a pending state. Operators should verify workflow status via the CRE CLI and assess event logs. Incidents affecting docs routing can be mitigated by disabling the docs feature flag.",
				},
			],
		},
		{
			id: "rollback-and-recovery",
			anchor: { id: "rollback-and-recovery", label: "Rollback and Recovery" },
			title: "Rollback and Recovery",
			summary: "Strategies for safe rollback.",
			blocks: [
				{
					type: "paragraph",
					text: "The static nature of the documentation means that feature flags control visibility. If bad content or routing is shipped, ops can toggle the `VITE_ENABLE_DOCS` flag to `false` and rebuild the site, effectively hiding the `/docs` path while the underlying issue is resolved.",
				},
			],
		},
		{
			id: "operational-limits",
			anchor: { id: "operational-limits", label: "Operational Limits" },
			title: "Operational Limits",
			summary: "Rate limits and system boundaries.",
			blocks: [
				{
					type: "paragraph",
					text: "The system enforces a 10-minute cooldown per auditor per project for PoC submissions to prevent spam. Workflows are bounded by a strict 5 HTTP request budget to comply with CRE execution limits. Dispute windows restrict payout finalization until the timeout elapses.",
				},
			],
		},
	],
} as const satisfies DocsPage;
