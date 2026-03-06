import { describe, expect, it } from "bun:test"
import { decodeAbiParameters, parseAbiParameters } from "viem"
import * as verifyPocModule from "../main"
import {
  decodeVerifyPocReportEnvelope,
  encodeVerifyPocLegacyReport,
  encodeVerifyPocTypedReportEnvelope,
  type VerifyPocTypedReportEnvelope,
} from "../main"

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

    const legacyReport = encodeVerifyPocLegacyReport(456n, false, 0n)
    const decodedLegacy = decodeVerifyPocReportEnvelope(legacyReport)
    const encoded = (
      encodeContractReport as (
        report: ReturnType<typeof decodeVerifyPocReportEnvelope>,
      ) => `0x${string}`
    )(decodedLegacy)

    expect(encoded).toBe(legacyReport)
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
