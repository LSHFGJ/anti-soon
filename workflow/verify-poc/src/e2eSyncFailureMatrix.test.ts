import { describe, expect, it } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as verifyPocModule from "../main"
import {
  SYNC_REASON_RETRYABLE_RPC,
  SYNC_REASON_RETRY_EXHAUSTED,
  decideVerifyPocStrictGate,
  type VerifyPocSyncReasonCode,
} from "../main"
import {
  deriveVerifyPocScopedIdempotencyKey,
  deriveVerifyPocSyncId,
  transitionVerifyPocSyncState,
  type VerifyPocIdempotencyInput,
  type VerifyPocSyncState,
} from "./idempotency"
import * as idempotencyStoreModule from "./idempotencyStore"
import {
  assertDurableVerifyPocIdempotencyMappingStable,
  claimDurableVerifyPocIdempotencySlot,
  loadVerifyPocIdempotencyStore,
  markDurableVerifyPocIdempotencyCompleted,
  markDurableVerifyPocIdempotencyQuarantined,
  type VerifyPocIdempotencyStore,
} from "./idempotencyStore"

type SyncFailureStage =
  | "sapphire_write"
  | "sepolia_commit"
  | "reveal"
  | "workflow_read"
  | "strict_gate"
  | "report_write"

type StageOutcome =
  | "written"
  | "failed"
  | "idempotency_skip"
  | "evidence_emitted"

type SeededFixture = {
  mappingVersion: string
  mappingMode: string
  chainSelectorName: string
  bountyHubAddress: `0x${string}`
  projectId: bigint
  submissionId: bigint
  cipherURI: string
  severity: number
  juryWindow: bigint
  adjudicationWindow: bigint
  commitTimestampSec: bigint
  revealTimestampSec: bigint
  envelopeHash: `0x${string}`
  txHash: `0x${string}`
  logIndex: bigint
}

type ReplayEvent = {
  txHash: `0x${string}`
  logIndex: bigint
  arrivalOrder: number
}

type SyncCounters = {
  sapphireWrites: number
  sepoliaCommits: number
  reveals: number
  workflowReads: number
  reportWriteAttempts: number
  effectiveReportWrites: number
  idempotencySkips: number
  quarantines: number
}

type StageResult = {
  outcome: StageOutcome
  failedStage?: SyncFailureStage
  idempotencyReason?: string
  idempotencyKey?: string
  evidencePackage?: string
}

function hex32(fill: string): `0x${string}` {
  return `0x${fill.repeat(64)}` as `0x${string}`
}

function makeFixture(overrides?: Partial<SeededFixture>): SeededFixture {
  return {
    mappingVersion: "anti-soon.verify-poc.revealed-map.v1",
    mappingMode: "poc_revealed",
    chainSelectorName: "ethereum-testnet-sepolia-1",
    bountyHubAddress: "0x1111111111111111111111111111111111111111",
    projectId: 9001n,
    submissionId: 7331n,
    cipherURI:
      "oasis://oasis-sapphire-testnet/0x1111111111111111111111111111111111111111/slot-17#0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    severity: 3,
    juryWindow: 3600n,
    adjudicationWindow: 3600n,
    commitTimestampSec: 1700000000n,
    revealTimestampSec: 1700000060n,
    envelopeHash: hex32("a"),
    txHash: hex32("b"),
    logIndex: 17n,
    ...overrides,
  }
}

function makeCounters(): SyncCounters {
  return {
    sapphireWrites: 0,
    sepoliaCommits: 0,
    reveals: 0,
    workflowReads: 0,
    reportWriteAttempts: 0,
    effectiveReportWrites: 0,
    idempotencySkips: 0,
    quarantines: 0,
  }
}

function buildIdempotencyInput(
  fixture: SeededFixture,
  event: ReplayEvent,
): VerifyPocIdempotencyInput {
  return {
    mappingVersion: fixture.mappingVersion,
    mappingMode: fixture.mappingMode,
    chainSelectorName: fixture.chainSelectorName,
    bountyHubAddress: fixture.bountyHubAddress,
    projectId: fixture.projectId,
    submissionId: fixture.submissionId,
    txHash: event.txHash,
    logIndex: event.logIndex,
  }
}

function prepareSyncToReveal(
  syncStateById: Map<string, VerifyPocSyncState>,
  syncId: string,
  counters: SyncCounters,
  failAt?: SyncFailureStage,
): StageResult {
  if (failAt === "sapphire_write") {
    return { outcome: "failed", failedStage: failAt }
  }

  counters.sapphireWrites += 1
  transitionVerifyPocSyncState(syncStateById, syncId, "SAPPHIRE_WRITTEN", {
    allowInitialize: true,
  })

  if (failAt === "sepolia_commit") {
    return { outcome: "failed", failedStage: failAt }
  }

  counters.sepoliaCommits += 1
  transitionVerifyPocSyncState(syncStateById, syncId, "SEPOLIA_COMMITTED")

  if (failAt === "reveal") {
    return { outcome: "failed", failedStage: failAt }
  }

  counters.reveals += 1
  transitionVerifyPocSyncState(syncStateById, syncId, "SEPOLIA_REVEALED")

  return { outcome: "written" }
}

function processRevealedEvent(
  store: VerifyPocIdempotencyStore,
  fixture: SeededFixture,
  event: ReplayEvent,
  syncStateById: Map<string, VerifyPocSyncState>,
  counters: SyncCounters,
  failAt?: SyncFailureStage,
  verificationReasonCode?: VerifyPocSyncReasonCode,
  verificationIsValid: boolean = true,
): StageResult {
  const syncId = deriveVerifyPocSyncId({
    projectId: fixture.projectId,
    submissionId: fixture.submissionId,
    envelopeHash: fixture.envelopeHash,
  })

  const mapped = assertDurableVerifyPocIdempotencyMappingStable(
    store,
    buildIdempotencyInput(fixture, event),
  )
  const idempotencyKey = deriveVerifyPocScopedIdempotencyKey({
    syncId,
    sourceEventFingerprint: mapped.sourceEventKey,
  })
  const decision = claimDurableVerifyPocIdempotencySlot(store, idempotencyKey)

  if (!decision.shouldProcess) {
    counters.idempotencySkips += 1
    return {
      outcome: "idempotency_skip",
      idempotencyReason: decision.reason,
      idempotencyKey,
    }
  }

  counters.workflowReads += 1
  if (failAt === "workflow_read") {
    markDurableVerifyPocIdempotencyQuarantined(store, idempotencyKey)
    transitionVerifyPocSyncState(syncStateById, syncId, "QUARANTINED")
    counters.quarantines += 1
    return { outcome: "failed", failedStage: failAt, idempotencyKey }
  }

  transitionVerifyPocSyncState(syncStateById, syncId, "WORKFLOW_VERIFIED")

  const strictGateDecision = (
    decideVerifyPocStrictGate as unknown as (args: {
      isValid: boolean
      reasonCode?: VerifyPocSyncReasonCode
    }) => {
      outcome: string
      reasonCode?: VerifyPocSyncReasonCode
    }
  )({
    isValid: verificationIsValid,
    reasonCode: verificationReasonCode,
  })
  if (strictGateDecision.outcome === "RETRY_SYNC") {
    markDurableVerifyPocIdempotencyQuarantined(store, idempotencyKey)
    transitionVerifyPocSyncState(syncStateById, syncId, "QUARANTINED")
    counters.quarantines += 1
    return { outcome: "failed", failedStage: "strict_gate", idempotencyKey }
  }

  if (strictGateDecision.outcome === "EMIT_EVIDENCE") {
    const buildStrictFailEvidenceEnvelope = (
      verifyPocModule as Record<string, unknown>
    ).buildVerifyPocStrictFailEvidenceEnvelope
    if (typeof buildStrictFailEvidenceEnvelope !== "function") {
      throw new Error("Expected buildVerifyPocStrictFailEvidenceEnvelope to be implemented")
    }

    const encodeTypedReportEnvelope = (
      verifyPocModule as Record<string, unknown>
    ).encodeVerifyPocTypedReportEnvelope
    if (typeof encodeTypedReportEnvelope !== "function") {
      throw new Error("Expected encodeVerifyPocTypedReportEnvelope to be implemented")
    }

    const markStrictFailed = (idempotencyStoreModule as Record<string, unknown>)
      .markDurableVerifyPocIdempotencyStrictFailed
    if (typeof markStrictFailed !== "function") {
      throw new Error("Expected markDurableVerifyPocIdempotencyStrictFailed to be implemented")
    }

    const evidenceEnvelope = (
      buildStrictFailEvidenceEnvelope as (args: {
        submissionId: bigint
        projectId: bigint
        cipherURI: string
        severity: number
        juryWindow: bigint
        adjudicationWindow: bigint
        commitTimestampSec: bigint
        revealTimestampSec: bigint
        syncId: `0x${string}`
        oasisReference: {
          pointer: {
            chain: string
            contract: `0x${string}`
            slotId: string
          }
          envelopeHash: `0x${string}`
        }
        sourceEventKey: `0x${string}`
        idempotencyKey: `0x${string}`
        mappingFingerprint: `0x${string}`
        verifyResult: {
          isValid: boolean
          drainAmountWei: bigint
          reasonCode?: string
          sapphireWriteTimestampSec?: bigint
        }
        chainSelectorName: string
        bountyHubAddress: `0x${string}`
        txHash: `0x${string}`
        logIndex: bigint
      }) => unknown
    )({
      submissionId: fixture.submissionId,
      projectId: fixture.projectId,
      cipherURI: fixture.cipherURI,
      severity: fixture.severity,
      juryWindow: fixture.juryWindow,
      adjudicationWindow: fixture.adjudicationWindow,
      commitTimestampSec: fixture.commitTimestampSec,
      revealTimestampSec: fixture.revealTimestampSec,
      syncId,
      oasisReference: {
        pointer: {
          chain: "oasis-sapphire-testnet",
          contract: "0x1111111111111111111111111111111111111111",
          slotId: "slot-17",
        },
        envelopeHash: fixture.envelopeHash,
      },
      sourceEventKey: mapped.sourceEventKey,
      idempotencyKey,
      mappingFingerprint: mapped.mappingFingerprint,
      verifyResult: {
        isValid: verificationIsValid,
        drainAmountWei: 0n,
        reasonCode: verificationReasonCode,
        sapphireWriteTimestampSec: fixture.commitTimestampSec,
      },
      chainSelectorName: fixture.chainSelectorName,
      bountyHubAddress: fixture.bountyHubAddress,
      txHash: fixture.txHash,
      logIndex: fixture.logIndex,
    })

    ;(
      markStrictFailed as (
        store: VerifyPocIdempotencyStore,
        syncId: string,
        nowMs?: number,
      ) => void
    )(store, idempotencyKey)

    return {
      outcome: "evidence_emitted",
      idempotencyKey,
      evidencePackage: (
        encodeTypedReportEnvelope as (envelope: unknown) => string
      )(evidenceEnvelope),
    }
  }

  counters.reportWriteAttempts += 1
  if (failAt === "report_write") {
    markDurableVerifyPocIdempotencyQuarantined(store, idempotencyKey)
    transitionVerifyPocSyncState(syncStateById, syncId, "QUARANTINED")
    counters.quarantines += 1
    return { outcome: "failed", failedStage: failAt, idempotencyKey }
  }

  markDurableVerifyPocIdempotencyCompleted(store, idempotencyKey)
  transitionVerifyPocSyncState(syncStateById, syncId, "REPORT_WRITTEN")
  counters.effectiveReportWrites += 1

  return { outcome: "written", idempotencyKey }
}

function runFullSyncAttempt(
  store: VerifyPocIdempotencyStore,
  fixture: SeededFixture,
  syncStateById: Map<string, VerifyPocSyncState>,
  counters: SyncCounters,
  failAt?: SyncFailureStage,
): StageResult {
  const syncId = deriveVerifyPocSyncId({
    projectId: fixture.projectId,
    submissionId: fixture.submissionId,
    envelopeHash: fixture.envelopeHash,
  })

  const preRevealResult = prepareSyncToReveal(syncStateById, syncId, counters, failAt)
  if (preRevealResult.outcome === "failed") {
    return preRevealResult
  }

  return processRevealedEvent(
    store,
    fixture,
    {
      txHash: fixture.txHash,
      logIndex: fixture.logIndex,
      arrivalOrder: 0,
    },
    syncStateById,
    counters,
    failAt,
  )
}

function currentSyncState(
  syncStateById: Map<string, VerifyPocSyncState>,
  syncId: string,
): VerifyPocSyncState | "UNSET" {
  return syncStateById.get(syncId) ?? "UNSET"
}

describe("verify-poc e2e sync failure matrix and replay safety", () => {
  it("full happy path writes exactly one effective report", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "verify-poc-e2e-happy-"))
    const storePath = join(tempDir, "idempotency.json")

    try {
      const fixture = makeFixture()
      const syncId = deriveVerifyPocSyncId({
        projectId: fixture.projectId,
        submissionId: fixture.submissionId,
        envelopeHash: fixture.envelopeHash,
      })
      const store = loadVerifyPocIdempotencyStore(storePath, 100)
      const syncStateById = new Map<string, VerifyPocSyncState>()
      const counters = makeCounters()

      const result = runFullSyncAttempt(
        store,
        fixture,
        syncStateById,
        counters,
      )

      expect(result.outcome).toBe("written")
      expect(currentSyncState(syncStateById, syncId)).toBe("REPORT_WRITTEN")
      expect(counters.sapphireWrites).toBe(1)
      expect(counters.sepoliaCommits).toBe(1)
      expect(counters.reveals).toBe(1)
      expect(counters.workflowReads).toBe(1)
      expect(counters.reportWriteAttempts).toBe(1)
      expect(counters.effectiveReportWrites).toBe(1)
      expect(counters.idempotencySkips).toBe(0)
      expect(result.idempotencyKey).toBeDefined()
      expect(store.syncStatusBySyncId.get(result.idempotencyKey || "")).toBe("completed")
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it("injects one deterministic failure at each sync stage", () => {
    const stageCases: Array<{
      stage: SyncFailureStage
      expectedFinalState: VerifyPocSyncState | "UNSET"
      expectedWorkflowReads: number
      expectedReportAttempts: number
    }> = [
      {
        stage: "sapphire_write",
        expectedFinalState: "UNSET",
        expectedWorkflowReads: 0,
        expectedReportAttempts: 0,
      },
      {
        stage: "sepolia_commit",
        expectedFinalState: "SAPPHIRE_WRITTEN",
        expectedWorkflowReads: 0,
        expectedReportAttempts: 0,
      },
      {
        stage: "reveal",
        expectedFinalState: "SEPOLIA_COMMITTED",
        expectedWorkflowReads: 0,
        expectedReportAttempts: 0,
      },
      {
        stage: "workflow_read",
        expectedFinalState: "QUARANTINED",
        expectedWorkflowReads: 1,
        expectedReportAttempts: 0,
      },
      {
        stage: "report_write",
        expectedFinalState: "QUARANTINED",
        expectedWorkflowReads: 1,
        expectedReportAttempts: 1,
      },
    ]

    for (const testCase of stageCases) {
      const tempDir = mkdtempSync(join(tmpdir(), `verify-poc-e2e-failure-${testCase.stage}-`))
      const storePath = join(tempDir, "idempotency.json")

      try {
        const fixture = makeFixture({
          projectId: 9001n + BigInt(testCase.expectedWorkflowReads),
          submissionId: 7331n + BigInt(testCase.expectedReportAttempts),
          envelopeHash:
            testCase.stage === "sapphire_write"
              ? hex32("1")
              : testCase.stage === "sepolia_commit"
                ? hex32("2")
                : testCase.stage === "reveal"
                  ? hex32("3")
                  : testCase.stage === "workflow_read"
                    ? hex32("4")
                    : hex32("5"),
        })
        const syncId = deriveVerifyPocSyncId({
          projectId: fixture.projectId,
          submissionId: fixture.submissionId,
          envelopeHash: fixture.envelopeHash,
        })
        const store = loadVerifyPocIdempotencyStore(storePath, 200)
        const syncStateById = new Map<string, VerifyPocSyncState>()
        const counters = makeCounters()

        const result = runFullSyncAttempt(
          store,
          fixture,
          syncStateById,
          counters,
          testCase.stage,
        )

        expect(result.outcome).toBe("failed")
        expect(result.failedStage).toBe(testCase.stage)
        expect(currentSyncState(syncStateById, syncId)).toBe(testCase.expectedFinalState)
        expect(counters.workflowReads).toBe(testCase.expectedWorkflowReads)
        expect(counters.reportWriteAttempts).toBe(testCase.expectedReportAttempts)
        expect(counters.effectiveReportWrites).toBe(0)

        if (testCase.stage === "workflow_read" || testCase.stage === "report_write") {
          expect(result.idempotencyKey).toBeDefined()
          expect(store.syncStatusBySyncId.get(result.idempotencyKey || "")).toBe("quarantined")
        }
      } finally {
        rmSync(tempDir, { recursive: true, force: true })
      }
    }
  })

  it("duplicate PoCRevealed replay performs one effective report write", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "verify-poc-e2e-duplicate-replay-"))
    const storePath = join(tempDir, "idempotency.json")

    try {
      const fixture = makeFixture({ envelopeHash: hex32("c"), txHash: hex32("d") })
      const syncId = deriveVerifyPocSyncId({
        projectId: fixture.projectId,
        submissionId: fixture.submissionId,
        envelopeHash: fixture.envelopeHash,
      })
      const store = loadVerifyPocIdempotencyStore(storePath, 300)
      const syncStateById = new Map<string, VerifyPocSyncState>()
      const counters = makeCounters()

      const preReveal = prepareSyncToReveal(syncStateById, syncId, counters)
      expect(preReveal.outcome).toBe("written")

      const first = processRevealedEvent(
        store,
        fixture,
        { txHash: fixture.txHash, logIndex: fixture.logIndex, arrivalOrder: 1 },
        syncStateById,
        counters,
      )
      const second = processRevealedEvent(
        store,
        fixture,
        { txHash: fixture.txHash, logIndex: fixture.logIndex, arrivalOrder: 2 },
        syncStateById,
        counters,
      )

      expect(first.outcome).toBe("written")
      expect(second.outcome).toBe("idempotency_skip")
      expect(second.idempotencyReason).toBe("already_completed")
      expect(counters.reportWriteAttempts).toBe(1)
      expect(counters.effectiveReportWrites).toBe(1)
      expect(counters.idempotencySkips).toBe(1)
      expect(currentSyncState(syncStateById, syncId)).toBe("REPORT_WRITTEN")
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it("reordered duplicate PoCRevealed replay queue still writes once", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "verify-poc-e2e-reordered-replay-"))
    const storePath = join(tempDir, "idempotency.json")

    try {
      const fixture = makeFixture({ envelopeHash: hex32("e"), txHash: hex32("f") })
      const syncId = deriveVerifyPocSyncId({
        projectId: fixture.projectId,
        submissionId: fixture.submissionId,
        envelopeHash: fixture.envelopeHash,
      })
      const syncStateById = new Map<string, VerifyPocSyncState>()
      const counters = makeCounters()

      const preReveal = prepareSyncToReveal(
        syncStateById,
        syncId,
        counters,
      )
      expect(preReveal.outcome).toBe("written")

      const replayQueue: ReplayEvent[] = [
        { txHash: fixture.txHash, logIndex: fixture.logIndex, arrivalOrder: 30 },
        { txHash: fixture.txHash, logIndex: fixture.logIndex, arrivalOrder: 10 },
        { txHash: fixture.txHash, logIndex: fixture.logIndex, arrivalOrder: 20 },
      ]

      const outcomes: StageOutcome[] = []
      for (let index = 0; index < replayQueue.length; index += 1) {
        const reloadedStore = loadVerifyPocIdempotencyStore(storePath, 400 + index)
        const result = processRevealedEvent(
          reloadedStore,
          fixture,
          replayQueue[index],
          syncStateById,
          counters,
        )
        outcomes.push(result.outcome)
      }

      expect(JSON.stringify(outcomes)).toBe(
        JSON.stringify(["written", "idempotency_skip", "idempotency_skip"]),
      )
      expect(counters.reportWriteAttempts).toBe(1)
      expect(counters.effectiveReportWrites).toBe(1)
      expect(counters.idempotencySkips).toBe(2)
      expect(currentSyncState(syncStateById, syncId)).toBe("REPORT_WRITTEN")
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it("retryable reason code strict gate quarantines before any report write", () => {
    const reasonCodes = [SYNC_REASON_RETRYABLE_RPC, SYNC_REASON_RETRY_EXHAUSTED]

    for (const [index, reasonCode] of reasonCodes.entries()) {
      const tempDir = mkdtempSync(
        join(tmpdir(), `verify-poc-e2e-strict-gate-${reasonCode.toLowerCase()}-`),
      )
      const storePath = join(tempDir, "idempotency.json")

      try {
        const fixture = makeFixture({
          projectId: 9100n + BigInt(index),
          submissionId: 7400n + BigInt(index),
          envelopeHash: index === 0 ? hex32("7") : hex32("8"),
          txHash: index === 0 ? hex32("9") : hex32("a"),
        })
        const syncId = deriveVerifyPocSyncId({
          projectId: fixture.projectId,
          submissionId: fixture.submissionId,
          envelopeHash: fixture.envelopeHash,
        })
        const store = loadVerifyPocIdempotencyStore(storePath, 500 + index)
        const syncStateById = new Map<string, VerifyPocSyncState>()
        const counters = makeCounters()

        const preReveal = prepareSyncToReveal(syncStateById, syncId, counters)
        expect(preReveal.outcome).toBe("written")

        const result = processRevealedEvent(
          store,
          fixture,
          { txHash: fixture.txHash, logIndex: fixture.logIndex, arrivalOrder: index },
          syncStateById,
          counters,
          undefined,
          reasonCode,
        )

        expect(result.outcome).toBe("failed")
        expect(result.failedStage).toBe("strict_gate")
        expect(currentSyncState(syncStateById, syncId)).toBe("QUARANTINED")
        expect(counters.workflowReads).toBe(1)
        expect(counters.reportWriteAttempts).toBe(0)
        expect(counters.effectiveReportWrites).toBe(0)
        expect(counters.quarantines).toBe(1)
        expect(store.syncStatusBySyncId.get(result.idempotencyKey || "")).toBe(
          "quarantined",
        )
      } finally {
        rmSync(tempDir, { recursive: true, force: true })
      }
    }
  })

  it("strict fail emits evidence package and skips final write", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "verify-poc-e2e-strict-fail-evidence-"))
    const storePath = join(tempDir, "idempotency.json")

    try {
      const fixture = makeFixture({
        projectId: 9200n,
        submissionId: 7500n,
        envelopeHash: hex32("6"),
        txHash: hex32("7"),
      })
      const syncId = deriveVerifyPocSyncId({
        projectId: fixture.projectId,
        submissionId: fixture.submissionId,
        envelopeHash: fixture.envelopeHash,
      })
      const store = loadVerifyPocIdempotencyStore(storePath, 600)
      const syncStateById = new Map<string, VerifyPocSyncState>()
      const counters = makeCounters()

      const preReveal = prepareSyncToReveal(syncStateById, syncId, counters)
      expect(preReveal.outcome).toBe("written")

      const result = processRevealedEvent(
        store,
        fixture,
        { txHash: fixture.txHash, logIndex: fixture.logIndex, arrivalOrder: 0 },
        syncStateById,
        counters,
        undefined,
        undefined,
        false,
      )

      expect(result.outcome).toBe("evidence_emitted")
      expect(result.evidencePackage).toContain('"reportType":"verified-report/v3"')
      expect(currentSyncState(syncStateById, syncId)).toBe("WORKFLOW_VERIFIED")
      expect(counters.workflowReads).toBe(1)
      expect(counters.reportWriteAttempts).toBe(0)
      expect(counters.effectiveReportWrites).toBe(0)
      expect(store.syncStatusBySyncId.get(result.idempotencyKey || "")).toBe(
        "strict_failed",
      )
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })
})
