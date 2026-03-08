import { describe, expect, it } from "bun:test"
import {
  JURY_LEDGER_AGGREGATION_READ_BEFORE_DEADLINE_ERROR,
  JURY_LEDGER_APPEND_ONLY_ERROR,
  appendJuryLedgerRecord,
  buildJuryAggregationResultRecord,
  buildJuryCaseHeaderRecord,
  buildJuryJurorRosterRecord,
  buildJuryOwnerTestimonyRecord,
  buildJurySealedOpinionRecord,
  createJuryLedgerState,
  readClosedJuryAggregationResultRecord,
} from "./juryLedgerSchema"
import { OASIS_ENVELOPE_VERSION } from "./oasisEnvelope"

function makeEnvelope(overrides?: {
  contract?: string
  slotId?: string
  ciphertextHash?: string
  ivHash?: string
}) {
  return {
    version: OASIS_ENVELOPE_VERSION,
    pointer: {
      chain: "oasis-sapphire-testnet",
      contract:
        overrides?.contract ?? "0x1111111111111111111111111111111111111111",
      slotId: overrides?.slotId ?? "jury-ledger-source-slot",
    },
    ciphertext: {
      ciphertextHash:
        overrides?.ciphertextHash ??
        "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      ivHash:
        overrides?.ivHash ??
        "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    },
  }
}

describe("jury ledger schema", () => {
  it("derives deterministic ledger keys for every round-scoped record role", () => {
    const header = buildJuryCaseHeaderRecord({
      submissionId: 77n,
      juryRoundId: 3n,
      projectId: 9n,
      juryDeadlineTimestamp: 1700000000,
    })
    const roster = buildJuryJurorRosterRecord({
      submissionId: 77n,
      juryRoundId: 3n,
      jurorSlots: [
        {
          jurorSlotIndex: 0,
          jurorAddress: "0xABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFABCD",
        },
        {
          jurorSlotIndex: 1,
          jurorAddress: "0x2222222222222222222222222222222222222222",
        },
      ],
    })
    const opinionA = buildJurySealedOpinionRecord({
      submissionId: "77",
      juryRoundId: "3",
      jurorSlotIndex: 0,
      jurorAddress: "0xABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFABCD",
      envelope: makeEnvelope({
        contract: "0xABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFABCD",
        slotId: "jury-opinion-slot-a",
        ciphertextHash:
          "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        ivHash:
          "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
      }),
    })
    const opinionB = buildJurySealedOpinionRecord({
      submissionId: 77n,
      juryRoundId: 3n,
      jurorSlotIndex: 0,
      jurorAddress: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
      envelope: makeEnvelope({
        contract: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
        slotId: "jury-opinion-slot-a",
      }),
    })
    const aggregation = buildJuryAggregationResultRecord({
      submissionId: 77n,
      juryRoundId: 3n,
      finalAction: "UPHOLD_AI_RESULT",
      aggregatedAtTimestamp: 1700000000,
      counts: {
        upholdAiResult: 2,
        overturnAiResult: 1,
        needsOwnerReview: 0,
      },
    })
    const testimony = buildJuryOwnerTestimonyRecord({
      submissionId: 77n,
      juryRoundId: 3n,
      envelope: makeEnvelope({
        slotId: "jury-owner-testimony-slot",
        ciphertextHash:
          "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
        ivHash:
          "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
      }),
      submittedAtTimestamp: 1699999990,
    })

    expect(header.scopeKey).toBe(roster.scopeKey)
    expect(roster.scopeKey).toBe(opinionA.scopeKey)
    expect(opinionA.scopeKey).toBe(aggregation.scopeKey)
    expect(aggregation.scopeKey).toBe(testimony.scopeKey)
    expect(opinionA.recordKey).toBe(opinionB.recordKey)
    expect(opinionA.slotId).toBe(opinionB.slotId)
    expect(new Set([
      header.recordKey,
      roster.recordKey,
      opinionA.recordKey,
      aggregation.recordKey,
      testimony.recordKey,
    ]).size).toBe(5)
    expect(header.slotId.startsWith("jury-ledger/v1/")).toBe(true)
    expect(roster.slotId.startsWith("jury-ledger/v1/")).toBe(true)
    expect(opinionA.slotId.startsWith("jury-ledger/v1/")).toBe(true)
    expect(aggregation.slotId.startsWith("jury-ledger/v1/")).toBe(true)
    expect(testimony.slotId.startsWith("jury-ledger/v1/")).toBe(true)
  })

  it("rejects second opinion for same juror slot", () => {
    const state = createJuryLedgerState()

    appendJuryLedgerRecord(
      state,
      buildJurySealedOpinionRecord({
        submissionId: 77n,
        juryRoundId: 3n,
        jurorSlotIndex: 1,
        jurorAddress: "0x3333333333333333333333333333333333333333",
        envelope: makeEnvelope({ slotId: "jury-opinion-slot-1-first" }),
      })
    )

    expect(() =>
      appendJuryLedgerRecord(
        state,
        buildJurySealedOpinionRecord({
          submissionId: 77n,
          juryRoundId: 3n,
          jurorSlotIndex: 1,
          jurorAddress: "0x3333333333333333333333333333333333333333",
          envelope: makeEnvelope({ slotId: "jury-opinion-slot-1-second" }),
        })
      )
    ).toThrow(JURY_LEDGER_APPEND_ONLY_ERROR)
  })

  it("rejects aggregation read before jury deadline", () => {
    const state = createJuryLedgerState()

    appendJuryLedgerRecord(
      state,
      buildJuryCaseHeaderRecord({
        submissionId: 77n,
        juryRoundId: 3n,
        projectId: 9n,
        juryDeadlineTimestamp: 1700000000,
      })
    )
    appendJuryLedgerRecord(
      state,
      buildJuryAggregationResultRecord({
        submissionId: 77n,
        juryRoundId: 3n,
        finalAction: "UPHOLD_AI_RESULT",
        aggregatedAtTimestamp: 1700000000,
        counts: {
          upholdAiResult: 2,
          overturnAiResult: 1,
          needsOwnerReview: 0,
        },
      })
    )

    expect(() =>
      readClosedJuryAggregationResultRecord({
        state,
        submissionId: 77n,
        juryRoundId: 3n,
        currentTimestamp: 1699999999,
      })
    ).toThrow(JURY_LEDGER_AGGREGATION_READ_BEFORE_DEADLINE_ERROR)
  })

  it("allows aggregation read at exact jury deadline", () => {
    const state = createJuryLedgerState()
    const aggregation = buildJuryAggregationResultRecord({
      submissionId: 77n,
      juryRoundId: 3n,
      finalAction: "UPHOLD_AI_RESULT",
      aggregatedAtTimestamp: 1700000000,
      counts: {
        upholdAiResult: 2,
        overturnAiResult: 1,
        needsOwnerReview: 0,
      },
    })

    appendJuryLedgerRecord(
      state,
      buildJuryCaseHeaderRecord({
        submissionId: 77n,
        juryRoundId: 3n,
        projectId: 9n,
        juryDeadlineTimestamp: 1700000000,
      })
    )
    appendJuryLedgerRecord(state, aggregation)

    expect(
      readClosedJuryAggregationResultRecord({
        state,
        submissionId: 77n,
        juryRoundId: 3n,
        currentTimestamp: 1700000000,
      })
    ).toEqual(aggregation)
  })
})
