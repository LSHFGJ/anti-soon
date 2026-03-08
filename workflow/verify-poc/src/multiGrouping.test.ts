import { describe, expect, it } from "bun:test"

type MultiFixtureSubmission = {
  submissionId: bigint
  severity: string
  targetContract: string
  impactType: string
  summary: string
  observedCalldata: string[]
}

type MultiGroupingResult = {
  groups: Array<{
    groupId: string
    cohort: "HIGH" | "MEDIUM" | "OTHER"
    groupRank: number
    cohortRank: number
    size: number
    memberSubmissionIds: string[]
  }>
  submissions: Array<{
    submissionId: string
    cohort: "HIGH" | "MEDIUM" | "OTHER"
    groupId: string
    groupRank: number
    cohortRank: number
    memberRank: number
    groupSize: number
    similarityScore: number
  }>
}

type MultiGroupingModule = {
  buildDeterministicMultiSubmissionGroups: (
    submissions: readonly MultiFixtureSubmission[],
  ) => MultiGroupingResult
  buildPostVerdictMultiSubmissionGroups: (args: {
    competitionMode: "MULTI" | "UNIQUE"
    finalValidity: "NONE" | "VALID" | "INVALID"
    severity: string
    submissions: readonly MultiFixtureSubmission[]
  }) => MultiGroupingResult | null
}

const seededMultiFixtures: MultiFixtureSubmission[] = [
  {
    submissionId: 14n,
    severity: "HIGH",
    targetContract: "0x00000000000000000000000000000000000000AA",
    impactType: "REENTRANCY",
    summary: "Repeated withdraw reentrancy drains the vault balance via fallback recursion.",
    observedCalldata: ["0x2e1a7d4d00000001"],
  },
  {
    submissionId: 11n,
    severity: "HIGH",
    targetContract: "0x00000000000000000000000000000000000000aa",
    impactType: "REENTRANCY",
    summary: "Fallback-driven reentrant withdraw loop can drain the vault repeatedly.",
    observedCalldata: ["0x2e1a7d4d00000002"],
  },
  {
    submissionId: 31n,
    severity: "HIGH",
    targetContract: "0x00000000000000000000000000000000000000AA",
    impactType: "ACCESS_CONTROL",
    summary: "Emergency withdraw lacks an owner check and bypasses authorization.",
    observedCalldata: ["0xdb2e21bc00000001"],
  },
  {
    submissionId: 9n,
    severity: "MEDIUM",
    targetContract: "0x00000000000000000000000000000000000000BB",
    impactType: "PRICE_MANIPULATION",
    summary: "Oracle update lag allows underpriced minting against stale quotes.",
    observedCalldata: ["0xfeaf968c00000001"],
  },
  {
    submissionId: 7n,
    severity: "MEDIUM",
    targetContract: "0x00000000000000000000000000000000000000bb",
    impactType: "PRICE_MANIPULATION",
    summary: "Stale oracle prices let attackers mint before the quote catches up.",
    observedCalldata: ["0xfeaf968c00000002"],
  },
  {
    submissionId: 41n,
    severity: "MEDIUM",
    targetContract: "0x00000000000000000000000000000000000000BB",
    impactType: "ARITHMETIC",
    summary: "Fee rounding leaves dust in the pool but does not drain balances.",
    observedCalldata: ["0xbc25cf7700000001"],
  },
]

const adversarialNearDuplicateFixtures: MultiFixtureSubmission[] = [
  {
    submissionId: 101n,
    severity: "HIGH",
    targetContract: "0x00000000000000000000000000000000000000CC",
    impactType: "REENTRANCY",
    summary: "Repeated withdraw reentrancy drains the vault balance via fallback recursion.",
    observedCalldata: ["0x2e1a7d4d00000001"],
  },
  {
    submissionId: 102n,
    severity: "HIGH",
    targetContract: "0x00000000000000000000000000000000000000CC",
    impactType: "REENTRANCY",
    summary: "Repeated withdraw reentrancy drains the vault balance via fallback recursion.",
    observedCalldata: ["0xb6b55f2500000001"],
  },
]

function normalizeForSnapshot(value: unknown): string {
  return JSON.stringify(value, (_key, candidate) =>
    typeof candidate === "bigint" ? candidate.toString() : candidate,
  )
}

async function loadMultiGroupingModule(): Promise<MultiGroupingModule> {
  const specifier = "./multiGrouping"
  const loaded = await import(specifier).catch(() => null)

  expect(loaded).not.toBeNull()

  const candidate = loaded as Partial<MultiGroupingModule> | null
  expect(typeof candidate?.buildDeterministicMultiSubmissionGroups).toBe("function")

  return candidate as MultiGroupingModule
}

describe("verify-poc MULTI similarity grouping", () => {
  it("groups similar MULTI submissions into deterministic HIGH and MEDIUM cohorts", async () => {
    const { buildDeterministicMultiSubmissionGroups } = await loadMultiGroupingModule()
    const result = buildDeterministicMultiSubmissionGroups(seededMultiFixtures)

    expect(result.groups.map((group) => ({
      cohort: group.cohort,
      groupRank: group.groupRank,
      cohortRank: group.cohortRank,
      size: group.size,
      memberSubmissionIds: group.memberSubmissionIds,
    }))).toEqual([
      {
        cohort: "HIGH",
        groupRank: 1,
        cohortRank: 1,
        size: 2,
        memberSubmissionIds: ["11", "14"],
      },
      {
        cohort: "HIGH",
        groupRank: 2,
        cohortRank: 2,
        size: 1,
        memberSubmissionIds: ["31"],
      },
      {
        cohort: "MEDIUM",
        groupRank: 3,
        cohortRank: 1,
        size: 2,
        memberSubmissionIds: ["7", "9"],
      },
      {
        cohort: "MEDIUM",
        groupRank: 4,
        cohortRank: 2,
        size: 1,
        memberSubmissionIds: ["41"],
      },
    ])

    expect(new Set(result.groups.map((group) => group.groupId)).size).toBe(4)
    expect(result.groups.every((group) =>
      group.groupId.startsWith(`multi-${group.cohort.toLowerCase()}-`),
    )).toBe(true)

    expect(result.submissions.map((submission) => ({
      submissionId: submission.submissionId,
      cohort: submission.cohort,
      groupRank: submission.groupRank,
      cohortRank: submission.cohortRank,
      memberRank: submission.memberRank,
      groupSize: submission.groupSize,
    }))).toEqual([
      {
        submissionId: "11",
        cohort: "HIGH",
        groupRank: 1,
        cohortRank: 1,
        memberRank: 1,
        groupSize: 2,
      },
      {
        submissionId: "14",
        cohort: "HIGH",
        groupRank: 1,
        cohortRank: 1,
        memberRank: 2,
        groupSize: 2,
      },
      {
        submissionId: "31",
        cohort: "HIGH",
        groupRank: 2,
        cohortRank: 2,
        memberRank: 1,
        groupSize: 1,
      },
      {
        submissionId: "7",
        cohort: "MEDIUM",
        groupRank: 3,
        cohortRank: 1,
        memberRank: 1,
        groupSize: 2,
      },
      {
        submissionId: "9",
        cohort: "MEDIUM",
        groupRank: 3,
        cohortRank: 1,
        memberRank: 2,
        groupSize: 2,
      },
      {
        submissionId: "41",
        cohort: "MEDIUM",
        groupRank: 4,
        cohortRank: 2,
        memberRank: 1,
        groupSize: 1,
      },
    ])

    expect(result.submissions.find((submission) => submission.submissionId === "14")?.similarityScore).toBeGreaterThan(0.5)
    expect(result.submissions.find((submission) => submission.submissionId === "9")?.similarityScore).toBeGreaterThan(0.5)
  })

  it("keeps adversarial near-duplicate MULTI submissions in separate groups when core similarity signals diverge", async () => {
    const { buildDeterministicMultiSubmissionGroups } = await loadMultiGroupingModule()
    const result = buildDeterministicMultiSubmissionGroups(adversarialNearDuplicateFixtures)

    expect(result.groups).toHaveLength(2)
    expect(result.groups.map((group) => group.memberSubmissionIds)).toEqual([
      ["101"],
      ["102"],
    ])
    expect(result.submissions.map((submission) => submission.groupSize)).toEqual([1, 1])
  })

  it("produces identical MULTI grouping outputs across fixture reruns and shuffled input order", async () => {
    const { buildDeterministicMultiSubmissionGroups } = await loadMultiGroupingModule()

    const first = buildDeterministicMultiSubmissionGroups(seededMultiFixtures)
    const second = buildDeterministicMultiSubmissionGroups([...seededMultiFixtures].reverse())
    const third = buildDeterministicMultiSubmissionGroups([...seededMultiFixtures])

    expect(normalizeForSnapshot(second)).toBe(normalizeForSnapshot(first))
    expect(normalizeForSnapshot(third)).toBe(normalizeForSnapshot(first))
  })

  it("runs only after final high or medium validity", async () => {
    const { buildPostVerdictMultiSubmissionGroups } = await loadMultiGroupingModule()

    expect(
      buildPostVerdictMultiSubmissionGroups({
        competitionMode: "UNIQUE",
        finalValidity: "VALID",
        severity: "HIGH",
        submissions: seededMultiFixtures,
      }),
    ).toBeNull()

    expect(
      buildPostVerdictMultiSubmissionGroups({
        competitionMode: "MULTI",
        finalValidity: "NONE",
        severity: "HIGH",
        submissions: seededMultiFixtures,
      }),
    ).toBeNull()

    expect(
      buildPostVerdictMultiSubmissionGroups({
        competitionMode: "MULTI",
        finalValidity: "INVALID",
        severity: "HIGH",
        submissions: seededMultiFixtures,
      }),
    ).toBeNull()

    expect(
      buildPostVerdictMultiSubmissionGroups({
        competitionMode: "MULTI",
        finalValidity: "VALID",
        severity: "LOW",
        submissions: seededMultiFixtures,
      }),
    ).toBeNull()

    const highResult = buildPostVerdictMultiSubmissionGroups({
      competitionMode: "MULTI",
      finalValidity: "VALID",
      severity: "CRITICAL",
      submissions: seededMultiFixtures,
    })
    expect(highResult).not.toBeNull()
    expect(highResult?.groups[0]?.cohort).toBe("HIGH")

    const mediumResult = buildPostVerdictMultiSubmissionGroups({
      competitionMode: "MULTI",
      finalValidity: "VALID",
      severity: "MEDIUM",
      submissions: seededMultiFixtures,
    })
    expect(mediumResult).not.toBeNull()
    expect(mediumResult?.groups.some((group) => group.cohort === "MEDIUM")).toBe(true)
  })
})
