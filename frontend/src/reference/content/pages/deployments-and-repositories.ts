import type { DocsPage } from "../schema";

export const deploymentsAndRepositoriesDocsPage = {
	id: "deployments-and-repositories",
	slug: "deployments-and-repositories",
	href: "/docs/deployments-and-repositories",
	locale: "en",
	title: "Addresses",
	summary: "Contract addresses and the canonical repository link.",
	sections: [
		{
			id: "contracts",
			anchor: { id: "contracts", label: "Contracts" },
			title: "Contracts",
			summary: "Committed on-chain contract addresses.",
			blocks: [
				{
					type: "table",
					columns: ["Contract", "Network", "Address"],
					rows: [
						[
							"BountyHub",
							"Sepolia",
							"0x17797b473864806072186f6997801D4473AAF6e8",
						],
						[
							"CRE Forwarder",
							"Sepolia",
							"0x15fC6ae953E024d975e77382eEeC56A9101f9F88",
						],
					],
				},
			],
		},
		{
			id: "repository",
			anchor: { id: "repository", label: "Repository" },
			title: "Repository",
			summary: "Canonical source repository.",
			blocks: [
				{
					type: "link-list",
					items: [
						{
							title: "AntiSoon GitHub",
							href: "https://github.com/LSHFGJ/anti-soon",
							description: "Canonical monorepo.",
						},
					],
				},
			],
		},
	],
} as const satisfies DocsPage;
