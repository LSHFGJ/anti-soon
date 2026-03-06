export type DocsAuthoringEvidence = {
	claim: string;
	sourcePointer: string;
};

export type DocsRunbookTemplate = {
	artifactLabel: string;
	outputHandle: string;
	requiredFields: readonly string[];
};

export type DocsReviewGateTemplate = {
	artifactLabel: string;
	outputHandle: string;
	requiredRoles: readonly string[];
	requiredDecisions: readonly string[];
};

export type DocsAuthoringRunbook = {
	checklist: DocsRunbookTemplate;
	claimToSource: DocsRunbookTemplate;
	reviewGate: DocsReviewGateTemplate;
	evidence: DocsRunbookTemplate;
};

export type DocsAuthoringRubric = {
	abstainWhenInsufficientEvidence: boolean;
	requireReviewGate: boolean;
	qualityCriteria: readonly string[];
};

export type DocsAuthoringContract = {
	inputShape: {
		topicId: string;
		contextFiles: readonly string[];
	};
	promptTemplate: string;
	rubric: DocsAuthoringRubric;
	evidence: readonly DocsAuthoringEvidence[];
	runbook: DocsAuthoringRunbook;
	didAbstain: boolean;
	reviewGateStatus: "pending" | "approved" | "rejected";
};

export type DocsAuthoringAuditArtifact = {
	label: string;
	outputHandle: string;
	requiredFields: readonly string[];
};

export const DOCS_AUTHORING_PROMPT_TEMPLATE = `
You are a technical documentation author for AntiSoon.
Your task is to write a section about {{topicId}}.

Source Material:
{{contextFiles}}

Rules:
1. Evidence Mapping: Every technical claim must be explicitly backed by a source pointer.
2. Abstain Behavior: If the source material is insufficient to cover the topic, you MUST ABSTAIN.
3. Review Gate: All generated content goes through a human review gate before publishing.
4. Rubric: Follow the quality criteria exactly.
`;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateStringArray(value: unknown, path: string, violations: string[]): void {
	if (!Array.isArray(value)) {
		violations.push(`${path}: expected array`);
		return;
	}

	if (value.length === 0) {
		violations.push(`${path}: must contain at least one item`);
	}

	for (const [index, item] of value.entries()) {
		if (typeof item !== "string" || item.trim() === "") {
			violations.push(`${path}[${index}]: must be a non-empty string`);
		}
	}
}

function validateRunbookTemplate(value: unknown, path: string, violations: string[]): void {
	if (!isRecord(value)) {
		violations.push(`${path}: expected object`);
		return;
	}

	if (typeof value.artifactLabel !== "string" || value.artifactLabel.trim() === "") {
		violations.push(`${path}.artifactLabel: must be a non-empty string`);
	}

	if (typeof value.outputHandle !== "string" || value.outputHandle.trim() === "") {
		violations.push(`${path}.outputHandle: must be a non-empty string`);
	}

	validateStringArray(value.requiredFields, `${path}.requiredFields`, violations);
}

function validateReviewGateTemplate(value: unknown, path: string, violations: string[]): void {
	if (!isRecord(value)) {
		violations.push(`${path}: expected object`);
		return;
	}

	if (typeof value.artifactLabel !== "string" || value.artifactLabel.trim() === "") {
		violations.push(`${path}.artifactLabel: must be a non-empty string`);
	}

	if (typeof value.outputHandle !== "string" || value.outputHandle.trim() === "") {
		violations.push(`${path}.outputHandle: must be a non-empty string`);
	}

	validateStringArray(value.requiredRoles, `${path}.requiredRoles`, violations);
	validateStringArray(value.requiredDecisions, `${path}.requiredDecisions`, violations);
}

function validateRunbook(value: unknown, path: string, violations: string[]): void {
	if (!isRecord(value)) {
		violations.push(`${path}: expected object`);
		return;
	}

	validateRunbookTemplate(value.checklist, `${path}.checklist`, violations);
	validateRunbookTemplate(value.claimToSource, `${path}.claimToSource`, violations);
	validateReviewGateTemplate(value.reviewGate, `${path}.reviewGate`, violations);
	validateRunbookTemplate(value.evidence, `${path}.evidence`, violations);
}

export function validateDocsAuthoringContract(value: unknown): string[] {
	const violations: string[] = [];

	if (!isRecord(value)) {
		violations.push("contract: expected object");
		return violations;
	}

	if (!isRecord(value.inputShape)) {
		violations.push("contract.inputShape: expected object");
	} else {
		if (typeof value.inputShape.topicId !== "string" || value.inputShape.topicId.trim() === "") {
			violations.push("contract.inputShape.topicId: must be a non-empty string");
		}
		if (!Array.isArray(value.inputShape.contextFiles)) {
			violations.push("contract.inputShape.contextFiles: expected array");
		}
	}

	if (typeof value.promptTemplate !== "string" || value.promptTemplate.trim() === "") {
		violations.push("contract.promptTemplate: must be a non-empty string");
	}

	if (!isRecord(value.rubric)) {
		violations.push("contract.rubric: expected object");
	} else {
		if (typeof value.rubric.abstainWhenInsufficientEvidence !== "boolean") {
			violations.push("contract.rubric.abstainWhenInsufficientEvidence: must be a boolean");
		}
		if (typeof value.rubric.requireReviewGate !== "boolean") {
			violations.push("contract.rubric.requireReviewGate: must be a boolean");
		}
		if (!Array.isArray(value.rubric.qualityCriteria)) {
			violations.push("contract.rubric.qualityCriteria: expected array");
		}
	}

	if (!Array.isArray(value.evidence)) {
		violations.push("contract.evidence: expected array");
	} else {
		for (const [index, ev] of value.evidence.entries()) {
			if (!isRecord(ev)) {
				violations.push(`contract.evidence[${index}]: expected object`);
			} else {
				if (typeof ev.claim !== "string" || ev.claim.trim() === "") {
					violations.push(`contract.evidence[${index}].claim: must be a non-empty string`);
				}
				if (typeof ev.sourcePointer !== "string" || ev.sourcePointer.trim() === "") {
					violations.push(`contract.evidence[${index}].sourcePointer: must be a non-empty string`);
				}
			}
		}
	}

	validateRunbook(value.runbook, "contract.runbook", violations);

	if (typeof value.didAbstain !== "boolean") {
		violations.push("contract.didAbstain: must be a boolean");
	}

	const validReviewStatuses = ["pending", "approved", "rejected"];
	if (typeof value.reviewGateStatus !== "string" || !validReviewStatuses.includes(value.reviewGateStatus)) {
		violations.push(`contract.reviewGateStatus: must be one of: ${validReviewStatuses.join(", ")}`);
	}

	return violations;
}

export function collectDocsAuthoringAuditArtifacts(
	contract: DocsAuthoringContract,
): DocsAuthoringAuditArtifact[] {
	return [
		{
			label: contract.runbook.checklist.artifactLabel,
			outputHandle: contract.runbook.checklist.outputHandle,
			requiredFields: contract.runbook.checklist.requiredFields,
		},
		{
			label: contract.runbook.claimToSource.artifactLabel,
			outputHandle: contract.runbook.claimToSource.outputHandle,
			requiredFields: contract.runbook.claimToSource.requiredFields,
		},
		{
			label: contract.runbook.reviewGate.artifactLabel,
			outputHandle: contract.runbook.reviewGate.outputHandle,
			requiredFields: [
				...contract.runbook.reviewGate.requiredRoles,
				...contract.runbook.reviewGate.requiredDecisions,
			],
		},
		{
			label: contract.runbook.evidence.artifactLabel,
			outputHandle: contract.runbook.evidence.outputHandle,
			requiredFields: contract.runbook.evidence.requiredFields,
		},
	];
}
