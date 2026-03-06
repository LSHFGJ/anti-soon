import { describe, expect, it } from "bun:test";
import {
	assertNoAuthorityBypass,
	BOUNTY_HUB_FINALIZE_SELECTOR,
	BOUNTY_HUB_RESOLVE_DISPUTE_SELECTOR,
	buildJuryRecommendationEnvelope,
	type JuryRecommendationPayload,
	main,
	parseJuryWorkflowConfig,
	parseVerifiedReportEnvelope,
	runJuryRecommendationPipeline,
} from "./main";

const validJuryWorkflowConfig = {
	chainSelectorName: "ethereum-testnet-sepolia",
	bountyHubAddress: "0x17797b473864806072186f6997801D4473AAF6e8",
	gasLimit: "300000",
	juryPolicy: {
		allowDirectSettlement: false,
		requireOwnerResolution: true,
	},
};

const validVerifiedReportEnvelope = {
	magic: "ASRP",
	reportType: "verified-report/v1",
	payload: {
		submissionId: "9",
		projectId: "2",
		isValid: true,
		drainAmountWei: "1300000000000000000",
		observedCalldata: ["0xdeadbeef"],
	},
} as const;

const validOwnerTestimony = {
	submissionId: "9",
	projectId: "2",
	recommendationReportType: "jury-recommendation/v1",
	testimony:
		"Project owner acknowledges the disputed submission context and provides manual review testimony.",
} as const;

const validVerifiedReportEnvelopeV2 = {
	magic: "ASRP",
	reportType: "verified-report/v2",
	payload: {
		submissionId: "9",
		projectId: "2",
		isValid: true,
		drainAmountWei: "1300000000000000000",
		observedCalldata: ["0xdeadbeef"],
	},
	jury: {
		recommendationReportType: "jury-recommendation/v1",
		action: "UPHOLD_AI_RESULT",
		rationale:
			"Existing jury context should survive verified-report transport.",
	},
	testimony: {
		recommendationReportType: "jury-recommendation/v1",
		testimony:
			"Owner testimony should remain attached to the versioned verify envelope.",
	},
} as const;

function buildRecommendationFixture(
	action: JuryRecommendationPayload["action"],
	rationale: string,
) {
	return buildJuryRecommendationEnvelope({
		submissionId: 9n,
		projectId: 2n,
		action,
		rationale,
	});
}

describe("jury-orchestrator workflow config", () => {
	it("parses checked-in recommendation-only configs", async () => {
		const stagingConfig = await Bun.file(
			new URL("./config.staging.json", import.meta.url),
		).json();
		const productionConfig = await Bun.file(
			new URL("./config.production.json", import.meta.url),
		).json();

		expect(parseJuryWorkflowConfig(stagingConfig)).toEqual(
			validJuryWorkflowConfig,
		);
		expect(parseJuryWorkflowConfig(productionConfig)).toEqual(
			validJuryWorkflowConfig,
		);
	});

	it("rejects config that enables direct settlement", () => {
		expect(() =>
			parseJuryWorkflowConfig({
				...validJuryWorkflowConfig,
				juryPolicy: {
					...validJuryWorkflowConfig.juryPolicy,
					allowDirectSettlement: true,
				},
			}),
		).toThrow("allowDirectSettlement");
	});

	it("rejects config that drops owner resolution", () => {
		expect(() =>
			parseJuryWorkflowConfig({
				...validJuryWorkflowConfig,
				juryPolicy: {
					...validJuryWorkflowConfig.juryPolicy,
					requireOwnerResolution: false,
				},
			}),
		).toThrow("requireOwnerResolution");
	});

	it("rejects zero-address bountyHubAddress", () => {
		expect(() =>
			parseJuryWorkflowConfig({
				...validJuryWorkflowConfig,
				bountyHubAddress: "0x0000000000000000000000000000000000000000",
			}),
		).toThrow("non-zero");
	});
});

describe("jury-orchestrator scaffold authority boundary", () => {
	it("rejects direct finalize selector usage", () => {
		expect(() =>
			assertNoAuthorityBypass(
				`${BOUNTY_HUB_FINALIZE_SELECTOR}0000000000000000000000000000000000000000000000000000000000000001`,
			),
		).toThrow("Forbidden authority call selector");
	});

	it("rejects direct resolveDispute selector usage", () => {
		expect(() =>
			assertNoAuthorityBypass(
				`${BOUNTY_HUB_RESOLVE_DISPUTE_SELECTOR}00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000001`,
			),
		).toThrow("Forbidden authority call selector");
	});

	it("allows non-authority selector payloads for recommendation-only scaffold", () => {
		expect(() => assertNoAuthorityBypass("0xdeadbeef")).not.toThrow();
	});

	it("builds typed recommendation envelope without settlement fields", () => {
		const payload: JuryRecommendationPayload = {
			submissionId: 9n,
			projectId: 2n,
			action: "NEEDS_OWNER_REVIEW",
			rationale: "Escalate disputed evidence to project owner review",
		};

		const envelope = buildJuryRecommendationEnvelope(payload);

		expect(envelope.magic).toBe("ASRP");
		expect(envelope.reportType).toBe("jury-recommendation/v1");
		expect(envelope.payload).toEqual(payload);
		expect(Object.hasOwn(envelope as object, "payoutAmount")).toBe(false);
		expect(Object.hasOwn(envelope as object, "overturn")).toBe(false);
	});

	it("derives a deterministic uphold recommendation envelope from a verified report", () => {
		const envelope = runJuryRecommendationPipeline({
			config: validJuryWorkflowConfig,
			verifiedReport: validVerifiedReportEnvelope,
		});

		expect(envelope).toEqual({
			magic: "ASRP",
			reportType: "jury-recommendation/v1",
			payload: {
				submissionId: 9n,
				projectId: 2n,
				action: "UPHOLD_AI_RESULT",
				rationale:
					"Verified report for submission 9 marked isValid=true with drainAmountWei=1300000000000000000; recommending UPHOLD_AI_RESULT for owner resolution.",
			},
		});
	});

	it("derives a deterministic overturn recommendation envelope from an invalid verified report", () => {
		const envelope = runJuryRecommendationPipeline({
			config: validJuryWorkflowConfig,
			verifiedReport: {
				...validVerifiedReportEnvelope,
				payload: {
					...validVerifiedReportEnvelope.payload,
					isValid: false,
					drainAmountWei: "0",
				},
			},
		});

		expect(envelope).toEqual({
			magic: "ASRP",
			reportType: "jury-recommendation/v1",
			payload: {
				submissionId: 9n,
				projectId: 2n,
				action: "OVERTURN_AI_RESULT",
				rationale:
					"Verified report for submission 9 marked isValid=false with drainAmountWei=0; recommending OVERTURN_AI_RESULT for owner resolution.",
			},
		});
	});

	it("parses verified-report/v2 envelopes and preserves jury/testimony metadata", () => {
		const parsed = parseVerifiedReportEnvelope(validVerifiedReportEnvelopeV2);

		expect(parsed).toEqual({
			magic: "ASRP",
			reportType: "verified-report/v2",
			payload: {
				submissionId: 9n,
				projectId: 2n,
				isValid: true,
				drainAmountWei: 1300000000000000000n,
				observedCalldata: ["0xdeadbeef"],
			},
			jury: validVerifiedReportEnvelopeV2.jury,
			testimony: validVerifiedReportEnvelopeV2.testimony,
		});
	});

	it("derives the same recommendation from verified-report/v2 inputs with metadata", () => {
		const envelope = runJuryRecommendationPipeline({
			config: validJuryWorkflowConfig,
			verifiedReport: validVerifiedReportEnvelopeV2,
		});

		expect(envelope.payload.action).toBe("UPHOLD_AI_RESULT");
		expect(envelope.payload.rationale).toContain("submission 9");
	});

	it("aggregates a deterministic quorum result regardless of recommendation order", () => {
		const first = runJuryRecommendationPipeline({
			config: validJuryWorkflowConfig,
			recommendations: [
				buildRecommendationFixture("UPHOLD_AI_RESULT", "jury-a"),
				buildRecommendationFixture("OVERTURN_AI_RESULT", "jury-b"),
				buildRecommendationFixture("UPHOLD_AI_RESULT", "jury-c"),
			],
			requiredQuorum: 2,
		} as never);

		const second = runJuryRecommendationPipeline({
			config: validJuryWorkflowConfig,
			recommendations: [
				buildRecommendationFixture("UPHOLD_AI_RESULT", "jury-c"),
				buildRecommendationFixture("UPHOLD_AI_RESULT", "jury-a"),
				buildRecommendationFixture("OVERTURN_AI_RESULT", "jury-b"),
			],
			requiredQuorum: 2,
		} as never);

		expect(first).toEqual(second);
		expect(first.payload.action).toBe("UPHOLD_AI_RESULT");
		expect(first.payload.rationale).toContain("quorum 2");
	});

	it("falls back to owner review when quorum is unresolved by a tie", () => {
		const envelope = runJuryRecommendationPipeline({
			config: validJuryWorkflowConfig,
			recommendations: [
				buildRecommendationFixture("UPHOLD_AI_RESULT", "jury-a"),
				buildRecommendationFixture("OVERTURN_AI_RESULT", "jury-b"),
			],
			requiredQuorum: 1,
		} as never);

		expect(envelope.payload.action).toBe("NEEDS_OWNER_REVIEW");
		expect(envelope.payload.rationale).toContain("unresolved");
	});

	it("falls back to owner review when quorum is absent after timeout", () => {
		const envelope = runJuryRecommendationPipeline({
			config: validJuryWorkflowConfig,
			recommendations: [
				buildRecommendationFixture("UPHOLD_AI_RESULT", "jury-a"),
			],
			requiredQuorum: 2,
			timedOut: true,
		} as never);

		expect(envelope.payload.action).toBe("NEEDS_OWNER_REVIEW");
		expect(envelope.payload.rationale).toContain("timeout");
	});

	it("accepts owner testimony when recommendation and report context stay consistent", () => {
		const recommendation = buildRecommendationFixture(
			"NEEDS_OWNER_REVIEW",
			"jury consensus requires owner review",
		);

		const envelope = runJuryRecommendationPipeline({
			config: validJuryWorkflowConfig,
			recommendation,
			verifiedReport: validVerifiedReportEnvelope,
			ownerTestimony: validOwnerTestimony,
		} as never);

		expect(envelope).toEqual(recommendation);
	});

	it("rejects owner testimony when submission identifiers are inconsistent", () => {
		const recommendation = buildRecommendationFixture(
			"NEEDS_OWNER_REVIEW",
			"jury consensus requires owner review",
		);

		expect(() =>
			runJuryRecommendationPipeline({
				config: validJuryWorkflowConfig,
				recommendation,
				verifiedReport: validVerifiedReportEnvelope,
				ownerTestimony: {
					...validOwnerTestimony,
					submissionId: "10",
				},
			} as never),
		).toThrow("ownerTestimony.submissionId");
	});

	it("rejects owner testimony authority bypass when contextual verified report carries forbidden finalize selector", () => {
		const recommendation = buildRecommendationFixture(
			"NEEDS_OWNER_REVIEW",
			"jury consensus requires owner review",
		);

		expect(() =>
			runJuryRecommendationPipeline({
				config: validJuryWorkflowConfig,
				recommendation,
				ownerTestimony: validOwnerTestimony,
				verifiedReport: {
					...validVerifiedReportEnvelope,
					payload: {
						...validVerifiedReportEnvelope.payload,
						observedCalldata: [
							`${BOUNTY_HUB_FINALIZE_SELECTOR}0000000000000000000000000000000000000000000000000000000000000001`,
						],
					},
				},
			} as never),
		).toThrow("Forbidden authority call selector");
	});

	it("rejects owner testimony authority bypass when contextual verified report carries forbidden resolveDispute selector", () => {
		const recommendation = buildRecommendationFixture(
			"NEEDS_OWNER_REVIEW",
			"jury consensus requires owner review",
		);

		expect(() =>
			runJuryRecommendationPipeline({
				config: validJuryWorkflowConfig,
				recommendation,
				ownerTestimony: validOwnerTestimony,
				verifiedReport: {
					...validVerifiedReportEnvelope,
					payload: {
						...validVerifiedReportEnvelope.payload,
						observedCalldata: [
							`${BOUNTY_HUB_RESOLVE_DISPUTE_SELECTOR}00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000001`,
						],
					},
				},
			} as never),
		).toThrow("Forbidden authority call selector");
	});

	it("rejects recommendation pipeline inputs that include forbidden settlement selectors", () => {
		expect(() =>
			runJuryRecommendationPipeline({
				config: validJuryWorkflowConfig,
				verifiedReport: {
					...validVerifiedReportEnvelope,
					payload: {
						...validVerifiedReportEnvelope.payload,
						observedCalldata: [
							`${BOUNTY_HUB_FINALIZE_SELECTOR}0000000000000000000000000000000000000000000000000000000000000001`,
						],
					},
				},
			}),
		).toThrow("Forbidden authority call selector");
	});

	it("main returns the typed recommendation envelope for verified report inputs", async () => {
		const envelope = await main({
			config: validJuryWorkflowConfig,
			verifiedReport: validVerifiedReportEnvelope,
		});

		expect(envelope).toEqual({
			magic: "ASRP",
			reportType: "jury-recommendation/v1",
			payload: {
				submissionId: 9n,
				projectId: 2n,
				action: "UPHOLD_AI_RESULT",
				rationale:
					"Verified report for submission 9 marked isValid=true with drainAmountWei=1300000000000000000; recommending UPHOLD_AI_RESULT for owner resolution.",
			},
		});
	});
});
