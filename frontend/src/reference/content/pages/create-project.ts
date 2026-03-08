import type { DocsPage } from "../schema";

export const createProjectDocsPage = {
	id: "create-project",
	slug: "create-project",
	href: "/docs/create-project",
	locale: "en",
	title: "Create a Project",
	summary: "How an owner uses the Create Project wizard from repository scan to on-chain registration.",
	sections: [
		{
			id: "project-bootstrap",
			anchor: { id: "project-bootstrap", label: "Before You Open the Wizard" },
			title: "Before You Open the Wizard",
			summary: "What an owner should prepare before starting `/create-project`.",
			blocks: [
				{
					type: "paragraph",
					text: "Open `/create-project` only after you have the repository, scope, funding, and rule inputs ready. The wizard is structured and strict: it expects a public GitHub repository, a selectable deploy script, at least one contract in scope, and complete bounty and rule settings before it will let you submit.",
				},
				{
					type: "list",
					style: "unordered",
					items: [
						"A public GitHub repository URL that points to the codebase being reviewed.",
						"Foundry deployment scripts in the repository's `script/` directory, because the first wizard step scans that folder for `*.s.sol` files.",
						"A clear idea of which deploy script and contracts belong in scope before you start clicking through the wizard.",
						"Enough ETH for the bounty pool you plan to fund, plus gas for the registration transaction.",
						"Concrete rule values for deadlines, attacker seed, warp allowance, impersonation, dispute window, and the current payout bands.",
					],
				},
			],
		},
		{
			id: "mode-and-deadline-design",
			anchor: { id: "mode-and-deadline-design", label: "Complete the Wizard" },
			title: "Complete the Wizard",
			summary: "What each step in the Create Project flow asks you to provide.",
			blocks: [
				{
					type: "steps",
					items: [
						{
							title: "Repository",
							body: "Paste a GitHub repository URL and click `SCAN`. The step succeeds only when the page finds at least one Foundry deployment script and tells you to continue.",
						},
						{
							title: "Script",
							body: "Choose the deploy script that matches the contracts you want audited. This decides which contract names the scope step can show you.",
						},
						{
							title: "Scope",
							body: "Select the contracts that belong in the audit scope. The wizard will not let you continue with an empty scope.",
						},
						{
							title: "Bounty",
							body: "Enter the bounty pool, max payout per bug, competition mode, commit deadline, and reveal deadline. The form enforces that max payout cannot exceed the pool and the reveal deadline must be after the commit deadline.",
						},
						{
							title: "Rules and thresholds",
							body: "Set attacker seed, warp allowance, impersonation, dispute window, and the ETH drain thresholds for the `HIGH` and `MEDIUM` payout bands. The frontend derives the legacy outer bands automatically for compatibility.",
						},
						{
							title: "Review",
							body: "Check the summary screen before you sign. This is your last chance to spot a wrong repo URL, payout number, deadline, or other project settings before the transaction is sent.",
						},
					],
				},
				{
					type: "table",
					columns: ["Field", "What you choose", "Practical guidance"],
					rows: [
						[
							"Mode",
							"`UNIQUE` or `MULTI`.",
							"Choose `UNIQUE` when you want a first-valid style competition. Choose `MULTI` when you want batch handling and later comparison across multiple valid submissions.",
						],
						[
							"Commit and reveal deadlines",
							"How long the competition stays open and how long the reveal window lasts.",
							"Make the commit window long enough for serious researchers to participate, but short enough that the project still feels active and manageable.",
						],
						[
							"Bounty pool and max payout",
							"How much ETH you fund and how much one bug can earn.",
							"Keep max payout realistic relative to the pool so the campaign is attractive without being impossible to settle.",
						],
						[
							"Verification rules and thresholds",
							"Technical limits and severity boundaries.",
							"Choose values you can defend later, because they directly shape how the project is judged and what payouts look like.",
						],
					],
				},
			],
		},
		{
			id: "registration-and-activation",
			anchor: { id: "registration-and-activation", label: "After You Submit" },
			title: "After You Submit",
			summary: "What success looks like, and the most common reasons the wizard stops you.",
			blocks: [
				{
					type: "paragraph",
					text: "When the final review step succeeds, the page sends `registerProjectV2`, stores the transaction hash, and then redirects you to `/explorer` after a short delay. In practice, your job is to confirm that the wallet transaction completed, note the tx hash if you need it, and then verify in the explorer that the new project appears with the mode and payout configuration you expected.",
				},
				{
					type: "table",
					columns: ["If you see this", "What it means", "What to do"],
					rows: [
						["`Wallet not connected`", "The wizard cannot send the transaction.", "Connect your wallet first, then return to the review step."],
						["`Invalid GitHub repository URL` or `No Foundry deployment scripts found`", "The repository scan step could not prepare the project context.", "Fix the repo URL or make sure the repo exposes deploy scripts in `script/` before trying again."],
						["`Select a deployment script` or `Select at least one contract in scope`", "A required early wizard step is incomplete.", "Go back and finish the script or scope step before moving on."],
						["`Reveal deadline must be after commit deadline`", "Your timing configuration is invalid.", "Increase the reveal deadline so it is strictly later than the commit deadline."],
						["`Max payout` exceeds `bounty pool`", "The payout settings are internally inconsistent.", "Lower the max payout or fund a larger bounty pool."],
						["A tx hash appears and you are redirected to `/explorer`", "The registration transaction was sent successfully.", "Open the new project from the explorer and confirm the mode and payout numbers match what you intended."],
					],
				},
			],
		},
	],
} as const satisfies DocsPage;
