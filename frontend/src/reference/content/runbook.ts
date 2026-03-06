import type { DocsAuthoringContract, DocsAuthoringRunbook } from "./contract";

export const DOCS_AUTHORING_RUNBOOK = {
	checklist: {
		artifactLabel: "Checklist",
		outputHandle: "offline-docs-checklist.json",
		requiredFields: ["itemId", "requirement", "status", "evidenceRef"],
	},
	claimToSource: {
		artifactLabel: "Claim-to-source",
		outputHandle: "offline-docs-claim-to-source.json",
		requiredFields: ["claimId", "claimText", "sourcePointer", "evidenceRef"],
	},
	reviewGate: {
		artifactLabel: "Review Gate",
		outputHandle: "offline-docs-review-gate.json",
		requiredRoles: ["author", "reviewer"],
		requiredDecisions: ["approved", "changes-requested"],
	},
	evidence: {
		artifactLabel: "Evidence",
		outputHandle: "offline-docs-evidence.json",
		requiredFields: ["artifactId", "captureMethod", "sourcePointer", "reviewer"],
	},
} as const satisfies DocsAuthoringRunbook;

export const DOCS_AUTHORING_VALIDATION_FIXTURE = {
	inputShape: {
		topicId: "getting-started",
		contextFiles: ["README.md", "src/reference/content/overview.ts"],
	},
	promptTemplate: "dummy template",
	rubric: {
		abstainWhenInsufficientEvidence: true,
		requireReviewGate: true,
		qualityCriteria: ["be concise", "use formal tone"],
	},
	evidence: [
		{
			claim: "AntiSoon uses CRE",
			sourcePointer: "README.md line 5",
		},
	],
	runbook: DOCS_AUTHORING_RUNBOOK,
	didAbstain: false,
	reviewGateStatus: "pending",
} as const satisfies DocsAuthoringContract;

export const DOCS_AUTHORING_MALFORMED_FIXTURE: unknown = {
	inputShape: {
		topicId: "",
		contextFiles: "not an array",
	},
	promptTemplate: "",
	rubric: {
		abstainWhenInsufficientEvidence: "yes",
		requireReviewGate: true,
		qualityCriteria: "not an array",
	},
	evidence: [
		{
			claim: "",
			sourcePointer: "foo",
		},
	],
	runbook: {
		checklist: {
			artifactLabel: "Checklist",
			outputHandle: "",
			requiredFields: [],
		},
		claimToSource: {
			artifactLabel: "Claim-to-source",
			outputHandle: "offline-docs-claim-to-source.json",
			requiredFields: [],
		},
		reviewGate: {
			artifactLabel: "Review Gate",
			outputHandle: "offline-docs-review-gate.json",
			requiredRoles: [],
			requiredDecisions: [],
		},
		evidence: {
			artifactLabel: "Evidence",
			outputHandle: "offline-docs-evidence.json",
			requiredFields: ["artifactId"],
		},
	},
	didAbstain: "no",
	reviewGateStatus: "done",
};
