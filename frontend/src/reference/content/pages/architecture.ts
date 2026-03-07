import type { DocsPage } from "../schema";

export const architectureDocsPage = {
	id: "architecture",
	slug: "architecture",
	href: "/docs/architecture",
	locale: "en",
	title: "Architecture",
	summary: "How AntiSoon splits authority, execution, and verification across contracts, workflows, confidential storage, and the frontend.",
	sections: [
		{
			id: "system-model",
			anchor: { id: "system-model", label: "System Model" },
			title: "System Model",
			summary: "The architectural shape of the protocol and why each surface exists.",
			blocks: [
				{
					type: "paragraph",
					text: "AntiSoon is not a single-contract product and it is not a pure off-chain workflow system. It is a split architecture where BountyHub owns irreversible protocol truth, workflows own expensive execution and automation, OasisPoCStore owns confidential payload storage, and the frontend owns user coordination plus recovery UX.",
				},
				{
					type: "paragraph",
					text: "That split is deliberate. Commit and reveal state, final verdicts, grouping, disputes, and payouts must be chain-verifiable. Exploit execution, environment provisioning, replay, and consensus-style verification are too expensive or too dynamic to live inside the contract. The architecture therefore separates state authority from execution labor.",
				},
				{
					type: "mermaid",
					diagram:
						"flowchart LR\nA[Auditor] --> B[Frontend]\nB -->|encrypted upload| D[Sapphire Testnet OasisPOCStore]\nB --> C[Sepolia BountyHub]\nC -->|event trigger| E[CRE Workflow DON]\nE <-->|confidential store / retrieve| D\nE -->|simulation and replay| F[Tenderly VNet]\nF -->|jury verification| E\nE -->|signed report| G[CRE Forwarder]\nG -->|onReport writeback| C\nC -->|bounty payout| A",
					caption: "The auditor enters through the frontend, confidential data moves through OasisPoCStore during submission and later workflow evaluation, and finalized payout returns from BountyHub back to the auditor while the on-chain trust boundary runs through the CRE Forwarder.",
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
					type: "callout",
					tone: "info",
					title: "Intended protocol path",
					body: [
						"This lifecycle walkthrough follows the target protocol sequence from the original design and lifecycle Mermaid source.",
						"Not every branch described here is fully implemented yet, so read it as the intended architecture contract for the system rather than a claim that every workflow stage is already live.",
					],
				},
				{
					type: "paragraph",
					text: "The best way to understand AntiSoon is to follow the state machine, not the repository tree. The intended lifecycle starts when a project is registered, passes through encrypted commitment and workflow-driven reveal, then branches in a fixed order: strict verification first, confidential jury consensus for non-strict cases, owner adjudication if the ten-node jury cannot converge, MULTI-only similarity grouping for H/M outcomes, result write-back, and final settlement.",
				},
				{
					type: "steps",
					items: [
						{
							title: "Project bootstrap",
							body: "The owner registers a project, BountyHub stores deadlines and mode, the project enters a pending VNet state, and the `vnet-init` workflow provisions or reuses a Tenderly VNet before reporting activation back on-chain.",
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
							title: "Verification and strict gate",
							body: "A revealed submission triggers `verify-poc`, which loads metadata and payload, replays the exploit in Tenderly, computes strict metrics, and either produces a direct strict-pass path or routes the submission into the confidential jury block.",
						},
						{
							title: "Consensus and adjudication",
							body: "Non-strict cases go through a ten-node jury process: 5 LLM jurors with different base models and 5 human jurors selected by VRF randomness. Their 10 final validity opinions are stored in the Oasis confidential layer until the verification window deadline, then retrieved and aggregated. If consensus fails, the owner adjudication path requires judgment plus testimony and uses LLM consensus to check testimony and judgment consistency.",
						},
						{
							title: "Result commit and settlement",
							body: "The final package is written back through the authorized report path, persisted into BountyHub, optionally enriched with LLM-only similarity analysis for `MULTI` projects whose final validity is H/M, and later finalized into payout-relevant settlement state.",
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
							"Execution reports, orchestration state, packaged results before write-back",
							"VNet bootstrap, reveal automation, verification jobs, report submission",
							"Deterministic automation only when provenance is later validated on-chain",
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
			summary: "The intended jury block is a concrete ten-node protocol, not a generic confidential review step.",
			blocks: [
				{
					type: "callout",
					tone: "info",
					title: "Intended protocol path",
					body: [
						"This section follows the original protocol design and the lifecycle Mermaid source, not only the currently implemented workflow scaffold.",
						"Today the jury-orchestrator code still behaves more like a recommendation scaffold, so treat the storage and full consensus flow here as target architecture rather than fully shipped behavior.",
					],
				},
				{
					type: "paragraph",
					text: "After a revealed submission enters Tenderly-backed verification, the protocol first tries strict validation. Only when the submission does not satisfy the strict gate does it enter the confidential jury block. At that point the protocol assembles the PoC plus the full verification trace and dispatches the case to 5 LLM jurors using different base models and 5 human jurors selected by VRF randomness.",
				},
				{
					type: "paragraph",
					text: "Each of those 10 jurors produces one final validity opinion. In the intended design, all 10 opinions are written into the Oasis confidential layer, then left sealed until the verification window deadline. Only after that deadline does the system retrieve the confidential opinions, aggregate consensus, and decide whether the final validity is `High`, `Medium`, or `Invalid` or whether the protocol must escalate into owner adjudication. Today, the shipped OasisPoCStore path is concrete for PoC payload storage, while confidential jury storage remains target architecture.",
				},
				{
					type: "table",
					columns: ["Stage", "Mechanism", "Why it matters"],
					rows: [
						[
							"Panel formation",
							"5 LLM jurors plus 5 human jurors selected by VRF randomness",
							"The protocol mixes machine and human judgment instead of trusting a single authority source.",
						],
						[
							"Opinion collection",
							"Each of 10 jurors outputs one final validity opinion",
							"The system gathers a discrete set of verdict votes instead of an open-ended discussion artifact.",
						],
						[
							"Confidential storage",
							"All opinions are stored in the Oasis confidential layer until the window closes",
							"No juror can adapt their vote after seeing the others and external observers cannot front-run the consensus process.",
						],
						[
							"Consensus",
							"All opinions are retrieved after the verification window deadline and aggregated",
							"The final protocol verdict depends on delayed confidential consensus rather than first-seen timing.",
						],
					],
				},
				{
					type: "list",
					style: "unordered",
					items: [
						"If all 10 nodes reach consensus, that consensus becomes the final validity result.",
						"If consensus does not form, the protocol opens the project-owner adjudication path instead of pretending the jury result is decisive.",
						"A future path adds zk-proof identity checks for human jurors so the VRF-selected panel can also resist Sybil-style participant farming.",
						"If the final result is H/M and the project is in `MULTI` mode, the protocol runs LLM-only similarity analysis to form `solo` and `duplicate` clusters before final packaging.",
					],
				},
				{
					type: "paragraph",
					text: "Owner adjudication is also structured rather than discretionary. The owner must submit a final judgment and the testimony supporting it during the dispute window, and the intended design then uses LLM consensus to verify the consistency and reasonableness of that testimony before producing the adjudicated final validity.",
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
							"Intended: private opinions stored in the Oasis confidential layer until aggregation time",
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
						"Workflow automation exists because VNet provisioning, reveal scheduling, replay execution, and jury orchestration are operationally complex and too expensive for direct on-chain execution.",
						"The contract remains central because verdict persistence, workflow provenance, and payout-relevant state cannot depend on UI state or external service goodwill.",
						"Strict verification and jury consensus coexist because some cases are deterministic enough for hard metrics, while others still need confidential, multi-party judgment.",
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
