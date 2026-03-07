import type { DocsPage } from "../schema";

export const securityDocsPage = {
	id: "security",
	slug: "security",
	href: "/docs/security",
	locale: "en",
	title: "Security",
	summary: "Security goals and trust boundaries for the intended AntiSoon protocol pipeline.",
	sections: [
		{
			id: "security-goals",
			anchor: { id: "security-goals", label: "Security Goals" },
			title: "Security Goals",
			summary: "What the protocol is trying to protect, not just which services it uses.",
			blocks: [
				{
					type: "paragraph",
					text: "The security model is built around four goals: keep zero-day submissions confidential before the correct reveal point, prevent workflows from becoming unchecked governors of protocol truth, ensure verification and adjudication are evidence-driven, and expose only the right amount of information to non-submitters before final results are ready.",
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
					text: "AntiSoon does not trust confidentiality and authority to the same component. Today, OasisPoCStore protects hidden PoC payloads, while the intended protocol design extends the Oasis confidential layer to private jury data as well. BountyHub still remains the authority over what becomes protocol truth. That split prevents a confidential storage surface from unilaterally deciding validity, and it prevents the contract from having to expose exploit details too early.",
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
			summary: "Why the intended jury block uses mixed jurors, confidential storage, and a future anti-sybil path.",
			blocks: [
				{
					type: "paragraph",
					text: "The original jury design is a privacy and selection-integrity mechanism, not just a generic consensus phrase. Non-strict cases are meant to go to 5 LLM jurors with different base models and 5 human jurors selected by VRF randomness. In the intended protocol path, all 10 resulting opinions are stored in the Oasis confidential layer, then retrieved only after the verification window deadline so consensus can happen without leaking intermediate votes.",
				},
				{
					type: "table",
					columns: ["Security property", "Mechanism", "What it protects against"],
					rows: [
						["Panel diversity", "5 LLM jurors plus 5 human jurors", "Single-model blind spots and single-role capture"],
						["Human juror selection integrity", "VRF randomness", "Predictable or curator-controlled panel composition"],
						["Vote privacy before consensus", "Intended: store every opinion in the Oasis confidential layer until the deadline", "Early vote leakage, strategic vote copying, and pre-consensus external pressure"],
						["Future anti-sybil hardening", "zk-proof identity validation for human jurors", "Human-panel farming and duplicate-identity abuse"],
					],
				},
				{
					type: "callout",
					tone: "info",
					title: "Target architecture note",
					body: [
						"The docs treat this as intended protocol behavior from the original design source.",
						"The current codebase has not yet fully implemented the juror-opinion storage and retrieval path in the Oasis confidential layer.",
					],
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
					text: "The lifecycle design does not assume every case can be reduced to a single deterministic yes-or-no check. Strict verification provides a hard metrics path for cases that cleanly satisfy project criteria, while confidential jury aggregation and possible owner adjudication handle cases where the protocol still needs a guarded judgment layer. The intended final-validity space is `High`, `Medium`, or `Invalid`, and owner adjudication is only supposed to happen when the ten-node jury cannot form consensus by the end of the verification window.",
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
					text: "Owner adjudication is still checked, not simply accepted. In the intended design, the owner submits both the final judgment and the testimony supporting it, and LLM consensus then verifies whether that testimony is consistent with the judgment being asserted before the adjudicated validity becomes final. The current codebase already supports owner dispute resolution, but not the full confidential jury-storage pipeline described here.",
				},
				{
					type: "callout",
					tone: "info",
					title: "Target architecture note",
					body: [
						"This page follows the lifecycle design where jury and adjudication are first-class trust layers.",
						"If the current product surface still presents a simpler CRE verification story, treat that as an implementation lag rather than the long-term security model.",
					],
				},
			],
		},
	],
} as const satisfies DocsPage;
