import { describe, expect, it } from "bun:test"
import { decodeAbiParameters, parseAbiParameters } from "viem"
import * as verifyPocModule from "../main"
import {
  decodeVerifyPocReportEnvelope,
  encodeVerifyPocLegacyReport,
  encodeVerifyPocTypedReportEnvelope,
  type VerifyPocTypedReportEnvelope,
} from "../main"

declare const Bun: {
  file(path: URL | string): {
    text(): Promise<string>
  }
}

const verifyPocResultParams = parseAbiParameters(
  "uint256 submissionId, bool isValid, uint256 drainAmountWei"
)

const typedReportEnvelopeParams = parseAbiParameters(
  "bytes4 magic, uint8 reportType, bytes payload",
)

const typedVerifyPocContractPayloadParams = parseAbiParameters(
  "uint256 submissionId, bool isValid, uint256 drainAmountWei, bool hasJury, string juryAction, string juryRationale, bool hasGrouping, string groupingCohort, string groupId, uint256 groupRank, uint256 groupSize",
)

describe("verify-poc report encoding", () => {
  it("encodes verification result as legacy payload for hardened contract fallback", () => {
    const submissionId = 123n
    const isValid = true
    const drainAmountWei = 1000000000000000000n

    const encoded = encodeVerifyPocLegacyReport(submissionId, isValid, drainAmountWei)
    const [decodedSubmissionId, decodedIsValid, decodedDrain] = decodeAbiParameters(
      verifyPocResultParams,
      encoded,
    )

    expect(decodedSubmissionId).toBe(submissionId)
    expect(decodedIsValid).toBe(isValid)
    expect(decodedDrain).toBe(drainAmountWei)
  })

  it("round-trips verified-report/v2 envelopes with jury and testimony metadata", () => {
    const envelope: VerifyPocTypedReportEnvelope = {
      magic: "ASRP",
      reportType: "verified-report/v2",
      payload: {
        submissionId: 123n,
        projectId: 7n,
        isValid: true,
        drainAmountWei: 1000000000000000000n,
        observedCalldata: ["0xdeadbeef", "0xfeedface"],
      },
      jury: {
        recommendationReportType: "jury-recommendation/v1",
        action: "NEEDS_OWNER_REVIEW",
        rationale: "Consensus was unresolved and should stay owner-mediated.",
      },
      testimony: {
        recommendationReportType: "jury-recommendation/v1",
        testimony: "Owner supplied additional dispute context for manual adjudication.",
      },
    }

    const encoded = encodeVerifyPocTypedReportEnvelope(envelope)
    const decoded = decodeVerifyPocReportEnvelope(encoded)

    expect(decoded.reportType).toBe("verified-report/v2")
    if (decoded.reportType !== "verified-report/v2") {
      throw new Error("Expected verified-report/v2 envelope")
    }

    expect(decoded.magic).toBe(envelope.magic)
    expect(decoded.payload.submissionId).toBe(envelope.payload.submissionId)
    expect(decoded.payload.projectId).toBe(envelope.payload.projectId)
    expect(decoded.payload.isValid).toBe(envelope.payload.isValid)
    expect(decoded.payload.drainAmountWei).toBe(envelope.payload.drainAmountWei)
    expect(decoded.payload.observedCalldata.join(",")).toBe(
      envelope.payload.observedCalldata.join(","),
    )
    if (!envelope.jury || !envelope.testimony) {
      throw new Error("Expected verified-report/v2 fixture to include jury and testimony")
    }

    expect(decoded.jury?.action).toBe(envelope.jury.action)
    expect(decoded.jury?.rationale).toBe(envelope.jury.rationale)
    expect(decoded.testimony?.testimony).toBe(envelope.testimony.testimony)
  })

  it("round-trips verified-report/v2 envelopes with optional MULTI grouping metadata", () => {
    const envelope: VerifyPocTypedReportEnvelope = {
      magic: "ASRP",
      reportType: "verified-report/v2",
      payload: {
        submissionId: 321n,
        projectId: 9n,
        isValid: true,
        drainAmountWei: 250000000000000000n,
        observedCalldata: ["0x2e1a7d4d00000001"],
      },
      grouping: {
        groupingVersion: "anti-soon.verify-poc.multi-grouping.v1",
        cohort: "HIGH",
        groupId: "multi-high-1234abcd",
        clusterKey:
          '{"cohort":"HIGH","targetContract":"0x00000000000000000000000000000000000000aa","impactType":"REENTRANCY","memberFingerprints":["0xabc"]}',
        groupRank: 1,
        cohortRank: 1,
        memberRank: 1,
        groupSize: 2,
        representativeSubmissionId: 321n,
      },
    }

    const encoded = encodeVerifyPocTypedReportEnvelope(envelope)
    const decoded = decodeVerifyPocReportEnvelope(encoded)

    expect(decoded.reportType).toBe("verified-report/v2")
    if (decoded.reportType !== "verified-report/v2") {
      throw new Error("Expected verified-report/v2 envelope")
    }

    expect(decoded.grouping?.groupingVersion).toBe(envelope.grouping?.groupingVersion)
    expect(decoded.grouping?.cohort).toBe(envelope.grouping?.cohort)
    expect(decoded.grouping?.groupId).toBe(envelope.grouping?.groupId)
    expect(decoded.grouping?.clusterKey).toBe(envelope.grouping?.clusterKey)
    expect(decoded.grouping?.groupRank).toBe(envelope.grouping?.groupRank)
    expect(decoded.grouping?.cohortRank).toBe(envelope.grouping?.cohortRank)
    expect(decoded.grouping?.memberRank).toBe(envelope.grouping?.memberRank)
    expect(decoded.grouping?.groupSize).toBe(envelope.grouping?.groupSize)
    expect(decoded.grouping?.representativeSubmissionId).toBe(
      envelope.grouping?.representativeSubmissionId,
    )
  })

  it("encodes verified-report/v3 envelopes with jury commitment and adjudication metadata", () => {
    const buildStrictFailEvidenceEnvelope = (
      verifyPocModule as Record<string, unknown>
    ).buildVerifyPocStrictFailEvidenceEnvelope
    expect(typeof buildStrictFailEvidenceEnvelope).toBe("function")

    const envelope = (
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
      submissionId: 123n,
      projectId: 7n,
      cipherURI:
        "oasis://oasis-sapphire-testnet/0x1111111111111111111111111111111111111111/slot-42#0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      severity: 3,
      juryWindow: 3600n,
      adjudicationWindow: 3600n,
      commitTimestampSec: 1700000000n,
      revealTimestampSec: 1700000060n,
      syncId: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      oasisReference: {
        pointer: {
          chain: "oasis-sapphire-testnet",
          contract: "0x1111111111111111111111111111111111111111",
          slotId: "slot-42",
        },
        envelopeHash:
          "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      },
      sourceEventKey:
        "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      idempotencyKey:
        "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
      mappingFingerprint:
        "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      verifyResult: {
        isValid: false,
        drainAmountWei: 0n,
        reasonCode: "BINDING_MISMATCH",
        sapphireWriteTimestampSec: 1700000005n,
      },
      chainSelectorName: "ethereum-testnet-sepolia-1",
      bountyHubAddress: "0x2222222222222222222222222222222222222222",
      txHash: "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      logIndex: 9n,
    })

    const encoded = encodeVerifyPocTypedReportEnvelope(
      envelope as VerifyPocTypedReportEnvelope,
    )
    const decoded = decodeVerifyPocReportEnvelope(encoded) as {
      reportType: string
      magic: string
      payload: {
        submissionId: bigint
        projectId: bigint
        isValid: boolean
        drainAmountWei: bigint
      }
      juryCommitment: {
        commitmentVersion: string
        juryLedgerDigest: string
        sourceEventKey: string
        mappingFingerprint: string
      }
      adjudication: {
        adjudicationVersion: string
        syncId: string
        idempotencyKey: string
        cipherURI: string
        severity: number
        juryWindow: bigint
        adjudicationWindow: bigint
        reasonCode?: string
        chainSelectorName: string
        bountyHubAddress: string
        oasis: {
          chain: string
          contract: string
          slotId: string
          envelopeHash: string
        }
      }
    }

    expect(decoded.reportType).toBe("verified-report/v3")
    expect(decoded.magic).toBe("ASRP")
    expect(decoded.payload.submissionId).toBe(123n)
    expect(decoded.payload.projectId).toBe(7n)
    expect(decoded.payload.isValid).toBe(false)
    expect(decoded.payload.drainAmountWei).toBe(0n)
    expect(decoded.juryCommitment.commitmentVersion).toBe(
      "anti-soon.verify-poc.jury-commitment.v1",
    )
    expect(decoded.juryCommitment.juryLedgerDigest).toMatch(
      /^0x[0-9a-f]{64}$/,
    )
    expect(decoded.juryCommitment.sourceEventKey).toBe(
      "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    )
    expect(decoded.juryCommitment.mappingFingerprint).toBe(
      "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    )
    expect(decoded.adjudication.adjudicationVersion).toBe(
      "anti-soon.verify-poc.adjudication.v1",
    )
    expect(decoded.adjudication.syncId).toBe(
      "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    )
    expect(decoded.adjudication.idempotencyKey).toBe(
      "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
    )
    expect(decoded.adjudication.cipherURI).toBe(
      "oasis://oasis-sapphire-testnet/0x1111111111111111111111111111111111111111/slot-42#0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    )
    expect(decoded.adjudication.severity).toBe(3)
    expect(decoded.adjudication.juryWindow).toBe(3600n)
    expect(decoded.adjudication.adjudicationWindow).toBe(3600n)
    expect(decoded.adjudication.reasonCode).toBe("BINDING_MISMATCH")
    expect(decoded.adjudication.chainSelectorName).toBe(
      "ethereum-testnet-sepolia-1",
    )
    expect(decoded.adjudication.bountyHubAddress).toBe(
      "0x2222222222222222222222222222222222222222",
    )
    expect(decoded.adjudication.oasis).toEqual({
      chain: "oasis-sapphire-testnet",
      contract: "0x1111111111111111111111111111111111111111",
      slotId: "slot-42",
      envelopeHash:
        "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    })
  })

  it("encodes verified-report/v2 envelopes into contract typed reports with readable jury/grouping fields", () => {
    const encodeContractReport = (
      verifyPocModule as Record<string, unknown>
    ).encodeVerifyPocContractReport
    expect(typeof encodeContractReport).toBe("function")

    const envelope: VerifyPocTypedReportEnvelope = {
      magic: "ASRP",
      reportType: "verified-report/v2",
      payload: {
        submissionId: 321n,
        projectId: 9n,
        isValid: true,
        drainAmountWei: 250000000000000000n,
        observedCalldata: ["0x2e1a7d4d00000001"],
      },
      jury: {
        recommendationReportType: "jury-recommendation/v1",
        action: "UPHOLD_AI_RESULT",
        rationale: "Consensus aligned with the measured drain.",
      },
      grouping: {
        groupingVersion: "anti-soon.verify-poc.multi-grouping.v1",
        cohort: "HIGH",
        groupId: "g-high-001",
        clusterKey: '{"cohort":"HIGH"}',
        groupRank: 1,
        cohortRank: 1,
        memberRank: 1,
        groupSize: 3,
        representativeSubmissionId: 321n,
      },
    }

    const encoded = (
      encodeContractReport as (
        report: VerifyPocTypedReportEnvelope,
      ) => `0x${string}`
    )(envelope)

    const [magic, reportType, payload] = decodeAbiParameters(
      typedReportEnvelopeParams,
      encoded,
    )
    expect(magic).toBe("0x41535250")
    expect(Number(reportType)).toBe(3)

    const [
      submissionId,
      isValid,
      drainAmountWei,
      hasJury,
      juryAction,
      juryRationale,
      hasGrouping,
      groupingCohort,
      groupId,
      groupRank,
      groupSize,
    ] = decodeAbiParameters(typedVerifyPocContractPayloadParams, payload)

    expect(submissionId).toBe(envelope.payload.submissionId)
    expect(isValid).toBe(envelope.payload.isValid)
    expect(drainAmountWei).toBe(envelope.payload.drainAmountWei)
    expect(hasJury).toBe(true)
    expect(juryAction).toBe(envelope.jury?.action)
    expect(juryRationale).toBe(envelope.jury?.rationale)
    expect(hasGrouping).toBe(true)
    expect(groupingCohort).toBe(envelope.grouping?.cohort)
    expect(groupId).toBe(envelope.grouping?.groupId)
    expect(Number(groupRank)).toBe(envelope.grouping?.groupRank)
    expect(Number(groupSize)).toBe(envelope.grouping?.groupSize)
  })

  it("keeps legacy verify-poc report encoding available for backward-compatible contract writes", () => {
    const encodeContractReport = (
      verifyPocModule as Record<string, unknown>
    ).encodeVerifyPocContractReport
    expect(typeof encodeContractReport).toBe("function")

    const buildStrictPassReportEnvelope = (
      verifyPocModule as Record<string, unknown>
    ).buildVerifyPocStrictPassReportEnvelope
    expect(typeof buildStrictPassReportEnvelope).toBe("function")

    const strictPassEnvelope = (
      buildStrictPassReportEnvelope as (args: {
        submissionId: bigint
        projectId: bigint
        verifyResult: {
          isValid: boolean
          drainAmountWei: bigint
        }
      }) => VerifyPocTypedReportEnvelope
    )({
      submissionId: 456n,
      projectId: 88n,
      verifyResult: {
        isValid: true,
        drainAmountWei: 777n,
      },
    })
    const strictPassEncoded = (
      encodeContractReport as (report: VerifyPocTypedReportEnvelope) => `0x${string}`
    )(strictPassEnvelope)
    const [strictPassMagic, strictPassReportType, strictPassPayload] =
      decodeAbiParameters(typedReportEnvelopeParams, strictPassEncoded)

    expect(strictPassMagic).toBe("0x41535250")
    expect(Number(strictPassReportType)).toBe(3)
    const [strictPassSubmissionId, strictPassIsValid, strictPassDrainAmountWei] =
      decodeAbiParameters(
        parseAbiParameters(
          "uint256 submissionId, bool isValid, uint256 drainAmountWei, bool hasJury, string juryAction, string juryRationale, bool hasGrouping, string groupingCohort, string groupId, uint256 groupRank, uint256 groupSize",
        ),
        strictPassPayload,
      )
    expect(strictPassSubmissionId).toBe(456n)
    expect(strictPassIsValid).toBe(true)
    expect(strictPassDrainAmountWei).toBe(777n)

    const legacyReport = encodeVerifyPocLegacyReport(456n, false, 0n)
    const decodedLegacy = decodeVerifyPocReportEnvelope(legacyReport)
    const encoded = (
      encodeContractReport as (
        report: ReturnType<typeof decodeVerifyPocReportEnvelope>,
      ) => `0x${string}`
    )(decodedLegacy)

    expect(encoded).toBe(legacyReport)
  })

  it("rejects adjudication-final reports from the verify-poc contract write path", () => {
    const encodeContractReport = (
      verifyPocModule as Record<string, unknown>
    ).encodeVerifyPocContractReport
    expect(typeof encodeContractReport).toBe("function")

    expect(() =>
      (encodeContractReport as (report: unknown) => `0x${string}`)({
        magic: "ASRP",
        reportType: "adjudication-final/v1",
        payload: {
          submissionId: 777n,
          projectId: 12n,
          juryRoundId: 4n,
          lifecycleStatus: "VERIFIED",
          verdictSource: "OWNER",
          finalValidity: "MEDIUM",
          isValid: true,
          drainAmountWei: 900000000000000000n,
          rationale: "Owner testimony upheld the final multi verdict.",
          juryDeadlineTimestampSec: 1700003600n,
          adjudicationDeadlineTimestampSec: 1700007200n,
          evidenceReportType: "verified-report/v3",
          juryLedgerDigest:
            "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          ownerTestimonyDigest:
            "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          sourceEventKey:
            "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
          mappingFingerprint:
            "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
          syncId:
            "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
          idempotencyKey:
            "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
          cipherURI:
            "oasis://oasis-sapphire-testnet/0x1111111111111111111111111111111111111111/slot-42#0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          severity: 2,
          chainSelectorName: "ethereum-testnet-sepolia-1",
          bountyHubAddress: "0x2222222222222222222222222222222222222222",
          oasisEnvelopeHash:
            "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          rosterCommitment: {},
        },
      }),
    ).toThrow("adjudication-final/v1 must be encoded by jury-orchestrator")
  })

  it("rejects owner-adjudication-expired reports from the final contract write path", () => {
    const encodeContractReport = (
      verifyPocModule as Record<string, unknown>
    ).encodeVerifyPocContractReport
    expect(typeof encodeContractReport).toBe("function")

    expect(() =>
      (encodeContractReport as (report: unknown) => `0x${string}`)({
        magic: "ASRP",
        reportType: "owner-adjudication-expired/v1",
        payload: {
          submissionId: 777n,
          projectId: 12n,
          juryRoundId: 4n,
          lifecycleStatus: "OWNER_ADJUDICATION_EXPIRED",
          resolution: "UNRESOLVED",
          scopeKey:
            "0x1111111111111111111111111111111111111111111111111111111111111111",
          juryDeadlineTimestampSec: 1700003600n,
          adjudicationDeadlineTimestampSec: 1700007200n,
          submittedAtTimestampSec: 1700007201n,
          evidenceReportType: "verified-report/v3",
          oasisEnvelopeHash:
            "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          reason: "Owner adjudication expired without a final verdict.",
        },
      }),
    ).toThrow("owner-adjudication-expired/v1 cannot be committed as a final verdict")
  })

  it("continues decoding legacy raw verify-poc reports without envelope metadata", () => {
    const submissionId = 456n
    const encoded = encodeVerifyPocLegacyReport(submissionId, false, 0n)
    const decoded = decodeVerifyPocReportEnvelope(encoded)

    expect(decoded.reportType).toBe("legacy-verify-poc/v0")
    if (decoded.reportType !== "legacy-verify-poc/v0") {
      throw new Error("Expected legacy verify-poc report")
    }

    expect(decoded.payload.submissionId).toBe(submissionId)
    expect(decoded.payload.isValid).toBe(false)
    expect(decoded.payload.drainAmountWei).toBe(0n)
  })
})

describe("verify-poc workflow entrypoint", () => {
  it("uses a CRE-safe wrapper entrypoint", async () => {
    const workflowYaml = await Bun.file(
      new URL("../workflow.yaml", import.meta.url),
    ).text()

    expect(workflowYaml).toContain('workflow-path: "./entrypoint.ts"')
  })
})
