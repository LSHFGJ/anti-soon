import type { DocsPage } from "../schema";

export const architectureDocsPage = {
	id: "architecture",
	slug: "architecture",
	href: "/docs/architecture",
	locale: "en",
	title: "Architecture",
	summary:
		"How AntiSoon splits authority, execution, and verification across contracts, workflows, confidential storage, and the frontend.",
	sections: [
		{
			id: "system-model",
			anchor: { id: "system-model", label: "System Model" },
			title: "System Model",
			summary: "The architectural shape of the protocol and why each surface exists.",
			blocks: [
				{
					type: "paragraph",
					text: "The split between authority and execution is central to the protocol. BountyHub owns irreversible protocol truth, `verify-poc` owns strict verification and evidence generation, `jury-orchestrator` owns adjudication packaging for non-strict cases, OasisPoCStore owns confidential payload storage, and the frontend owns user coordination plus recovery UX.",
				},
				{
					type: "paragraph",
					text: "That split is deliberate. Commit and reveal state, final verdicts, grouping, disputes, and payouts must be chain-verifiable. Exploit execution, environment provisioning, replay, and consensus-style adjudication are too expensive or too dynamic to live inside the contract. The architecture therefore separates state authority from execution labor.",
				},
				{
					type: "mermaid",
					diagram:
						"flowchart LR\nA[Auditor] --> B[Frontend]\nB -->|encrypted upload| D[Sapphire Testnet OasisPOCStore]\nB --> C[Sepolia BountyHub]\nC -->|event trigger| E[CRE Workflow DON]\nE <-->|confidential store / retrieve| D\nE -->|simulation and replay| F[Tenderly VNet]\nF -->|jury verification| E\nE -->|signed report| G[CRE Forwarder]\nG -->|onReport writeback| C\nC -->|bounty payout| A",
					caption:
						"The auditor enters through the frontend, confidential data moves through OasisPoCStore during submission and later workflow evaluation, and finalized payout returns from BountyHub back to the auditor while the on-chain trust boundary runs through the CRE Forwarder.",
				},
			],
		},
		{
			id: "lifecycle-walkthrough",
			anchor: { id: "lifecycle-walkthrough", label: "Lifecycle Walkthrough" },
			title: "Lifecycle Walkthrough",
			summary: "The main system path from project registration to settlement.",
			blocks: [
				{
					type: "paragraph",
					text: "The AntiSoon state machine starts with project registration as the source event. From there, project registration fans out into `vnet-init` activation work and registration-time bootstrap for mode-specific scheduling before the protocol continues into encrypted commitment, workflow-driven reveal, strict verification and evidence generation by `verify-poc`, confidential adjudication by `jury-orchestrator` for non-strict cases, and owner adjudication if consensus fails. Accepted final results are written back to BountyHub for settlement.",
				},
				{
					type: "steps",
					items: [
						{
							title: "Project bootstrap",
							body: "The owner registers a project, BountyHub stores deadlines and mode, and that registration event fans out into two bootstrap branches: the `vnet-init` workflow provisions or reuses a Tenderly VNet before reporting activation back on-chain, while registration-time scheduler bootstrap records the mode-specific timing needed for later commit-window automation.",
						},
						{
							title: "Frontend commit path",
							body: "The researcher encrypts the PoC, writes it to OasisPoCStore, validates readback, switches back to the commit chain, computes a commit hash, calls `commitPoC`, and persists recovery context only after the chain confirms a real `PoCCommitted` event.",
						},
						{
							title: "Reveal orchestration",
							body: "After commitment, reveal responsibility depends on project mode. UNIQUE projects tie reveal sequencing to a submission-triggered workflow path, while MULTI projects depend on commit-window deadlines and cron-driven batch reveal automation.",
						},
						{
							title: "Strict verification and evidence",
							body: "A revealed submission triggers `verify-poc`, which loads metadata and payload, replays the exploit in Tenderly, emits verification evidence, and either prepares a strict-pass write-back package or hands the case to `jury-orchestrator`.",
						},
						{
							title: "Jury adjudication",
						body: "Non-strict cases go through the `jury-orchestrator` process: 5 LLM jurors and 5 human jurors. Their final validity opinions are stored in the Oasis confidential layer and aggregated after the submission's derived `juryDeadline`. If consensus fails, the owner adjudication path requires judgment plus testimony.",
						},
						{
							title: "Result write-back and settlement",
							body: "The accepted final package is written back through the authorized report path, persisted into BountyHub, optionally enriched with LLM-only similarity analysis for `MULTI` projects whose final validity is H/M, and later finalized into payout-relevant settlement state.",
						},
					],
				},
			],
		},
		{
			id: "component-responsibilities",
			anchor: { id: "component-responsibilities", label: "Component Responsibilities" },
			title: "Component Responsibilities",
			summary: "Which component stores, triggers, and validates each part of the system.",
			blocks: [
				{
					type: "paragraph",
					text: "The important architectural question is not only where code lives, but where authority lives. Several components participate in every successful submission, but they do not all have equal authority over final outcomes.",
				},
				{
					type: "table",
					columns: ["Component", "Stores what", "Triggers what", "Trusted for what"],
					rows: [
						[
							"Frontend",
							"Wallet-local recovery context, route state, assembled transaction inputs",
							"Commit initiation, reads, user-facing reveal and verdict visibility",
							"Collecting intent and presenting state, not defining final protocol truth",
						],
						[
							"BountyHub",
							"Projects, deadlines, submission statuses, verdict fields, grouping, settlement state",
							"Workflow entry events such as registration and reveal-driven verification",
							"Canonical state transitions and payout-relevant protocol truth",
						],
						[
							"CRE workflows",
							"Execution reports, orchestration state, `verify-poc` evidence packages, and `jury-orchestrator` adjudication packages",
							"VNet bootstrap, reveal automation, verification jobs, adjudication, and report submission",
							"Deterministic automation whose outputs matter only after BountyHub accepts the write-back",
						],
						[
							"Tenderly VNet",
							"Simulation environment snapshots and replay context",
							"Exploit execution and replay during verification",
							"Reproducible off-chain execution, not protocol finality",
						],
						[
							"OasisPoCStore",
							"Encrypted PoC payloads, confidential opinions, hidden evidence",
							"Confidential reads that support reveal and jury stages",
							"Privacy and confidentiality boundaries before public disclosure",
						],
					],
				},
				{
					type: "paragraph",
					text: "This responsibility split explains why AntiSoon repeatedly validates provenance. Workflows may compute results, but BountyHub is still responsible for deciding whether those results came from an authorized workflow path. The frontend may recover user progress, but chain events remain the only accepted proof that a submission actually advanced.",
				},
			],
		},
		{
			id: "jury-orchestration-design",
			anchor: { id: "jury-orchestration-design", label: "Jury Orchestration Design" },
			title: "Jury Orchestration Design",
			summary: "The jury block is a concrete ten-node protocol, not a generic confidential review step.",
			blocks: [
				{
					type: "paragraph",
					text: "After a revealed submission enters Tenderly-backed verification, the protocol first tries strict validation via `verify-poc`. Only when the submission does not satisfy the strict gate does it enter the `jury-orchestrator` block. At that point, the case is dispatched to 5 LLM jurors and 5 human jurors selected through recorded human-selection provenance.",
				},
				{
					type: "paragraph",
					text: "Each juror produces a final validity opinion. These opinions are stored in the Oasis confidential layer until the submission's derived `juryDeadline`, then retrieved and aggregated. If consensus fails, the owner adjudication path requires judgment plus testimony. Similarity grouping is applied for H/M outcomes in MULTI projects after the accepted verdict package is assembled.",
				},
				{
					type: "table",
					columns: ["Stage", "Mechanism", "Why it matters"],
					rows: [
						[
							"Panel formation",
							"5 LLM jurors plus 5 human jurors selected through recorded human-selection provenance",
							"Mixes automated and human judgment before any adjudication package is produced.",
						],
						[
							"Opinion collection",
							"Each of 10 jurors outputs one final validity opinion",
							"The adjudication surface records discrete verdict inputs instead of an open-ended review thread.",
						],
						[
							"Confidential storage",
							"All opinions remain sealed in the Oasis confidential layer until the submission's derived `juryDeadline` closes",
							"Protects against early vote leakage, strategic vote copying, and deadline-skewed pressure.",
						],
						[
							"Consensus aggregation",
							"`jury-orchestrator` aggregates the sealed opinions into consensus or owner-escalation output after the deadline",
							"Keeps adjudication workflow-local until BountyHub accepts an authorized result package.",
						],
					],
				},
				{
					type: "list",
					style: "unordered",
					items: [
						"If consensus meets the 8/10 threshold (with at least 3 agreeing votes from each cohort), `jury-orchestrator` emits that adjudication result into final packaging rather than writing protocol truth directly.",
						"If consensus does not form, the protocol opens the project-owner adjudication path instead of pretending the jury result is decisive.",
						"The adjudication design includes selection provenance for human jurors so the assigned panel can better resist Sybil-style participant farming.",
						"If the final result is H/M and the project is in `MULTI` mode, the protocol runs LLM-only similarity analysis to form `solo` and `duplicate` clusters before final packaging.",
					],
				},
				{
					type: "paragraph",
					text: "Owner adjudication is also structured rather than discretionary. The owner must submit a final judgment and the testimony supporting it before the adjudication deadline, and `jury-orchestrator` checks that package for consistency before BountyHub accepts the adjudicated final validity.",
				},
			],
		},
		{
			id: "trust-boundaries",
			anchor: { id: "trust-boundaries", label: "Trust Boundaries" },
			title: "Trust Boundaries",
			summary: "The protocol depends on explicit authority checks rather than assuming every connected system is equally trusted.",
			blocks: [
				{
					type: "paragraph",
					text: "AntiSoon treats confidentiality, automation, and finality as different trust domains. A researcher must be able to submit an exploit without exposing it before the correct reveal point, workflows must be able to automate expensive stages without becoming unchecked protocol governors, and dashboards must be able to reconstruct state without being mistaken for the source of truth.",
				},
				{
					type: "table",
					columns: ["Boundary", "Mechanism", "Architectural implication"],
					rows: [
						[
							"PoC confidentiality before reveal",
							"Encrypted OasisPoCStore payloads plus commit/reveal sequencing",
							"The contract can commit to a submission before the exploit becomes public or generally readable",
						],
						[
							"Workflow write-back authority",
							"Authorized forwarder and workflow provenance checks inside BountyHub",
							"Off-chain jobs do useful work, but only contract-validated reports become protocol truth",
						],
						[
							"Verification execution boundary",
							"Tenderly-backed replay and metric computation outside Solidity",
							"Exploit execution stays reproducible without embedding simulation logic into the contract",
						],
						[
							"Jury confidentiality",
							"Private opinions stored in the Oasis confidential layer until aggregation time",
							"Consensus logic can use hidden evidence without prematurely leaking reviewer judgments",
						],
						[
							"Frontend recovery state",
							"TTL-bound local recovery keys and hydration rules",
							"The UX may resume a session, but recovered state must still reconcile with on-chain events before it is trusted",
						],
					],
				},
			],
		},
		{
			id: "design-rationale",
			anchor: { id: "design-rationale", label: "Design Rationale" },
			title: "Design Rationale",
			summary: "Why the system is split this way instead of collapsing everything into one layer.",
			blocks: [
				{
					type: "list",
					style: "unordered",
					items: [
						"Commit and reveal exist because exploit privacy matters before adjudication; a plain public submission flow would leak zero-days too early.",
						"Workflow automation exists because VNet provisioning, reveal scheduling, replay execution, evidence generation, and adjudication orchestration are operationally complex and too expensive for direct on-chain execution.",
						"The contract remains central because verdict persistence, workflow provenance, and payout-relevant state cannot depend on UI state or external service goodwill.",
						"Strict verification and jury adjudication coexist because some cases are deterministic enough for hard metrics, while others still need confidential, multi-party judgment before a BountyHub write-back.",
						"Explorer and dashboard reads are intentionally downstream because observability must reflect protocol state, not define it.",
					],
				},
				{
					type: "paragraph",
					text: "The result is an architecture that looks heavier than a normal bounty platform, but that weight is the point. AntiSoon is trying to move project setup, exploit confidentiality, verification, and final adjudication into an auditable protocol pipeline rather than treating them as opaque platform-side operations.",
				},
			],
		},
	],
} as const satisfies DocsPage;
