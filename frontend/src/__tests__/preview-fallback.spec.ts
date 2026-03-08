import { describe, expect, it } from "vitest";
import {
	buildPreviewProject,
	buildPreviewProjectRules,
	buildPreviewSubmission,
	formatPreviewFallbackMessage,
	shouldUsePreviewFallback,
} from "../lib/previewFallback";

describe("previewFallback helpers", () => {
	it("enables fallback in test mode when no explicit flag is provided", () => {
		expect(shouldUsePreviewFallback("", "test")).toBe(true);
	});

	it("allows explicit env flag to disable fallback", () => {
		expect(shouldUsePreviewFallback("false", "development")).toBe(false);
		expect(shouldUsePreviewFallback("0", "test")).toBe(false);
	});

	it("builds deterministic preview entities for page rendering", () => {
		const project = buildPreviewProject(7n);
		const rules = buildPreviewProjectRules();
		const submission = buildPreviewSubmission(11n, 7n);

		expect(project.id).toBe(7n);
		expect(project.active).toBe(true);
		expect(rules.allowImpersonation).toBe(true);
		expect(submission.id).toBe(11n);
		expect(submission.projectId).toBe(7n);
		expect(submission.status).toBe(2);
	});

	it("formats a preview warning message for banner display", () => {
		expect(
			formatPreviewFallbackMessage("Failed to load projects from blockchain"),
		).toContain("Preview mode active");
	});
});
