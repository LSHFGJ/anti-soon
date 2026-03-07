import type { DocsPage } from "../schema";

export const dataFlowDocsPage = {
	id: "data-flow",
	slug: "data-flow",
	href: "/docs/data-flow",
	locale: "en",
	title: "Data Flow",
	summary: "How project state, submissions, workflows, verdicts, and visibility move through the intended AntiSoon protocol path.",
	sections: [
		{
			id: "protocol-pipeline",
			anchor: { id: "protocol-pipeline", label: "Protocol Pipeline" },
			title: "Protocol Pipeline",
			summary: "The top-level state machine from registration to settlement.",
			blocks: [
				{
					type: "paragraph",
					text: "The intended protocol flow in `antisoon-current-lifecycle.mmd` is broader than a simple commit-reveal-verify loop. It starts with project bootstrap and VNet activation, then moves through encrypted commitment, workflow-owned reveal orchestration, strict verification, possible jury or adjudication branching, result write-back, and finally settlement-visible state.",
				},
				{
					type: "mermaid",
					diagram:
						"flowchart TD\nA[Project registration] --> B[VNet initialization]\nB --> C[Encrypted commit path]\nC --> D[Workflow reveal orchestration]\nD --> E[Strict verification]\nE --> F{Strict pass}\nF -->|yes| G[Final validity]\nF -->|no| H[Confidential jury]\nH --> I{Consensus}\nI -->|yes| G\nI -->|no| J[Owner adjudication]\nJ --> G\nG --> K{MULTI and H/M}\nK -->|yes| L[Similarity grouping]\nK -->|no| M[Result packaging]\nL --> M\nM --> N[Report write-back]\nN --> O[Settlement-visible state]",
					caption: "The protocol pipeline is staged, branch-aware, and workflow-assisted rather than a single transaction-driven lifecycle.",
				},
				{
					type: "callout",
					tone: "info",
					title: "Mixed documentation mode",
					body: [
						"This page follows the intended protocol path from the lifecycle diagram, not only the currently simplified product surface.",
						"Where the live UI is still catching up, treat this page as the target system model for how data should move through AntiSoon.",
					],
				},
			],
		},
		{
			id: "mode-dependent-reveal-orchestration",
			anchor: {
				id: "mode-dependent-reveal-orchestration",
				label: "Mode-Dependent Reveal Orchestration",
			},
			title: "Mode-Dependent Reveal Orchestration",
			summary: "UNIQUE and MULTI projects do not progress through reveal in the same way.",
			blocks: [
				{
					type: "paragraph",
					text: "Reveal is not just a user manually pressing a second button. In the intended design, the frontend is responsible for preparing and confirming the encrypted commit path, but the reveal phase is orchestrated by protocol workflows after commitment. That orchestration differs by project mode.",
				},
				{
					type: "table",
					columns: ["Mode", "Trigger", "Reveal behavior", "Visibility implication"],
					rows: [
						[
							"UNIQUE",
							"Submission commitment plus workflow follow-up",
							"The workflow path listens to the committed submission and later drives the reveal branch for that individual case.",
							"The submission is not generally public before the protocol reaches the reveal point.",
						],
						[
							"MULTI",
							"Commit-window cron registered at project bootstrap",
							"The system waits through the commit-only period, then scans committed submissions and auto-reveals them in batch once the commit deadline is reached.",
							"The protocol can preserve submitter advantage during the commit window while still coordinating later batch visibility.",
						],
					],
				},
				{
					type: "steps",
					items: [
						{
							title: "Commit is confirmed",
							body: "The submission becomes a real protocol object only after the chain confirms a `PoCCommitted` event and the frontend has a trustworthy submission identifier.",
						},
						{
							title: "Mode logic takes over",
							body: "UNIQUE and MULTI projects diverge. UNIQUE uses submission-triggered workflow logic, while MULTI relies on commit-window scheduling that starts at registration time.",
						},
						{
							title: "Contract reveal rules still guard truth",
							body: "Even when workflows orchestrate reveal, the contract still enforces the reveal hash and salt rules before a submission can become truly revealed.",
						},
					],
				},
			],
		},
		{
			id: "verdict-and-settlement-paths",
			anchor: { id: "verdict-and-settlement-paths", label: "Verdict and Settlement Paths" },
			title: "Verdict and Settlement Paths",
			summary: "How verification branches become final protocol results.",
			blocks: [
				{
					type: "paragraph",
					text: "After reveal, the data flow no longer belongs to the submitter alone. The protocol loads the payload into verification, computes strict metrics, and either finalizes through a deterministic strict-pass route or escalates to confidential consensus and possible owner adjudication before writing the final package back to BountyHub.",
				},
				{
					type: "steps",
					items: [
						{
							title: "Verification loads the confidential payload",
							body: "`verify-poc` loads the submission metadata and confidential payload, then replays the exploit in Tenderly.",
						},
						{
							title: "Strict metrics are evaluated",
							body: "Strict metrics such as drain behavior determine whether the case can take a direct validity path.",
						},
						{
							title: "Non-strict cases enter the jury block",
							body: "Non-strict cases move into the confidential jury block, where hidden opinions are aggregated before a final validity signal is chosen.",
						},
						{
							title: "Owner adjudication remains the fallback",
							body: "If consensus does not resolve the case, owner adjudication supplies the final judgment path.",
						},
						{
							title: "Final results are written back",
							body: "The final package is written back through the authorized report surface and later becomes settlement-visible state, including payout and grouping data.",
						},
					],
				},
				{
					type: "table",
					columns: ["Stage", "Primary output", "Who reads it next"],
					rows: [
						["Strict gate", "H/M pass or escalation decision", "Result packaging or confidential jury"],
						["Confidential jury", "Consensus verdict or no-consensus state", "Result packaging or owner adjudication"],
						["Owner adjudication", "Adjudicated final validity", "Result packaging"],
						["Result write-back", "Protocol-persisted verdict and grouping data", "Settlement logic, explorer, dashboard, leaderboard"],
					],
				},
			],
		},
		{
			id: "confidential-jury-flow",
			anchor: { id: "confidential-jury-flow", label: "Confidential Jury Flow" },
			title: "Confidential Jury Flow",
			summary: "The detailed intended path for non-strict cases after Tenderly verification.",
			blocks: [
				{
					type: "paragraph",
					text: "The original protocol design treats the jury block as a concrete delayed-consensus flow. When strict verification does not settle the case directly, the protocol assembles the PoC and full verification trace, dispatches them to 5 LLM jurors using different base models and 5 human jurors chosen through VRF randomness, and requires each of those 10 jurors to return one final validity opinion.",
				},
				{
					type: "steps",
					items: [
						{
							title: "Strict gate fails",
							body: "The submission does not satisfy the deterministic strict-verification conditions, so the protocol routes it into the jury block instead of finalizing immediately.",
						},
						{
							title: "Dispatch a mixed ten-node jury",
							body: "The system sends the PoC plus the full verification trace to 5 LLM jurors with different base models and 5 human jurors selected by VRF randomness.",
						},
						{
							title: "Store all opinions confidentially",
							body: "Each of the 10 jurors emits one final validity opinion, and all opinions are stored in the Oasis confidential layer rather than becoming immediately visible to the network or to other jurors.",
						},
						{
							title: "Wait for the verification window deadline",
							body: "Consensus does not happen immediately. The protocol waits until the verification window closes, then retrieves the confidential opinions and aggregates them together.",
						},
						{
							title: "Consensus or escalation",
							body: "If the 10-node jury reaches consensus, that result becomes the final validity. If not, the protocol opens owner adjudication and requires an owner testimony plus final judgment during the dispute window.",
						},
					],
				},
				{
					type: "table",
					columns: ["Branch", "Output", "Next step"],
					rows: [
						["Ten-node consensus forms", "Final validity is one of `High`, `Medium`, or `Invalid`", "Proceed to final packaging, then optionally MULTI-mode grouping"],
						["Consensus fails", "Project owner must submit final judgment and owner testimony", "LLM consensus checks testimony and judgment consistency before adjudicated validity is produced"],
						["MULTI with H/M", "Verdict enters LLM-only similarity analysis consensus", "Produce `solo` and `duplicate` clusters for the final result package"],
					],
				},
				{
					type: "callout",
					tone: "info",
					title: "Implementation-status note",
					body: [
						"This is the intended protocol path from the original design text and lifecycle diagram.",
						"The current implementation still abstracts much of this into broader jury/adjudication scaffolding, so this section should be read as the target data-flow contract for the system.",
					],
				},
			],
		},
	],
} as const satisfies DocsPage;
