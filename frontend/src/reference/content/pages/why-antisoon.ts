import type { DocsPage } from "../schema";

export const whyAntiSoonDocsPage = {
	id: "why-antisoon",
	slug: "why-antisoon",
	href: "/docs/why-antisoon",
	locale: "en",
	title: "Why AntiSoon",
	summary: "A developer statement on why AntiSoon exists and what it is trying to change in smart contract audit competitions.",
	sections: [
		{
			id: "why-antisoon",
			anchor: {
				id: "why-antisoon",
				label: "Why AntiSoon",
			},
			title: "Why AntiSoon",
			summary: "An English rendering of the developer's original statement.",
			blocks: [
				{
					type: "paragraph",
					text: "AntiSoon is meant to be a genuinely decentralized smart contract audit competition platform, powered by Chainlink and Tenderly.",
				},
				{
					type: "paragraph",
					text: "I first came into this line of work because of something I read on Twitter: smart contract auditing was supposed to be a high-paying job, and all you had to do was find a bug, submit it into the project's smart contract security system, and collect a reward from the on-chain treasury. In two years of auditing, I have never earned a single dollar from a system that beautiful or that efficient.",
				},
				{
					type: "paragraph",
					text: "Mainstream platforms audit smart contracts, but they do not really run on smart contracts themselves. The process is still highly centralized. The only thing they reliably put on-chain is the money, because otherwise they might not be able to pay bounties at all 😂. Even then, where the money is and when it arrives are often opaque.",
				},
			],
		},
		{
			id: "what-broke-for-auditors",
			anchor: {
				id: "what-broke-for-auditors",
				label: "What Broke for Auditors",
			},
			title: "What Broke for Auditors",
			summary: "How delayed payout and opacity shape the auditor experience.",
			blocks: [
				{
					type: "paragraph",
					text: "Sometimes platforms publish a treasury address, or you can trace the wallet that paid you after the fact. But a common pattern is that the platform receives funds from the project only after a competition is already over. [Cantina](https://cantina.xyz/) is an example of this kind of flow: the process can be astonishingly slow, and auditors may wait weeks or even months after a contest ends before receiving payment. [Sherlock](https://audits.sherlock.xyz/) has seen similar delays.",
				},
				{
					type: "paragraph",
					text: "That means auditors are often working for what is effectively a blank check. We do not know what contract the platform and the project actually signed; we only know that the contract is not smart 😂. The project can still refuse to pay, especially if it is small enough that sacrificing some reputation or spinning a careful public narrative seems cheaper than honoring the reward.",
				},
				{
					type: "callout",
					tone: "warning",
					title: "The incentive problem is not theoretical",
					body: [
						"One of the most painful examples happened in [Immunefi's Spectra Finance competition](https://x.com/immunefi/status/1937177377093677247). The project refused to pay, Immunefi paid out of its own pocket to preserve auditor trust, and the project itself continued on as if nothing had happened.",
					],
				},
				{
					type: "paragraph",
					text: "Security auditing remains one of the weakest links in Web3. Too many projects consume trust without paying for it. From the auditor's perspective, the work is often treated as a way to preserve the project's image while squeezing more velocity out of cheap outside labor. If the project can rug and run and the platform can stall indefinitely, what exactly protects the auditor?",
				},
			],
		},
		{
			id: "why-existing-platforms-stay-centralized",
			anchor: {
				id: "why-existing-platforms-stay-centralized",
				label: "Why Existing Platforms Stay Centralized",
			},
			title: "Why Existing Platforms Stay Centralized",
			summary: "The structural limits the author sees in current bounty systems.",
			blocks: [
				{
					type: "paragraph",
					text: "Traditional audit competition platforms still make an enormous contribution to the Web3 security ecosystem. Their scale matters. They bring traffic, attention, and operational discipline. But from the auditor's point of view, the model still depends on a centralized intermediary that decides timing, trust, and ultimately whether the contest experience feels fair.",
				},
				{
					type: "paragraph",
					text: "So the question is not whether a platform provides value. The question is what that value should be. Could the platform become a trust-minimizing coordinator instead of a gatekeeper? Could the platform, in some cases, disappear into the protocol layer and survive only as a coordination surface?",
				},
				{
					type: "paragraph",
					text: "If you look only at the money, the answer is uncomfortable. [Immunefi](https://immunefi.com/vaults/) publicly shows structured bug-bounty payout-funding information for some programs through its vault feature. [HatsFinance](https://hats.finance/) went furthest in making vaults central to the process, but HatsFinance is no longer especially active. For auditors, everything before getting paid is abstract. Until money is actually secured and released, every promise about security is still a promise.",
				},
			],
		},
		{
			id: "what-antisoon-changes",
			anchor: {
				id: "what-antisoon-changes",
				label: "What AntiSoon Changes",
			},
			title: "What AntiSoon Changes",
			summary: "The author's thesis for a decentralized alternative.",
			blocks: [
				{
					type: "paragraph",
					text: "That is why I built AntiSoon. If you are in this field, you already know the word soon. Every time we say wen because we want the money we earned, the answer is often silence, a dead Discord server, or the same word that has haunted auditors for years: soon. That is insane.",
				},
				{
					type: "paragraph",
					text: "AntiSoon is meant to kill soon. In simple terms, if you participate in a bounty, the goal is that you receive the payout within minutes of submitting a valid PoC. If you participate in an audit contest, the goal is that you receive the payout within two days of the submission deadline. You should not have to spend your time bargaining with judges who say they cannot understand your report, or with project teams that only want to downgrade severity so they can avoid paying.",
				},
			],
		},
		{
			id: "how-chainlink-and-tenderly-make-this-possible",
			anchor: {
				id: "how-chainlink-and-tenderly-make-this-possible",
				label: "How Chainlink and Tenderly Make This Possible",
			},
			title: "How Chainlink and Tenderly Make This Possible",
			summary: "Why the current demo relies on these two systems.",
			blocks: [
				{
					type: "paragraph",
					text: "The answer starts with Chainlink Runtime Environment and Tenderly Virtual TestNet. Chainlink provides the decentralized execution substrate that can react to contract events, run the verification workflow, and write results back through the authorized path. Tenderly provides a reproducible virtual execution environment, so the platform can test the exploit path against a controlled fork instead of trusting a centralized reviewer to say whether the PoC worked.",
				},
				{
					type: "paragraph",
					text: "That is why AntiSoon is not just another front-end for collecting reports. The protocol tries to turn contest operations into something auditable, bounded, and eventually payable through explicit state transitions rather than human delay. The rest of this documentation explains how that works in detail.",
				},
			],
		},
		{
			id: "what-this-demo-still-cannot-solve",
			anchor: {
				id: "what-this-demo-still-cannot-solve",
				label: "What This Demo Still Cannot Solve",
			},
			title: "What This Demo Still Cannot Solve",
			summary: "A candid note on the limits of the current demo and the size of the market it targets.",
			blocks: [
				{
					type: "paragraph",
					text: "This project is a demo built with agentic engineering. I know very well that the demo still cannot solve many problems. Smart contract auditing is still a small world. Based on registration counts across the main platforms, the addressable audience may only be in the tens of thousands, and those people are still the main audience for AntiSoon.",
				},
				{
					type: "paragraph",
					text: "So this page is not a claim that the hardest social and economic problems have already been solved. It is a claim that if a system like this can truly land, it could materially change the security economics of Web3. The road is long, the market is narrow, and the incentives are still messy. That does not make the problem less worth solving.",
				},
			],
		},
		{
			id: "acknowledgements",
			anchor: {
				id: "acknowledgements",
				label: "Acknowledgements",
			},
			title: "Acknowledgements",
			summary: "A final note of thanks from the original statement.",
			blocks: [
				{
					type: "paragraph",
					text: "Finally, thank you again to Chainlink and Tenderly for the technical support behind this work. Without those systems, this demo would not have taken its current shape.",
				},
			],
		},
	],
} as const satisfies DocsPage;
