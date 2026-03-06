import { describe, expect, it } from "vitest";

describe("docs authoring contract", () => {
	it("exports committed runbook templates for auditable offline review", async () => {
		const [{ DOCS_AUTHORING_VALIDATION_FIXTURE, DOCS_AUTHORING_RUNBOOK }, contractModule] =
			await Promise.all([
				import("../reference/content/runbook"),
				import("../reference/content/contract"),
			]);

		expect(DOCS_AUTHORING_RUNBOOK.checklist.artifactLabel).toBe("Checklist");
		expect(DOCS_AUTHORING_RUNBOOK.claimToSource.artifactLabel).toBe("Claim-to-source");
		expect(DOCS_AUTHORING_RUNBOOK.reviewGate.artifactLabel).toBe("Review Gate");
		expect(DOCS_AUTHORING_RUNBOOK.evidence.artifactLabel).toBe("Evidence");
		expect(contractModule.validateDocsAuthoringContract(DOCS_AUTHORING_VALIDATION_FIXTURE)).toEqual([]);
		expect(contractModule.collectDocsAuthoringAuditArtifacts(DOCS_AUTHORING_VALIDATION_FIXTURE)).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					label: "Checklist",
					outputHandle: expect.stringContaining("checklist"),
				}),
				expect.objectContaining({
					label: "Claim-to-source",
					outputHandle: expect.stringContaining("claim-to-source"),
				}),
				expect.objectContaining({
					label: "Review Gate",
					outputHandle: expect.stringContaining("review-gate"),
				}),
				expect.objectContaining({
					label: "Evidence",
					outputHandle: expect.stringContaining("evidence"),
				}),
			]),
		);
	});

	it("rejects runbooks that drop required audit primitives", async () => {
		const [{ DOCS_AUTHORING_VALIDATION_FIXTURE }, { validateDocsAuthoringContract }] =
			await Promise.all([
				import("../reference/content/runbook"),
				import("../reference/content/contract"),
			]);

		const violations = validateDocsAuthoringContract({
			...DOCS_AUTHORING_VALIDATION_FIXTURE,
			runbook: {
				...DOCS_AUTHORING_VALIDATION_FIXTURE.runbook,
				claimToSource: {
					...DOCS_AUTHORING_VALIDATION_FIXTURE.runbook.claimToSource,
					requiredFields: [],
				},
				reviewGate: {
					...DOCS_AUTHORING_VALIDATION_FIXTURE.runbook.reviewGate,
					requiredRoles: [],
				},
			},
		});

		expect(violations.join("\n")).toMatch(/claimToSource|requiredFields|reviewGate|requiredRoles/i);
	});
});
