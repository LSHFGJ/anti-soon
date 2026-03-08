import { describe, expect, it } from "bun:test";
import type {
	AdjudicationCaseEnvelope,
	AdjudicationFinalPackageEnvelope,
	JuryConsensusEnvelope,
	JuryRecommendationPayload,
	OpinionIngestEnvelope,
	OwnerAdjudicationExpiredEnvelope,
	OwnerAdjudicationHandoffEnvelope,
	SealedJurorOpinionRecord,
} from "./main";
import {
	aggregateTargetStateOpinionRecords,
	assertNoAuthorityBypass,
	assertOpinionIngestRosterSlotAuthorized,
	BOUNTY_HUB_FINALIZE_SELECTOR,
	BOUNTY_HUB_RESOLVE_DISPUTE_SELECTOR,
	buildJuryRecommendationEnvelope,
	encodeJuryOrchestratorContractReport,
	main,
	parseJuryWorkflowConfig,
	parseVerifiedReportEnvelope,
	reissueHumanJurorSlot,
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

const validStrictFailEvidenceEnvelopeV3 = {
	magic: "ASRP",
	reportType: "verified-report/v3",
	payload: {
		submissionId: "123",
		projectId: "7",
		isValid: false,
		drainAmountWei: "0",
		observedCalldata: ["0xdeadbeef"],
	},
	juryCommitment: {
		commitmentVersion: "anti-soon.verify-poc.jury-commitment.v1",
		juryLedgerDigest:
			"0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		sourceEventKey:
			"0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
		mappingFingerprint:
			"0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
	},
	adjudication: {
		adjudicationVersion: "anti-soon.verify-poc.adjudication.v1",
		syncId:
			"0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
		idempotencyKey:
			"0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
		cipherURI:
			"oasis://oasis-sapphire-testnet/0x1111111111111111111111111111111111111111/slot-42#0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
		severity: 3,
		juryWindow: "3600",
		adjudicationWindow: "3600",
		commitTimestampSec: "1700000000",
		revealTimestampSec: "1700000060",
		sapphireWriteTimestampSec: "1700000005",
		reasonCode: "BINDING_MISMATCH",
		chainSelectorName: "ethereum-testnet-sepolia",
		bountyHubAddress: "0x17797b473864806072186f6997801D4473AAF6e8",
		txHash:
			"0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
		logIndex: "9",
		oasis: {
			chain: "oasis-sapphire-testnet",
			contract: "0x1111111111111111111111111111111111111111",
			slotId: "slot-42",
			envelopeHash:
				"0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
		},
	},
} as const;

const validRosterSelectionInput = {
	llmJurors: [
		{ jurorId: "llm:gpt-4.1" },
		{ jurorId: "llm:claude-3.7-sonnet" },
		{ jurorId: "llm:gemini-2.5-pro" },
		{ jurorId: "llm:llama-3.1-405b" },
		{ jurorId: "llm:qwen-2.5-72b" },
	],
	humanCandidates: [
		{ jurorId: "human:alice" },
		{ jurorId: "human:bob" },
		{ jurorId: "human:carol" },
		{ jurorId: "human:dora" },
		{ jurorId: "human:erin" },
		{ jurorId: "human:finn" },
		{ jurorId: "human:gwen" },
		{ jurorId: "human:hale" },
	],
	humanSelection: {
		selectionVersion: "anti-soon.human-juror-selection.v1",
		randomnessDigest:
			"0x1111111111111111111111111111111111111111111111111111111111111111",
		selectionSource: "vrf://chainlink/round/42",
		selectionNonce:
			"0x2222222222222222222222222222222222222222222222222222222222222222",
	},
} as const;

const validHumanReplacementInput = {
	slotIndex: 5,
	nextJurorId: "human:hale",
	replacementReason: "original juror missed slot attestation",
	replacementTimestampSec: "1700001800",
	replacementSource: "vrf://chainlink/reissue/slot-5",
	replacementNonce:
		"0x3333333333333333333333333333333333333333333333333333333333333333",
	replacementRandomnessDigest:
		"0x4444444444444444444444444444444444444444444444444444444444444444",
} as const;

function buildCaseInitializationInput(overrides?: Record<string, unknown>) {
	return {
		mode: "case-initialization",
		config: validJuryWorkflowConfig,
		verifiedReport: validStrictFailEvidenceEnvelopeV3,
		juryRoundId: "1",
		rosterSelection: validRosterSelectionInput,
		...overrides,
	} as never;
}

function buildCaseInitializationPackage(
	overrides?: Record<string, unknown>,
): AdjudicationCaseEnvelope {
	return runJuryRecommendationPipeline(
		buildCaseInitializationInput(overrides),
	) as AdjudicationCaseEnvelope;
}

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

function buildBytes32Hex(seed: string): `0x${string}` {
	return `0x${seed.repeat(64).slice(0, 64)}` as `0x${string}`;
}

function buildSealedOpinionBatch(casePackage: AdjudicationCaseEnvelope) {
	return casePackage.payload.rosterCommitment.slots.map((slot) => ({
		slotIndex: slot.slotIndex,
		cohort: slot.cohort,
		jurorId: slot.jurorId,
		finalValidity: slot.slotIndex % 2 === 0 ? "HIGH" : "INVALID",
		rationaleDigest: buildBytes32Hex(`${slot.slotIndex + 1}`),
		testimonyDigest: buildBytes32Hex(`${slot.slotIndex + 11}`),
		ingestTimestampSec: `${1700001000 + slot.slotIndex}`,
	}));
}

function buildOpinionIngestInput(
	casePackage: AdjudicationCaseEnvelope,
	sealedOpinions = buildSealedOpinionBatch(casePackage),
	overrides?: Record<string, unknown>,
) {
	return {
		mode: "opinion-ingest",
		config: validJuryWorkflowConfig,
		casePackage,
		sealedOpinions,
		...overrides,
	} as never;
}

function buildOpinionIngestEnvelope(
	casePackage: AdjudicationCaseEnvelope,
	sealedOpinions = buildSealedOpinionBatch(casePackage),
): OpinionIngestEnvelope {
	return runJuryRecommendationPipeline(
		buildOpinionIngestInput(casePackage, sealedOpinions),
	) as OpinionIngestEnvelope;
}

function buildOpinionAggregationInput(
	casePackage: AdjudicationCaseEnvelope,
	opinionIngest = buildOpinionIngestEnvelope(casePackage),
	overrides?: Record<string, unknown>,
) {
	return {
		mode: "aggregate-opinions",
		config: validJuryWorkflowConfig,
		casePackage,
		opinionIngest,
		currentTimestampSec:
			casePackage.payload.juryDeadlineTimestampSec.toString(),
		...overrides,
	} as never;
}

function buildQualifiedConsensusOpinionBatch(
	casePackage: AdjudicationCaseEnvelope,
) {
	return buildSealedOpinionBatch(casePackage).map((opinion, index) => ({
		...opinion,
		finalValidity: index < 8 ? "HIGH" : "INVALID",
	}));
}

function buildQualifiedMediumConsensusOpinionBatch(
	casePackage: AdjudicationCaseEnvelope,
) {
	return buildSealedOpinionBatch(casePackage).map((opinion, index) => ({
		...opinion,
		finalValidity: index < 8 ? "MEDIUM" : "INVALID",
	}));
}

function buildOwnerAdjudicationOpinionBatch(
	casePackage: AdjudicationCaseEnvelope,
) {
	return buildSealedOpinionBatch(casePackage).map((opinion, index) => ({
		...opinion,
		finalValidity: index < 7 ? "HIGH" : "INVALID",
	}));
}

function buildOwnerAdjudicationHandoff(
	casePackage: AdjudicationCaseEnvelope,
	opinionIngest = buildOpinionIngestEnvelope(
		casePackage,
		buildOwnerAdjudicationOpinionBatch(casePackage),
	),
): OwnerAdjudicationHandoffEnvelope {
	return runJuryRecommendationPipeline(
		buildOpinionAggregationInput(casePackage, opinionIngest),
	) as OwnerAdjudicationHandoffEnvelope;
}

function buildOwnerAdjudicationFinalVerdict(
	casePackage: AdjudicationCaseEnvelope,
	handoff: OwnerAdjudicationHandoffEnvelope,
	opinionIngest: OpinionIngestEnvelope,
	overrides?: Record<string, unknown>,
) {
	return {
		handoff,
		opinionIngest,
		submissionId: casePackage.payload.submissionId.toString(),
		projectId: casePackage.payload.projectId.toString(),
		juryRoundId: casePackage.payload.juryRoundId.toString(),
		handoffReportType: "owner-adjudication-handoff/v1",
		scopeKey: handoff.payload.scopeKey,
		evidenceReportType: casePackage.payload.evidenceReportType,
		oasisEnvelopeHash: casePackage.payload.oasisEnvelopeHash,
		finalValidity: "INVALID",
		rationale:
			"Owner adjudication keeps the submission invalid after reviewing the failed quorum handoff and strict evidence package.",
		testimony:
			"Owner testimony confirms the decision stays scoped to the Task 8 handoff and the strict evidence package.",
		drainAmountWei: "0",
		currentTimestampSec:
			handoff.payload.adjudicationDeadlineTimestampSec.toString(),
		...overrides,
	} as never;
}

function buildJuryConsensusFinalVerdict(
	consensus: JuryConsensusEnvelope,
	opinionIngest: OpinionIngestEnvelope,
	overrides?: Record<string, unknown>,
) {
	return {
		consensus,
		opinionIngest,
		drainAmountWei: "900000000000000000",
		...overrides,
	} as never;
}

function buildForgedJuryConsensusEnvelope(
	consensus: JuryConsensusEnvelope,
): JuryConsensusEnvelope {
	return {
		...consensus,
		payload: {
			...consensus.payload,
			supportingOpinionRecordKeys: Array.from({ length: 8 }, (_, index) =>
				buildBytes32Hex(String(index + 21)),
			),
			supportingRationaleDigests: Array.from({ length: 8 }, (_, index) =>
				buildBytes32Hex(String(index + 31)),
			),
			supportingTestimonyDigests: Array.from({ length: 8 }, (_, index) =>
				buildBytes32Hex(String(index + 41)),
			),
			rationale:
				"Forged consensus payload reuses the case scope but swaps in caller-supplied supporting evidence.",
		},
	};
}

function buildForgedOwnerAdjudicationHandoff(
	handoff: OwnerAdjudicationHandoffEnvelope,
): OwnerAdjudicationHandoffEnvelope {
	return {
		...handoff,
		payload: {
			...handoff.payload,
			supportingOpinionRecordKeys: Array.from({ length: 7 }, (_, index) =>
				buildBytes32Hex(String(index + 51)),
			),
			supportingRationaleDigests: Array.from({ length: 7 }, (_, index) =>
				buildBytes32Hex(String(index + 61)),
			),
			supportingTestimonyDigests: Array.from({ length: 7 }, (_, index) =>
				buildBytes32Hex(String(index + 71)),
			),
			reason:
				"Forged owner handoff payload reuses the case scope but swaps in caller-supplied supporting evidence.",
		},
	};
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

	it("builds adjudication case initialization package from strict-fail evidence with zero severity", () => {
		const envelope = buildCaseInitializationPackage({
			verifiedReport: {
				...validStrictFailEvidenceEnvelopeV3,
				adjudication: {
					...validStrictFailEvidenceEnvelopeV3.adjudication,
					severity: 0,
				},
			},
		});

		expect(envelope.magic).toBe("ASRP");
		expect(envelope.reportType).toBe("adjudication-case/v1");
	expect(envelope.payload.submissionId).toBe(123n);
	expect(envelope.payload.projectId).toBe(7n);
	expect(envelope.payload.juryRoundId).toBe(1n);
	expect(envelope.payload.lifecycleStatus).toBe("JURY_PENDING");
	expect(envelope.payload.verdictSource).toBe("NONE");
	expect(envelope.payload.finalValidity).toBe("NONE");
	expect(envelope.payload.juryDeadlineTimestampSec).toBe(1700003660n);
	expect(envelope.payload.adjudicationDeadlineTimestampSec).toBe(1700007260n);
		expect(envelope.payload.evidenceReportType).toBe("verified-report/v3");
		expect(envelope.payload.juryLedgerDigest).toBe(
			"0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		);
		expect(envelope.payload.sourceEventKey).toBe(
			"0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
		);
		expect(envelope.payload.mappingFingerprint).toBe(
			"0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
		);
		expect(envelope.payload.syncId).toBe(
			"0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
		);
		expect(envelope.payload.idempotencyKey).toBe(
			"0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
		);
		expect(envelope.payload.cipherURI).toBe(
			"oasis://oasis-sapphire-testnet/0x1111111111111111111111111111111111111111/slot-42#0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
		);
		expect(envelope.payload.severity).toBe(0);
		expect(envelope.payload.chainSelectorName).toBe("ethereum-testnet-sepolia");
		expect(envelope.payload.bountyHubAddress).toBe(
			"0x17797b473864806072186f6997801D4473AAF6e8",
		);
		expect(envelope.payload.oasisEnvelopeHash).toBe(
			"0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
		);
		expect(envelope.payload.rosterCommitment.llmSlotCount).toBe(5);
		expect(envelope.payload.rosterCommitment.humanSlotCount).toBe(5);
		expect(envelope.payload.rosterCommitment.slots).toHaveLength(10);
		expect(envelope.payload.rosterCommitment.humanSlotReplacements).toEqual([]);
	});

	it("commits mixed ten-slot roster with selection provenance", () => {
		const envelope = buildCaseInitializationPackage();
		const repeatedEnvelope = buildCaseInitializationPackage();
		const alternateEnvelope = buildCaseInitializationPackage({
			rosterSelection: {
				...validRosterSelectionInput,
				humanSelection: {
					...validRosterSelectionInput.humanSelection,
					randomnessDigest:
						"0x5555555555555555555555555555555555555555555555555555555555555555",
				},
			},
		});
		const { rosterCommitment } = envelope.payload;
		const llmSlots = rosterCommitment.slots.slice(0, 5);
		const humanSlots = rosterCommitment.slots.slice(5);

		expect(rosterCommitment.rosterVersion).toBe("anti-soon.jury-roster.v1");
		expect(rosterCommitment.llmSlotCount).toBe(5);
		expect(rosterCommitment.humanSlotCount).toBe(5);
		expect(rosterCommitment.slots).toHaveLength(10);
		expect(llmSlots.map((slot) => slot.cohort)).toEqual([
			"LLM",
			"LLM",
			"LLM",
			"LLM",
			"LLM",
		]);
		expect(llmSlots.map((slot) => slot.jurorId)).toEqual(
			validRosterSelectionInput.llmJurors.map((slot) => slot.jurorId),
		);
		expect(humanSlots.map((slot) => slot.cohort)).toEqual([
			"HUMAN",
			"HUMAN",
			"HUMAN",
			"HUMAN",
			"HUMAN",
		]);
		expect(
			new Set(rosterCommitment.slots.map((slot) => slot.jurorId)).size,
		).toBe(10);
		expect(
			humanSlots.every((slot) =>
				validRosterSelectionInput.humanCandidates.some(
					(candidate) => candidate.jurorId === slot.jurorId,
				),
			),
		).toBe(true);
		expect(rosterCommitment.humanSelection.selectionVersion).toBe(
			"anti-soon.human-juror-selection.v1",
		);
		expect(rosterCommitment.humanSelection.randomnessDigest).toBe(
			"0x1111111111111111111111111111111111111111111111111111111111111111",
		);
		expect(rosterCommitment.humanSelection.selectionSource).toBe(
			"vrf://chainlink/round/42",
		);
		expect(rosterCommitment.humanSelection.selectionNonce).toBe(
			"0x2222222222222222222222222222222222222222222222222222222222222222",
		);
		expect(rosterCommitment.humanSelection.slotSelections).toHaveLength(5);
		expect(
			rosterCommitment.humanSelection.slotSelections.map(
				(slot) => slot.slotIndex,
			),
		).toEqual([5, 6, 7, 8, 9]);
		expect(
			rosterCommitment.humanSelection.slotSelections.map(
				(slot) => slot.jurorId,
			),
		).toEqual(humanSlots.map((slot) => slot.jurorId));
		expect(/^0x[0-9a-f]{64}$/.test(rosterCommitment.commitmentDigest)).toBe(
			true,
		);
		expect(/^0x[0-9a-f]{64}$/.test(rosterCommitment.rosterDigest)).toBe(true);
		expect(rosterCommitment.rosterDigest).toBe(
			rosterCommitment.commitmentDigest,
		);
		expect(repeatedEnvelope.payload.rosterCommitment.commitmentDigest).toBe(
			rosterCommitment.commitmentDigest,
		);
		expect(repeatedEnvelope.payload.rosterCommitment.rosterDigest).toBe(
			rosterCommitment.rosterDigest,
		);
		expect(alternateEnvelope.payload.rosterCommitment.rosterDigest).not.toBe(
			rosterCommitment.rosterDigest,
		);
	});

	it("rejects handcrafted final-package verdicts without consensus or owner handoff evidence", () => {
		const casePackage = buildCaseInitializationPackage();

		expect(() =>
			runJuryRecommendationPipeline({
				mode: "final-package",
				config: validJuryWorkflowConfig,
				casePackage,
				finalVerdict: {
					submissionId: "123",
					projectId: "7",
					juryRoundId: "1",
					verdictSource: "OWNER",
					finalValidity: "INVALID",
					rationale:
						"Owner adjudication rejects the submission after reviewing the jury ledger.",
					drainAmountWei: "0",
					ownerTestimonyDigest:
						"0x9999999999999999999999999999999999999999999999999999999999999999",
				},
			} as never),
		).toThrow("jury-consensus/v1 or owner-adjudication-handoff/v1 evidence");
	});

	it("rejects forged jury-consensus envelope at final packaging", () => {
		const casePackage = buildCaseInitializationPackage();
		const opinionIngest = buildOpinionIngestEnvelope(
			casePackage,
			buildQualifiedConsensusOpinionBatch(casePackage),
		);
		const consensus = runJuryRecommendationPipeline(
			buildOpinionAggregationInput(casePackage, opinionIngest),
		) as JuryConsensusEnvelope;

		expect(() =>
			runJuryRecommendationPipeline({
				mode: "final-package",
				config: validJuryWorkflowConfig,
				casePackage,
				finalVerdict: buildJuryConsensusFinalVerdict(
					buildForgedJuryConsensusEnvelope(consensus),
					opinionIngest,
				),
			} as never),
		).toThrow("trusted opinion aggregation");
	});

	it("rejects forged owner-adjudication handoff at final packaging", () => {
		const casePackage = buildCaseInitializationPackage();
		const opinionIngest = buildOpinionIngestEnvelope(
			casePackage,
			buildOwnerAdjudicationOpinionBatch(casePackage),
		);
		const handoff = buildOwnerAdjudicationHandoff(casePackage, opinionIngest);

		expect(() =>
			runJuryRecommendationPipeline({
				mode: "final-package",
				config: validJuryWorkflowConfig,
				casePackage,
				finalVerdict: buildOwnerAdjudicationFinalVerdict(
					casePackage,
					buildForgedOwnerAdjudicationHandoff(handoff),
					opinionIngest,
				),
			} as never),
		).toThrow("trusted opinion aggregation");
	});

	it("emits final adjudication package from jury-consensus evidence", () => {
		const casePackage = buildCaseInitializationPackage();
		const opinionIngest = buildOpinionIngestEnvelope(
			casePackage,
			buildQualifiedConsensusOpinionBatch(casePackage),
		);
		const consensus = runJuryRecommendationPipeline(
			buildOpinionAggregationInput(casePackage, opinionIngest),
		) as JuryConsensusEnvelope;

		const envelope = runJuryRecommendationPipeline({
			mode: "final-package",
			config: validJuryWorkflowConfig,
			casePackage,
			finalVerdict: buildJuryConsensusFinalVerdict(consensus, opinionIngest),
		} as never) as AdjudicationFinalPackageEnvelope;

	expect(envelope.reportType).toBe("adjudication-final/v1");
	expect(envelope.payload.verdictSource).toBe("JURY");
	expect(envelope.payload.finalValidity).toBe("HIGH");
	expect(envelope.payload.lifecycleStatus).toBe("VERIFIED");
	expect(envelope.payload.drainAmountWei).toBe(900000000000000000n);
	expect(envelope.payload.rationale).toBe(consensus.payload.rationale);
	expect(envelope.payload.ownerTestimonyDigest === undefined).toBe(true);
	});

	it("emits final adjudication package from medium-consensus evidence", () => {
		const casePackage = buildCaseInitializationPackage();
		const opinionIngest = buildOpinionIngestEnvelope(
			casePackage,
			buildQualifiedMediumConsensusOpinionBatch(casePackage),
		);
		const consensus = runJuryRecommendationPipeline(
			buildOpinionAggregationInput(casePackage, opinionIngest),
		) as JuryConsensusEnvelope;

		const envelope = runJuryRecommendationPipeline({
			mode: "final-package",
			config: validJuryWorkflowConfig,
			casePackage,
			finalVerdict: buildJuryConsensusFinalVerdict(consensus, opinionIngest),
		} as never) as AdjudicationFinalPackageEnvelope;

		expect(envelope.reportType).toBe("adjudication-final/v1");
		expect(envelope.payload.verdictSource).toBe("JURY");
		expect(envelope.payload.finalValidity).toBe("MEDIUM");
		expect(envelope.payload.lifecycleStatus).toBe("VERIFIED");
		expect(envelope.payload.drainAmountWei).toBe(900000000000000000n);
	});

	it("encodes final adjudication packages into contract lifecycle reports", () => {
		const casePackage = buildCaseInitializationPackage();
		const opinionIngest = buildOpinionIngestEnvelope(
			casePackage,
			buildQualifiedMediumConsensusOpinionBatch(casePackage),
		);
		const consensus = runJuryRecommendationPipeline(
			buildOpinionAggregationInput(casePackage, opinionIngest),
		) as JuryConsensusEnvelope;
		const envelope = runJuryRecommendationPipeline({
			mode: "final-package",
			config: validJuryWorkflowConfig,
			casePackage,
			finalVerdict: buildJuryConsensusFinalVerdict(consensus, opinionIngest),
		} as never) as AdjudicationFinalPackageEnvelope;

		const encoded = encodeJuryOrchestratorContractReport(envelope);

		expect(encoded.startsWith("0x41535250")).toBe(true);
		expect(encoded.length > 130).toBe(true);
	});

	it("encodes owner adjudication final packages for contract writeback", () => {
		const casePackage = buildCaseInitializationPackage();
		const opinionIngest = buildOpinionIngestEnvelope(
			casePackage,
			buildOwnerAdjudicationOpinionBatch(casePackage),
		);
		const handoff = buildOwnerAdjudicationHandoff(casePackage, opinionIngest);
		const envelope = runJuryRecommendationPipeline({
			mode: "final-package",
			config: validJuryWorkflowConfig,
			casePackage,
			finalVerdict: buildOwnerAdjudicationFinalVerdict(
				casePackage,
				handoff,
				opinionIngest,
			),
		} as never) as AdjudicationFinalPackageEnvelope;

		const encoded = encodeJuryOrchestratorContractReport(envelope);

		expect(encoded.startsWith("0x41535250")).toBe(true);
		expect(encoded.length > 130).toBe(true);
		expect(encoded).not.toBe(
			encodeJuryOrchestratorContractReport(
				runJuryRecommendationPipeline({
					mode: "final-package",
					config: validJuryWorkflowConfig,
					casePackage,
					finalVerdict: buildJuryConsensusFinalVerdict(
						runJuryRecommendationPipeline(
							buildOpinionAggregationInput(
								casePackage,
								buildOpinionIngestEnvelope(
									casePackage,
									buildQualifiedMediumConsensusOpinionBatch(casePackage),
								),
							),
						) as JuryConsensusEnvelope,
						buildOpinionIngestEnvelope(
							casePackage,
							buildQualifiedMediumConsensusOpinionBatch(casePackage),
						),
					),
				} as never) as AdjudicationFinalPackageEnvelope,
			),
		);
	});

	it("rejects opinion ingest for non-roster juror slot", () => {
		const casePackage = buildCaseInitializationPackage();
		const committedHumanSlots =
			casePackage.payload.rosterCommitment.slots.slice(5);
		const activeHumanSlot = committedHumanSlots[0];
		const committedJurorIds = new Set(
			casePackage.payload.rosterCommitment.slots.map((slot) => slot.jurorId),
		);
		const nonRosterCandidate = validRosterSelectionInput.humanCandidates.find(
			(candidate) => !committedJurorIds.has(candidate.jurorId),
		);

		expect(nonRosterCandidate !== undefined).toBe(true);
		expect(() =>
			assertOpinionIngestRosterSlotAuthorized(casePackage, {
				slotIndex: activeHumanSlot.slotIndex,
				cohort: "HUMAN",
				jurorId: nonRosterCandidate?.jurorId,
			}),
		).toThrow("committed roster");
	});

	it("records replacement provenance when a human juror slot is reissued", () => {
		const casePackage = buildCaseInitializationPackage();
		const replacementSlot = casePackage.payload.rosterCommitment.slots[5];
		const unaffectedHumanSlot = casePackage.payload.rosterCommitment.slots[6];
		const replacedCasePackage = reissueHumanJurorSlot(
			casePackage,
			validHumanReplacementInput,
		);
		const [replacementRecord] =
			replacedCasePackage.payload.rosterCommitment.humanSlotReplacements;

		expect(replacedCasePackage.payload.rosterCommitment.slots).toEqual(
			casePackage.payload.rosterCommitment.slots,
		);
		expect(replacedCasePackage.payload.rosterCommitment.commitmentDigest).toBe(
			casePackage.payload.rosterCommitment.commitmentDigest,
		);
		expect(replacedCasePackage.payload.rosterCommitment.rosterDigest).not.toBe(
			casePackage.payload.rosterCommitment.rosterDigest,
		);
		expect(replacementRecord.replacementVersion).toBe(
			"anti-soon.human-juror-replacement.v1",
		);
		expect(replacementRecord.slotIndex).toBe(5);
		expect(replacementRecord.cohortSlotIndex).toBe(0);
		expect(replacementRecord.previousJurorId).toBe(replacementSlot.jurorId);
		expect(replacementRecord.nextJurorId).toBe("human:hale");
		expect(replacementRecord.replacementReason).toBe(
			"original juror missed slot attestation",
		);
		expect(replacementRecord.replacementTimestampSec).toBe(1700001800n);
		expect(replacementRecord.replacementSource).toBe(
			"vrf://chainlink/reissue/slot-5",
		);
		expect(replacementRecord.replacementNonce).toBe(
			"0x3333333333333333333333333333333333333333333333333333333333333333",
		);
		expect(replacementRecord.replacementRandomnessDigest).toBe(
			"0x4444444444444444444444444444444444444444444444444444444444444444",
		);
		expect(/^0x[0-9a-f]{64}$/.test(replacementRecord.replacementDigest)).toBe(
			true,
		);
		expect(() =>
			assertOpinionIngestRosterSlotAuthorized(replacedCasePackage, {
				slotIndex: 5,
				cohort: "HUMAN",
				jurorId: replacementSlot.jurorId,
			}),
		).toThrow("committed roster");
		const replacedSlotAuth = assertOpinionIngestRosterSlotAuthorized(
			replacedCasePackage,
			{
				slotIndex: 5,
				cohort: "HUMAN",
				jurorId: "human:hale",
			},
		);
		expect(replacedSlotAuth.slotIndex).toBe(5);
		expect(replacedSlotAuth.cohort).toBe("HUMAN");
		expect(replacedSlotAuth.cohortSlotIndex).toBe(0);
		expect(replacedSlotAuth.jurorId).toBe("human:hale");

		const unaffectedSlotAuth = assertOpinionIngestRosterSlotAuthorized(
			replacedCasePackage,
			{
				slotIndex: unaffectedHumanSlot.slotIndex,
				cohort: unaffectedHumanSlot.cohort,
				jurorId: unaffectedHumanSlot.jurorId,
			},
		);
		expect(unaffectedSlotAuth.slotIndex).toBe(unaffectedHumanSlot.slotIndex);
		expect(unaffectedSlotAuth.cohort).toBe(unaffectedHumanSlot.cohort);
		expect(unaffectedSlotAuth.cohortSlotIndex).toBe(
			unaffectedHumanSlot.cohortSlotIndex,
		);
		expect(unaffectedSlotAuth.jurorId).toBe(unaffectedHumanSlot.jurorId);
	});

	it("accepts one sealed opinion for each committed juror slot", () => {
		const casePackage = buildCaseInitializationPackage();
		const sealedOpinions = buildSealedOpinionBatch(casePackage);

		expect(sealedOpinions).toHaveLength(
			casePackage.payload.rosterCommitment.slots.length,
		);
		expect(() =>
			runJuryRecommendationPipeline(
				buildOpinionIngestInput(casePackage, sealedOpinions),
			),
		).not.toThrow();
	});

	it("rejects duplicate juror votes for the same juror slot", () => {
		const casePackage = buildCaseInitializationPackage();
		const sealedOpinions = buildSealedOpinionBatch(casePackage);
		const duplicateOpinionBatch = [sealedOpinions[0], sealedOpinions[0]];

		expect(() =>
			runJuryRecommendationPipeline(
				buildOpinionIngestInput(casePackage, duplicateOpinionBatch),
			),
		).toThrow("JURY_LEDGER_APPEND_ONLY");
	});

	it("rejects malformed final validity choice in opinion payload", () => {
		const casePackage = buildCaseInitializationPackage();
		const sealedOpinions = buildSealedOpinionBatch(casePackage);
		const malformedOpinion = {
			...sealedOpinions[0],
			finalValidity: "MAYBE",
		};

		expect(() =>
			runJuryRecommendationPipeline(
				buildOpinionIngestInput(casePackage, [malformedOpinion]),
			),
		).toThrow("supported adjudication final validity");
	});

	it("requires 8 of 10 with at least 3 agreeing votes from each cohort", () => {
		const casePackage = buildCaseInitializationPackage();
		const opinionIngest = buildOpinionIngestEnvelope(
			casePackage,
			buildQualifiedConsensusOpinionBatch(casePackage),
		);

		const envelope = runJuryRecommendationPipeline(
			buildOpinionAggregationInput(casePackage, opinionIngest),
		) as JuryConsensusEnvelope;

	expect(envelope.reportType).toBe("jury-consensus/v1");
	expect(envelope.payload.verdictSource).toBe("JURY");
	expect(envelope.payload.finalValidity).toBe("HIGH");
	expect(envelope.payload.consensusVoteCount).toBe(8);
	expect(envelope.payload.llmAgreeingVoteCount).toBe(5);
	expect(envelope.payload.humanAgreeingVoteCount).toBe(3);
	expect(envelope.payload.supportingOpinionRecordKeys).toHaveLength(8);
	});

	it("accepts 8 of 10 medium votes with at least 3 agreeing votes from each cohort", () => {
		const casePackage = buildCaseInitializationPackage();
		const opinionIngest = buildOpinionIngestEnvelope(
			casePackage,
			buildQualifiedMediumConsensusOpinionBatch(casePackage),
		);

		const envelope = runJuryRecommendationPipeline(
			buildOpinionAggregationInput(casePackage, opinionIngest),
		) as JuryConsensusEnvelope;

		expect(envelope.reportType).toBe("jury-consensus/v1");
		expect(envelope.payload.verdictSource).toBe("JURY");
		expect(envelope.payload.finalValidity).toBe("MEDIUM");
		expect(envelope.payload.consensusVoteCount).toBe(8);
		expect(envelope.payload.llmAgreeingVoteCount).toBe(5);
		expect(envelope.payload.humanAgreeingVoteCount).toBe(3);
	});

	it("routes to owner review when 8 votes lack a three-per-cohort minimum", () => {
		const casePackage = buildCaseInitializationPackage();
		const opinionIngest = buildOpinionIngestEnvelope(
			casePackage,
			buildQualifiedConsensusOpinionBatch(casePackage),
		);

		const envelope = aggregateTargetStateOpinionRecords({
			casePackage,
			currentTimestampSec: casePackage.payload.juryDeadlineTimestampSec,
			records: opinionIngest.payload.records.map(
				(record, index): SealedJurorOpinionRecord => ({
					...record,
					cohort: index < 8 ? "LLM" : "HUMAN",
					finalValidity: index < 8 ? "HIGH" : "INVALID",
				}),
			),
		}) as OwnerAdjudicationHandoffEnvelope;

		expect(envelope.reportType).toBe("owner-adjudication-handoff/v1");
		expect(envelope.payload.lifecycleStatus).toBe(
			"AWAITING_OWNER_ADJUDICATION",
		);
	expect(envelope.payload.leadingFinalValidity).toBe("HIGH");
	expect(envelope.payload.leadingVoteCount).toBe(8);
	expect(envelope.payload.leadingLLMVoteCount).toBe(8);
	expect(envelope.payload.leadingHumanVoteCount).toBe(0);
		expect(envelope.payload.reason).toContain("three-per-cohort");
	});

	it("rejects votes read before the jury deadline", () => {
		const casePackage = buildCaseInitializationPackage();
		const opinionIngest = buildOpinionIngestEnvelope(casePackage);

		expect(() =>
			runJuryRecommendationPipeline(
				buildOpinionAggregationInput(casePackage, opinionIngest, {
					currentTimestampSec: "1700003599",
				}),
			),
		).toThrow("JURY_LEDGER_AGGREGATION_READ_BEFORE_DEADLINE");
	});

	it("fails closed when confidential ledger read breaks at aggregation time", () => {
		const casePackage = buildCaseInitializationPackage();
		const opinionIngest = buildOpinionIngestEnvelope(casePackage);
		const brokenOpinionIngest = {
			...opinionIngest,
			payload: {
				...opinionIngest.payload,
				recordCount: opinionIngest.payload.recordCount + 1,
			},
		};

		expect(() =>
			runJuryRecommendationPipeline(
				buildOpinionAggregationInput(casePackage, brokenOpinionIngest),
			),
		).toThrow("CONFIDENTIAL_JURY_LEDGER_READ_FAILED");
	});

	it("routes to owner review when no final validity reaches 8 of 10 votes", () => {
		const casePackage = buildCaseInitializationPackage();
		const opinionIngest = buildOpinionIngestEnvelope(
			casePackage,
			buildSealedOpinionBatch(casePackage).map((opinion, index) => ({
				...opinion,
				finalValidity: index < 7 ? "HIGH" : "INVALID",
			})),
		);

		const envelope = runJuryRecommendationPipeline(
			buildOpinionAggregationInput(casePackage, opinionIngest),
		) as OwnerAdjudicationHandoffEnvelope;

		expect(envelope.reportType).toBe("owner-adjudication-handoff/v1");
		expect(envelope.payload.lifecycleStatus).toBe(
			"AWAITING_OWNER_ADJUDICATION",
		);
	expect(envelope.payload.leadingFinalValidity).toBe("HIGH");
	expect(envelope.payload.leadingVoteCount).toBe(7);
	expect(envelope.payload.reason).toContain("8/10");
	});

	it("fails closed when a committed juror slot is missing at aggregation time", () => {
		const casePackage = buildCaseInitializationPackage();
		const opinionIngest = buildOpinionIngestEnvelope(
			casePackage,
			buildSealedOpinionBatch(casePackage).slice(0, 9),
		);

		expect(() =>
			runJuryRecommendationPipeline(
				buildOpinionAggregationInput(casePackage, opinionIngest),
			),
		).toThrow("missing committed juror vote");
	});

	it("fails closed when aggregation input includes a late vote", () => {
		const casePackage = buildCaseInitializationPackage();
		const opinionIngest = buildOpinionIngestEnvelope(
			casePackage,
			buildSealedOpinionBatch(casePackage).map((opinion, index) => ({
				...opinion,
				ingestTimestampSec:
					index === 9 ? "1700003661" : opinion.ingestTimestampSec,
			})),
		);

		expect(() =>
			runJuryRecommendationPipeline(
				buildOpinionAggregationInput(casePackage, opinionIngest),
			),
		).toThrow("late juror vote");
	});

	it("fails closed when aggregation input includes a duplicate juror slot", () => {
		const casePackage = buildCaseInitializationPackage();
		const opinionIngest = buildOpinionIngestEnvelope(casePackage);
		const duplicateOpinionIngest = {
			...opinionIngest,
			payload: {
				...opinionIngest.payload,
				recordCount: opinionIngest.payload.recordCount + 1,
				records: [
					...opinionIngest.payload.records,
					opinionIngest.payload.records[0],
				],
			},
		};

		expect(() =>
			runJuryRecommendationPipeline(
				buildOpinionAggregationInput(casePackage, duplicateOpinionIngest),
			),
		).toThrow("duplicate juror slot");
	});

	it("accepts owner testimony only after quorum failure", () => {
		const casePackage = buildCaseInitializationPackage();
		const opinionIngest = buildOpinionIngestEnvelope(
			casePackage,
			buildOwnerAdjudicationOpinionBatch(casePackage),
		);
		const handoff = buildOwnerAdjudicationHandoff(casePackage, opinionIngest);

		const envelope = runJuryRecommendationPipeline({
			mode: "final-package",
			config: validJuryWorkflowConfig,
			casePackage,
			finalVerdict: buildOwnerAdjudicationFinalVerdict(
				casePackage,
				handoff,
				opinionIngest,
			),
		} as never) as AdjudicationFinalPackageEnvelope;

		expect(envelope.reportType).toBe("adjudication-final/v1");
		expect(envelope.payload.verdictSource).toBe("OWNER");
		expect(envelope.payload.finalValidity).toBe("INVALID");
		expect(envelope.payload.lifecycleStatus).toBe("INVALID");
		expect(envelope.payload.ownerTestimonyDigest !== undefined).toBe(true);
		expect(
			/^0x[0-9a-f]{64}$/.test(envelope.payload.ownerTestimonyDigest ?? ""),
		).toBe(true);
	});

	it("rejects owner testimony submitted after adjudication deadline", () => {
		const casePackage = buildCaseInitializationPackage();
		const opinionIngest = buildOpinionIngestEnvelope(
			casePackage,
			buildOwnerAdjudicationOpinionBatch(casePackage),
		);
		const handoff = buildOwnerAdjudicationHandoff(casePackage, opinionIngest);

		const envelope = runJuryRecommendationPipeline({
			mode: "final-package",
			config: validJuryWorkflowConfig,
			casePackage,
			finalVerdict: buildOwnerAdjudicationFinalVerdict(
				casePackage,
				handoff,
				opinionIngest,
				{
					currentTimestampSec: (
						handoff.payload.adjudicationDeadlineTimestampSec + 1n
					).toString(),
				},
			),
		} as never) as OwnerAdjudicationExpiredEnvelope;

		expect(envelope.reportType).toBe("owner-adjudication-expired/v1");
		expect(envelope.payload.lifecycleStatus).toBe("OWNER_ADJUDICATION_EXPIRED");
		expect(envelope.payload.resolution).toBe("UNRESOLVED");
		expect(envelope.payload.scopeKey).toBe(handoff.payload.scopeKey);
		expect(envelope.payload.submittedAtTimestampSec).toBe(
			handoff.payload.adjudicationDeadlineTimestampSec + 1n,
		);
		expect(envelope.payload.adjudicationDeadlineTimestampSec).toBe(
			handoff.payload.adjudicationDeadlineTimestampSec,
		);
	});

	it("fails closed when owner testimony contradicts evidence package", () => {
		const casePackage = buildCaseInitializationPackage();
		const opinionIngest = buildOpinionIngestEnvelope(
			casePackage,
			buildOwnerAdjudicationOpinionBatch(casePackage),
		);
		const handoff = buildOwnerAdjudicationHandoff(casePackage, opinionIngest);

		expect(() =>
			runJuryRecommendationPipeline({
				mode: "final-package",
				config: validJuryWorkflowConfig,
				casePackage,
				finalVerdict: buildOwnerAdjudicationFinalVerdict(
					casePackage,
					handoff,
					opinionIngest,
					{
						oasisEnvelopeHash: buildBytes32Hex("1"),
					},
				),
			} as never),
		).toThrow("strict evidence package");
	});

	it("rejects legacy recommendation-only final verdict writes", () => {
		const casePackage = buildCaseInitializationPackage();

		expect(() =>
			runJuryRecommendationPipeline({
				mode: "final-package",
				config: validJuryWorkflowConfig,
				casePackage,
				finalVerdict: buildRecommendationFixture(
					"UPHOLD_AI_RESULT",
					"Legacy migration input should remain parseable but must not emit a final adjudication package.",
				),
			} as never),
		).toThrow("migration-only");
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
		} as never) as ReturnType<typeof buildRecommendationFixture>;

		const second = runJuryRecommendationPipeline({
			config: validJuryWorkflowConfig,
			recommendations: [
				buildRecommendationFixture("UPHOLD_AI_RESULT", "jury-c"),
				buildRecommendationFixture("UPHOLD_AI_RESULT", "jury-a"),
				buildRecommendationFixture("OVERTURN_AI_RESULT", "jury-b"),
			],
			requiredQuorum: 2,
		} as never) as ReturnType<typeof buildRecommendationFixture>;

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
		} as never) as ReturnType<typeof buildRecommendationFixture>;

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
		} as never) as ReturnType<typeof buildRecommendationFixture>;

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
