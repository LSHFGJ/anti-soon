import type { DocsPage } from "../schema";

export const gettingStartedDocsPage = {
	id: "getting-started",
	slug: "getting-started",
	href: "/docs/getting-started",
	locale: "en",
	title: "Getting Started",
	summary: "Developer setup and initial onboarding.",
	sections: [
		{
			id: "what-antisoon-does",
			anchor: {
				id: "what-antisoon-does",
				label: "What AntiSoon Does",
			},
			title: "What AntiSoon Does",
			summary: "Overview of the AntiSoon protocol.",
			blocks: [
				{
					type: "paragraph",
					text: "AntiSoon provides decentralized vulnerability verification powered by Chainlink CRE. It allows security researchers to submit a Proof of Concept (PoC), get it verified by decentralized nodes via Tenderly simulations, and receive a bounty payout trustlessly.",
				},
				{
					type: "steps",
					items: [
						{
							title: "Submit PoC",
							body: "Upload your proof-of-concept exploit code.",
						},
						{
							title: "CRE Verifies",
							body: "Decentralized nodes validate the hash.",
						},
						{
							title: "Simulation",
							body: "A Tenderly sandbox executes the attack securely.",
						},
						{
							title: "Payout",
							body: "The smart contract pays immediately only when no dispute window is configured; otherwise the verified payout remains escrowed until finalization after the dispute window.",
						},
					],
				},
			],
		},
		{
			id: "prerequisites",
			anchor: {
				id: "prerequisites",
				label: "Prerequisites",
			},
			title: "Prerequisites",
			summary: "What you need before using the platform.",
			blocks: [
				{
					type: "paragraph",
					text: "To interact with AntiSoon on-chain features, you need a Web3 wallet connected to the Sepolia testnet. The platform uses Reown AppKit for wallet connections.",
				},
				{
					type: "callout",
					tone: "info",
					title: "Network Requirement",
					body: [
						"Ensure your wallet is configured for the Sepolia network. The application does not currently support mainnet deployments.",
					],
				},
			],
		},
		{
			id: "first-route-choices",
			anchor: {
				id: "first-route-choices",
				label: "First Route Choices",
			},
			title: "First Route Choices",
			summary: "Navigating the platform.",
			blocks: [
				{
					type: "paragraph",
					text: "When you arrive at the platform, you have two primary actions available from the hero section:",
				},
				{
					type: "list",
					style: "unordered",
					items: [
						"Submit PoC: Navigates to the Builder (/builder) where you can construct and upload your exploit payload.",
						"View Bounties: Navigates to the Explorer (/explorer) to browse available projects and their active bounties.",
					],
				},
			],
		},
		{
			id: "wallet-and-docs-visibility",
			anchor: {
				id: "wallet-and-docs-visibility",
				label: "Wallet and Docs Visibility",
			},
			title: "Wallet and Docs Visibility",
			summary: "Accessing documentation without a wallet.",
			blocks: [
				{
					type: "paragraph",
					text: "You can read this documentation and browse the landing page without connecting a wallet. However, core functionalities like creating a project or submitting a PoC require an active Web3 session.",
				},
			],
		},
		{
			id: "next-steps",
			anchor: {
				id: "next-steps",
				label: "Next Steps",
			},
			title: "Next Steps",
			summary: "Where to go from here.",
			blocks: [
				{
					type: "paragraph",
					text: "Once you have your wallet connected to Sepolia, explore the following guides to start using AntiSoon.",
				},
				{
					type: "link-list",
					items: [
						{
							title: "Submit a PoC",
							href: "/docs/submit-poc",
							description: "Learn how to use the Builder to submit an exploit.",
						},
						{
							title: "Explore Projects",
							href: "/docs/explore-projects",
							description: "Browse existing bug bounties and find targets.",
						},
					],
				},
			],
		},
	],
} as const satisfies DocsPage;
