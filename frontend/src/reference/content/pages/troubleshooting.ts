import type { DocsPage } from "../schema";

export const troubleshootingDocsPage = {
	id: "troubleshooting",
	slug: "troubleshooting",
	href: "/docs/troubleshooting",
	locale: "en",
	title: "Troubleshooting",
	summary: "Guides for common issues and failures.",
	sections: [
		{
			id: "docs-route-not-visible",
			anchor: { id: "docs-route-not-visible", label: "Docs route not visible" },
			title: "Docs route not visible",
			summary: "Symptom: The /docs route returns a 404 or the nav link is missing.",
			blocks: [
				{
					type: "paragraph",
					text: "This usually occurs if the `VITE_ENABLE_DOCS` environment variable is not set to true or 1. Verify your environment file or build settings and ensure the flag is active before running the application.",
				},
			],
		},
		{
			id: "contract-sync-mismatch",
			anchor: { id: "contract-sync-mismatch", label: "Contract sync mismatch" },
			title: "Contract sync mismatch",
			summary: "Symptom: Operations fail due to ABI mismatches or incorrect addresses.",
			blocks: [
				{
					type: "paragraph",
					text: "If you see legacy submission mode errors or transaction reverts, you likely have an outdated `frontend/src/config.ts`. Run the contract sync script to pull the latest `BountyHub` ABI and address, then rebuild the frontend.",
				},
			],
		},
		{
			id: "preview-fallback-or-blockchain-reads-failing",
			anchor: { id: "preview-fallback-or-blockchain-reads-failing", label: "Preview fallback or blockchain reads failing" },
			title: "Preview fallback or blockchain reads failing",
			summary: "Symptom: The dashboard shows demo data (DummyVault) instead of live project state.",
			blocks: [
				{
					type: "paragraph",
					text: "The frontend falls back to demo static projects if it cannot successfully fetch live state from the configured RPC. Check the browser console to see if the network request to the viem provider is failing or if the chain is incorrectly configured.",
				},
			],
		},
		{
			id: "wallet-connectivity-failures",
			anchor: { id: "wallet-connectivity-failures", label: "Wallet/connectivity failures" },
			title: "Wallet/connectivity failures",
			summary: "Symptom: Unable to connect wallet or transactions fail to broadcast.",
			blocks: [
				{
					type: "paragraph",
					text: "Ensure the user's wallet is set to the correct network (e.g., Sepolia testnet) and they have sufficient ETH for gas. Check if the frontend configuration matches the injected provider's chain ID.",
				},
			],
		},
		{
			id: "unknown-docs-path-behavior",
			anchor: { id: "unknown-docs-path-behavior", label: "Unknown docs path behavior" },
			title: "Unknown docs path behavior",
			summary: "Symptom: Deep linking into a child docs route redirects to the main docs index or fails.",
			blocks: [
				{
					type: "paragraph",
					text: "The static routing structure only supports flat child routes (e.g., `/docs/security`). Ensure you are not navigating to nested directories that are not defined in the manifest ordering.",
				},
			],
		},
	],
} as const satisfies DocsPage;
