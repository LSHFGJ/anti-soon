import type { DocsPage } from "../schema";

export const securityDocsPage = {
	id: "security",
	slug: "security",
	href: "/docs/security",
	locale: "en",
	title: "Security",
	summary: "Security goals and trust boundaries for the AntiSoon protocol pipeline.",
	sections: [
		{
			id: "security-goals",
			anchor: { id: "security-goals", label: "Security Goals" },
			title: "Security Goals",
			summary: "What the protocol is trying to protect, not just which services it uses.",
			blocks: [
				{
					type: "paragraph",
					text: "The security model is built around four goals: keep zero-day submissions confidential, prevent workflows from becoming unchecked governors of protocol truth, ensure verification and adjudication are evidence-driven, and expose only necessary information before final results are ready.",
				},
				{
					type: "table",
					columns: ["Security goal", "Primary mechanism", "Protected asset"],
					rows: [
						["Pre-reveal confidentiality", "Encrypted OasisPoCStore payloads plus commit/reveal sequencing", "Exploit details and submitter advantage"],
						["Protocol authority integrity", "BountyHub provenance checks on write-back", "Final verdict and payout-relevant state"],
						["Verification integrity", "Strict metrics plus reproducible Tenderly execution", "Validity judgment quality"],
						["Controlled visibility", "Submitter-only pre-reveal access and staged public disclosure", "Submission metadata and hidden evidence"],
					],
				},
			],
		},
		{
			id: "confidentiality-and-provenance",
			anchor: { id: "confidentiality-and-provenance", label: "Confidentiality and Provenance" },
			title: "Confidentiality and Provenance",
			summary: "Why hidden data and authorized write-back are both central to the design.",
			blocks: [
				{
					type: "paragraph",
					text: "The protocol uses separate components for confidentiality and authority. OasisPoCStore protects hidden PoC payloads and confidential jury data, `verify-poc` and `jury-orchestrator` prepare evidence or adjudication packages, and BountyHub remains the authority over what becomes protocol truth through authorized report write-back.",
				},
				{
					type: "list",
					style: "unordered",
					items: [
						"A commitment can exist on-chain without exposing the PoC body to the public network.",
						"Workflows may compute activation, verification, or final packaging outputs, but BountyHub accepts them only through an authorized provenance-checked path.",
						"Frontend recovery state is useful for UX, but it cannot override the chain event record when the two disagree.",
					],
				},
			],
		},
		{
			id: "jury-selection-and-confidentiality",
			anchor: {
				id: "jury-selection-and-confidentiality",
				label: "Jury Selection and Confidentiality",
			},
			title: "Jury Selection and Confidentiality",
			summary: "Why the jury block uses mixed jurors, confidential storage, and human selection provenance.",
			blocks: [
				{
					type: "paragraph",
					text: "The jury design is a privacy and selection-integrity mechanism. Non-strict cases go to 5 LLM jurors and 5 human jurors selected through recorded human-selection provenance. Their opinions are stored in the Oasis confidential layer and retrieved after the submission's derived jury deadline for consensus aggregation.",
				},
				{
					type: "table",
					columns: ["Security property", "Mechanism", "What it protects against"],
					rows: [
						["Panel diversity", "5 LLM jurors plus 5 human jurors", "Single-model blind spots and single-role capture"],
						["Human juror selection integrity", "Recorded human-selection provenance", "Predictable or curator-controlled panel composition"],
						["Vote privacy before consensus", "Store every opinion in the Oasis confidential layer until the deadline", "Early vote leakage, strategic vote copying, and pre-consensus external pressure"],
						["Anti-sybil hardening", "Human juror selection provenance", "Human-panel farming and duplicate-identity abuse"],
					],
				},
				{
					type: "paragraph",
					text: "That structure means confidentiality and selection integrity reinforce each other: jurors are mixed by design, opinions stay sealed until the jury deadline closes, and the eventual BountyHub write-back is based on aggregate adjudication rather than first-seen timing.",
				},
			],
		},
		{
			id: "verification-and-adjudication-trust",
			anchor: {
				id: "verification-and-adjudication-trust",
				label: "Verification and Adjudication Trust",
			},
			title: "Verification and Adjudication Trust",
			summary: "How the protocol decides when deterministic replay is enough and when confidential judgment is required.",
			blocks: [
				{
					type: "paragraph",
					text: "Strict verification via `verify-poc` provides a hard metrics and evidence-generation path for cases that cleanly satisfy project criteria, while confidential jury aggregation via `jury-orchestrator` and possible owner adjudication handle cases where the protocol still needs a guarded judgment layer.",
				},
				{
					type: "table",
					columns: ["Trust layer", "What it decides", "Why it exists"],
					rows: [
						["Strict gate", "Whether a case directly satisfies project-defined vulnerability criteria", "Avoid unnecessary human or model judgment when hard evidence is enough"],
						["Confidential jury", "Whether a non-strict case reaches consensus on `High`, `Medium`, or `Invalid`", "Use multiple hidden opinions without leaking them early or letting jurors adapt to each other before the deadline"],
						["Owner adjudication", "Final judgment when the ten-node jury does not converge", "Provide a bounded fallback where the owner must submit judgment plus testimony instead of leaving the protocol unresolved"],
					],
				},
				{
					type: "paragraph",
					text: "Owner adjudication is the final fallback when the ten-node jury does not converge. The owner submits judgment and testimony, `jury-orchestrator` checks that package for consistency, and BountyHub remains the irreversible state surface that accepts or rejects the resulting write-back.",
				},
			],
		},
	],
} as const satisfies DocsPage;
