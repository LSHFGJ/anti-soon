import type { DocsPage } from "../schema";

export const dataFlowDocsPage = {
	id: "data-flow",
	slug: "data-flow",
	href: "/docs/data-flow",
	locale: "en",
	title: "Data Flow",
	summary:
		"How project state, submissions, workflows, verdicts, and visibility move through the AntiSoon protocol path.",
	sections: [
		{
			id: "protocol-pipeline",
			anchor: { id: "protocol-pipeline", label: "Protocol Pipeline" },
			title: "Protocol Pipeline",
			summary: "The top-level state machine from registration to settlement.",
			blocks: [
				{
					type: "paragraph",
					text: "The AntiSoon protocol flow moves through encrypted commitment, workflow-owned reveal, strict verification and evidence generation via `verify-poc`, `jury-orchestrator` adjudication or owner fallback for non-strict cases, result write-back, and finally settlement-visible state in `BountyHub`.",
				},
				{
					type: "mermaid",
					diagram:
						"flowchart TD\nA[Project registration] --> B[VNet initialization]\nB --> C[Encrypted commit path]\nC --> D[Workflow reveal orchestration]\nD --> E[Strict verification]\nE --> F{Strict pass}\nF -->|yes| G[Final validity]\nF -->|no| H[Confidential jury]\nH --> I{Consensus}\nI -->|yes| G\nI -->|no| J[Owner adjudication]\nJ --> G\nG --> K{MULTI and H/M}\nK -->|yes| L[Similarity grouping]\nK -->|no| M[Result packaging]\nL --> M\nM --> N[Report write-back]\nN --> O[Settlement-visible state]",
					caption:
						"The protocol pipeline is staged, branch-aware, and workflow-assisted rather than a single transaction-driven lifecycle.",
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
			summary: "How UNIQUE and MULTI projects drive reveal after commitment.",
			blocks: [
				{
					type: "paragraph",
					text: "The frontend prepares the encrypted commit path, but the reveal and verification phases are orchestrated by protocol workflows. UNIQUE projects trigger reveal individually, while MULTI projects use batch reveal after the commit deadline.",
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
					text: "After reveal, the protocol loads the payload into `verify-poc`, computes strict metrics and evidence, and either prepares a deterministic strict-pass package or escalates to the `jury-orchestrator` adjudication surface for confidential consensus and possible owner adjudication.",
				},
				{
					type: "steps",
					items: [
						{
							title: "Verification loads the confidential payload",
							body: "`verify-poc` loads the submission metadata and confidential payload, then replays the exploit in Tenderly.",
						},
						{
							title: "Strict metrics and evidence are evaluated",
							body: "Strict metrics such as drain behavior determine whether the case can take a direct validity path, and the verification trace becomes evidence for the next step.",
						},
						{
							title: "Non-strict cases enter the jury block",
							body: "Non-strict cases move into the `jury-orchestrator` workflow, where hidden opinions are aggregated before a final validity signal is chosen.",
						},
						{
							title: "Owner adjudication remains the fallback",
							body: "If consensus does not resolve the case, owner adjudication supplies the final judgment path.",
						},
						{
							title: "Final results are written back",
							body: "The accepted final package is written back through the authorized report surface and later becomes settlement-visible state, including payout and grouping data.",
						},
					],
				},
				{
					type: "table",
					columns: ["Stage", "Primary output", "Who reads it next"],
					rows: [
						["Strict gate", "Strict-pass package or adjudication handoff", "Result packaging or confidential jury"],
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
			summary: "The detailed path for non-strict cases after Tenderly verification.",
			blocks: [
				{
					type: "paragraph",
					text: "The `jury-orchestrator` block handles cases where strict verification does not settle the result directly. It dispatches the PoC to a ten-node jury of LLM and human jurors, each returning one final validity opinion.",
				},
				{
					type: "steps",
					items: [
						{
							title: "Strict gate fails",
							body: "The submission does not satisfy deterministic strict-verification conditions in `verify-poc`, so the protocol routes it into the `jury-orchestrator` block.",
						},
						{
							title: "Dispatch a mixed ten-node jury",
						body: "The system sends the PoC plus the full verification trace to 5 LLM jurors with different base models and 5 human jurors selected through recorded human-selection provenance.",
						},
						{
							title: "Store all opinions confidentially",
							body: "Each of the 10 jurors emits one final validity opinion, and all opinions are stored in the Oasis confidential layer rather than becoming immediately visible to the network or to other jurors.",
						},
						{
						title: "Wait for the jury deadline",
						body: "Consensus occurs after the submission's derived jury deadline closes. The protocol retrieves the confidential opinions and aggregates them to form a final verdict.",
						},
						{
							title: "Consensus or escalation",
							body: "If the ten-node jury reaches consensus, that result becomes the adjudication signal used for final packaging. If not, the protocol opens owner adjudication and requires an owner testimony plus final judgment before the adjudication deadline.",
						},
					],
				},
				{
					type: "table",
					columns: ["Branch", "Output", "Next step"],
					rows: [
						["Ten-node consensus forms", "Final validity signal is one of `High`, `Medium`, or `Invalid`", "Proceed to final packaging, then optionally MULTI-mode grouping"],
						["Consensus fails", "Project owner must submit final judgment and owner testimony", "`jury-orchestrator` checks testimony and judgment consistency before an adjudicated package is written back"],
						["MULTI with H/M", "Verdict enters LLM-only similarity analysis consensus", "Produce `solo` and `duplicate` clusters for the final result package"],
					],
				},
				{
					type: "paragraph",
					text: "This flow keeps verdict collection confidential until the deadline while preserving BountyHub as the irreversible state surface that accepts or rejects the resulting package.",
				},
			],
		},
	],
} as const satisfies DocsPage;
