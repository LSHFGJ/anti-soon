import { encodeAbiParameters, keccak256, parseAbiParameters } from "viem"

export const MULTI_GROUPING_VERSION =
  "anti-soon.verify-poc.multi-grouping.v1" as const

export type MultiGroupingCohort = "HIGH" | "MEDIUM" | "OTHER"

export type MultiSubmissionGroupingInput = {
  submissionId: bigint
  severity: string
  targetContract: string
  impactType: string
  summary: string
  observedCalldata: readonly string[]
}

export type MultiSubmissionGroup = {
  groupId: string
  cohort: MultiGroupingCohort
  clusterKey: string
  groupRank: number
  cohortRank: number
  size: number
  representativeSubmissionId: string
  memberSubmissionIds: string[]
  sharedSelectors: string[]
  sharedSummaryTokens: string[]
  averageSimilarityScore: number
}

export type MultiSubmissionSimilarityRecord = {
  submissionId: string
  cohort: MultiGroupingCohort
  groupId: string
  clusterKey: string
  representativeSubmissionId: string
  groupRank: number
  cohortRank: number
  memberRank: number
  groupSize: number
  similarityScore: number
  selectorSimilarity: number
  textSimilarity: number
}

export type MultiSubmissionGroupingResult = {
  groups: MultiSubmissionGroup[]
  submissions: MultiSubmissionSimilarityRecord[]
}

type NormalizedSubmission = {
  submissionId: string
  cohort: MultiGroupingCohort
  targetContract: string
  impactType: string
  summaryTokens: string[]
  observedSelectors: string[]
  clusterFingerprint: `0x${string}`
}

type PairwiseSimilarity = {
  similar: boolean
  similarityScore: number
  selectorSimilarity: number
  textSimilarity: number
}

type RankedGroup = {
  groupId: string
  cohort: MultiGroupingCohort
  clusterKey: string
  size: number
  representativeSubmissionId: string
  memberSubmissionIds: string[]
  sharedSelectors: string[]
  sharedSummaryTokens: string[]
  averageSimilarityScore: number
  members: Array<{
    submissionId: string
    similarityScore: number
    selectorSimilarity: number
    textSimilarity: number
  }>
}

const submissionFingerprintParams = parseAbiParameters(
  "string version, string cohort, string targetContract, string impactType, string summaryFingerprint, string selectorFingerprint",
)

const groupIdParams = parseAbiParameters(
  "string version, string cohort, string clusterKey",
)

const tokenStopWords = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "into",
  "from",
  "does",
  "doesnt",
  "not",
  "can",
  "via",
  "lets",
  "allow",
  "allows",
  "against",
  "before",
])

const cohortPriority: Record<MultiGroupingCohort, number> = {
  HIGH: 0,
  MEDIUM: 1,
  OTHER: 2,
}

function normalizeSeverityToCohort(severity: string): MultiGroupingCohort {
  const normalized = severity.trim().toUpperCase()
  if (normalized === "CRITICAL" || normalized === "HIGH") {
    return "HIGH"
  }
  if (normalized === "MEDIUM") {
    return "MEDIUM"
  }
  return "OTHER"
}

function normalizeSelector(calldata: string): string | null {
  const normalized = calldata.trim().toLowerCase()
  if (!normalized.startsWith("0x") || normalized.length < 10) {
    return null
  }
  return normalized.slice(0, 10)
}

function normalizeToken(token: string): string {
  let normalized = token.toLowerCase().replace(/[^a-z0-9]/g, "")
  if (normalized.length < 3) {
    return ""
  }

  for (const suffix of [
    "ments",
    "ment",
    "ation",
    "ations",
    "ingly",
    "ance",
    "ancy",
    "ing",
    "ers",
    "er",
    "ies",
    "ied",
    "ed",
    "ly",
    "es",
    "s",
    "ant",
    "ent",
  ]) {
    if (normalized.endsWith(suffix) && normalized.length - suffix.length >= 4) {
      normalized = normalized.slice(0, -suffix.length)
      break
    }
  }

  if (normalized.length > 6) {
    normalized = normalized.slice(0, 6)
  }

  if (tokenStopWords.has(normalized) || normalized.length < 3) {
    return ""
  }

  return normalized
}

function tokenizeSummary(summary: string, impactType: string): string[] {
  const combined = `${summary} ${impactType}`
  const tokens = combined
    .split(/[^a-zA-Z0-9]+/)
    .map(normalizeToken)
    .filter((token) => token.length > 0)

  return [...new Set(tokens)].sort()
}

function normalizeSubmission(
  submission: MultiSubmissionGroupingInput,
): NormalizedSubmission {
  const cohort = normalizeSeverityToCohort(submission.severity)
  const targetContract = submission.targetContract.trim().toLowerCase()
  const impactType = submission.impactType.trim().toUpperCase()
  const summaryTokens = tokenizeSummary(submission.summary, submission.impactType)
  const observedSelectors = [...new Set(
    submission.observedCalldata
      .map(normalizeSelector)
      .filter((selector): selector is string => selector !== null),
  )].sort()
  const clusterFingerprint = keccak256(
    encodeAbiParameters(submissionFingerprintParams, [
      MULTI_GROUPING_VERSION,
      cohort,
      targetContract,
      impactType,
      summaryTokens.join(","),
      observedSelectors.join(","),
    ]),
  )

  return {
    submissionId: submission.submissionId.toString(),
    cohort,
    targetContract,
    impactType,
    summaryTokens,
    observedSelectors,
    clusterFingerprint,
  }
}

function intersectSorted(left: readonly string[], right: readonly string[]): string[] {
  const rightSet = new Set(right)
  return left.filter((item) => rightSet.has(item))
}

function jaccardSimilarity(left: readonly string[], right: readonly string[]): number {
  if (left.length === 0 && right.length === 0) {
    return 1
  }

  const leftSet = new Set(left)
  const rightSet = new Set(right)
  let intersection = 0
  for (const item of leftSet) {
    if (rightSet.has(item)) {
      intersection += 1
    }
  }

  const union = new Set([...leftSet, ...rightSet]).size
  return union === 0 ? 0 : intersection / union
}

function roundSimilarity(value: number): number {
  return Math.round(value * 1000) / 1000
}

function compareSubmissionIds(left: string, right: string): number {
  const leftId = BigInt(left)
  const rightId = BigInt(right)
  if (leftId < rightId) {
    return -1
  }
  if (leftId > rightId) {
    return 1
  }
  return 0
}

function pairKey(leftId: string, rightId: string): string {
  return compareSubmissionIds(leftId, rightId) <= 0
    ? `${leftId}:${rightId}`
    : `${rightId}:${leftId}`
}

function computePairwiseSimilarity(
  left: NormalizedSubmission,
  right: NormalizedSubmission,
): PairwiseSimilarity {
  if (
    left.cohort !== right.cohort ||
    left.targetContract !== right.targetContract ||
    left.impactType !== right.impactType
  ) {
    return {
      similar: false,
      similarityScore: 0,
      selectorSimilarity: 0,
      textSimilarity: 0,
    }
  }

  const selectorSimilarity = roundSimilarity(
    jaccardSimilarity(left.observedSelectors, right.observedSelectors),
  )
  const textSimilarity = roundSimilarity(
    jaccardSimilarity(left.summaryTokens, right.summaryTokens),
  )
  const bothHaveSelectors =
    left.observedSelectors.length > 0 && right.observedSelectors.length > 0

  if (bothHaveSelectors && selectorSimilarity === 0) {
    return {
      similar: false,
      similarityScore: 0,
      selectorSimilarity,
      textSimilarity,
    }
  }

  if (!bothHaveSelectors && textSimilarity < 0.6) {
    return {
      similar: false,
      similarityScore: 0,
      selectorSimilarity,
      textSimilarity,
    }
  }

  const similarityScore = roundSimilarity(
    0.55 + selectorSimilarity * 0.25 + textSimilarity * 0.2,
  )

  return {
    similar: similarityScore >= 0.7,
    similarityScore,
    selectorSimilarity,
    textSimilarity,
  }
}

function computeConnectedComponents(
  submissions: readonly NormalizedSubmission[],
  pairwiseByKey: Map<string, PairwiseSimilarity>,
): NormalizedSubmission[][] {
  const adjacency = new Map<string, Set<string>>()

  for (const submission of submissions) {
    adjacency.set(submission.submissionId, new Set())
  }

  for (let leftIndex = 0; leftIndex < submissions.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < submissions.length;
      rightIndex += 1
    ) {
      const left = submissions[leftIndex]
      const right = submissions[rightIndex]
      const similarity = pairwiseByKey.get(pairKey(left.submissionId, right.submissionId))
      if (!similarity?.similar) {
        continue
      }

      adjacency.get(left.submissionId)?.add(right.submissionId)
      adjacency.get(right.submissionId)?.add(left.submissionId)
    }
  }

  const byId = new Map(submissions.map((submission) => [submission.submissionId, submission]))
  const visited = new Set<string>()
  const components: NormalizedSubmission[][] = []

  const orderedIds = [...submissions]
    .map((submission) => submission.submissionId)
    .sort(compareSubmissionIds)

  for (const submissionId of orderedIds) {
    if (visited.has(submissionId)) {
      continue
    }

    const stack = [submissionId]
    visited.add(submissionId)
    const componentIds: string[] = []

    while (stack.length > 0) {
      const current = stack.pop()
      if (!current) {
        continue
      }

      componentIds.push(current)
      const neighbors = [...(adjacency.get(current) ?? [])].sort(compareSubmissionIds)
      for (const neighbor of neighbors) {
        if (visited.has(neighbor)) {
          continue
        }
        visited.add(neighbor)
        stack.push(neighbor)
      }
    }

    components.push(
      componentIds
        .sort(compareSubmissionIds)
        .map((componentId) => byId.get(componentId))
        .filter((candidate): candidate is NormalizedSubmission => candidate !== undefined),
    )
  }

  return components
}

function average(values: readonly number[]): number {
  if (values.length === 0) {
    return 0
  }

  const total = values.reduce((sum, value) => sum + value, 0)
  return total / values.length
}

function buildRankedGroup(
  members: readonly NormalizedSubmission[],
  pairwiseByKey: Map<string, PairwiseSimilarity>,
): RankedGroup {
  const similarityByMember = new Map<
    string,
    { similarityScore: number; selectorSimilarity: number; textSimilarity: number }
  >()

  for (const member of members) {
    const pairScores = members.map((peer) => {
      if (peer.submissionId === member.submissionId) {
        return {
          similarityScore: 1,
          selectorSimilarity: 1,
          textSimilarity: 1,
        }
      }

      return (
        pairwiseByKey.get(pairKey(member.submissionId, peer.submissionId)) ?? {
          similarityScore: 0,
          selectorSimilarity: 0,
          textSimilarity: 0,
          similar: false,
        }
      )
    })

    similarityByMember.set(member.submissionId, {
      similarityScore: roundSimilarity(
        average(pairScores.map((score) => score.similarityScore)),
      ),
      selectorSimilarity: roundSimilarity(
        average(pairScores.map((score) => score.selectorSimilarity)),
      ),
      textSimilarity: roundSimilarity(average(pairScores.map((score) => score.textSimilarity))),
    })
  }

  const sortedMembers = [...members].sort((left, right) => {
    const leftScores = similarityByMember.get(left.submissionId)
    const rightScores = similarityByMember.get(right.submissionId)
    const similarityDelta =
      (rightScores?.similarityScore ?? 0) - (leftScores?.similarityScore ?? 0)
    if (similarityDelta !== 0) {
      return similarityDelta
    }
    return compareSubmissionIds(left.submissionId, right.submissionId)
  })

  const representative = sortedMembers[0]
  const representativeScores = similarityByMember.get(representative.submissionId)
  const clusterKey = JSON.stringify({
    cohort: representative.cohort,
    targetContract: representative.targetContract,
    impactType: representative.impactType,
    memberFingerprints: [...members]
      .map((member) => member.clusterFingerprint)
      .sort(),
  })
  const groupHash = keccak256(
    encodeAbiParameters(groupIdParams, [
      MULTI_GROUPING_VERSION,
      representative.cohort,
      clusterKey,
    ]),
  )
  const sharedSelectors = sortedMembers.reduce<string[]>((shared, member, index) => {
    return index === 0
      ? [...member.observedSelectors]
      : intersectSorted(shared, member.observedSelectors)
  }, [])
  const sharedSummaryTokens = sortedMembers.reduce<string[]>((shared, member, index) => {
    return index === 0
      ? [...member.summaryTokens]
      : intersectSorted(shared, member.summaryTokens)
  }, [])

  return {
    groupId: `multi-${representative.cohort.toLowerCase()}-${groupHash.slice(2, 12)}`,
    cohort: representative.cohort,
    clusterKey,
    size: sortedMembers.length,
    representativeSubmissionId: representative.submissionId,
    memberSubmissionIds: sortedMembers.map((member) => member.submissionId),
    sharedSelectors,
    sharedSummaryTokens,
    averageSimilarityScore: roundSimilarity(
      average(
        [...similarityByMember.values()].map((memberScores) => memberScores.similarityScore),
      ),
    ),
    members: sortedMembers.map((member) => ({
      submissionId: member.submissionId,
      similarityScore:
        similarityByMember.get(member.submissionId)?.similarityScore ??
        representativeScores?.similarityScore ??
        0,
      selectorSimilarity:
        similarityByMember.get(member.submissionId)?.selectorSimilarity ?? 0,
      textSimilarity: similarityByMember.get(member.submissionId)?.textSimilarity ?? 0,
    })),
  }
}

export function buildDeterministicMultiSubmissionGroups(
  submissions: readonly MultiSubmissionGroupingInput[],
): MultiSubmissionGroupingResult {
  const normalized = submissions
    .map(normalizeSubmission)
    .sort((left, right) => compareSubmissionIds(left.submissionId, right.submissionId))

  const pairwiseByKey = new Map<string, PairwiseSimilarity>()
  for (let leftIndex = 0; leftIndex < normalized.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < normalized.length;
      rightIndex += 1
    ) {
      const left = normalized[leftIndex]
      const right = normalized[rightIndex]
      pairwiseByKey.set(
        pairKey(left.submissionId, right.submissionId),
        computePairwiseSimilarity(left, right),
      )
    }
  }

  const rankedGroups = computeConnectedComponents(normalized, pairwiseByKey)
    .map((component) => buildRankedGroup(component, pairwiseByKey))
    .sort((left, right) => {
      const cohortDelta = cohortPriority[left.cohort] - cohortPriority[right.cohort]
      if (cohortDelta !== 0) {
        return cohortDelta
      }

      const sizeDelta = right.size - left.size
      if (sizeDelta !== 0) {
        return sizeDelta
      }

      const similarityDelta = right.averageSimilarityScore - left.averageSimilarityScore
      if (similarityDelta !== 0) {
        return similarityDelta
      }

      const representativeDelta = compareSubmissionIds(
        left.representativeSubmissionId,
        right.representativeSubmissionId,
      )
      if (representativeDelta !== 0) {
        return representativeDelta
      }

      return left.groupId.localeCompare(right.groupId)
    })

  const groups: MultiSubmissionGroup[] = []
  const submissionsWithSimilarity: MultiSubmissionSimilarityRecord[] = []
  const cohortRankByCohort = new Map<MultiGroupingCohort, number>()

  rankedGroups.forEach((group, groupIndex) => {
    const cohortRank = (cohortRankByCohort.get(group.cohort) ?? 0) + 1
    cohortRankByCohort.set(group.cohort, cohortRank)

    groups.push({
      groupId: group.groupId,
      cohort: group.cohort,
      clusterKey: group.clusterKey,
      groupRank: groupIndex + 1,
      cohortRank,
      size: group.size,
      representativeSubmissionId: group.representativeSubmissionId,
      memberSubmissionIds: group.memberSubmissionIds,
      sharedSelectors: group.sharedSelectors,
      sharedSummaryTokens: group.sharedSummaryTokens,
      averageSimilarityScore: group.averageSimilarityScore,
    })

    group.members.forEach((member, memberIndex) => {
      submissionsWithSimilarity.push({
        submissionId: member.submissionId,
        cohort: group.cohort,
        groupId: group.groupId,
        clusterKey: group.clusterKey,
        representativeSubmissionId: group.representativeSubmissionId,
        groupRank: groupIndex + 1,
        cohortRank,
        memberRank: memberIndex + 1,
        groupSize: group.size,
        similarityScore: member.similarityScore,
        selectorSimilarity: member.selectorSimilarity,
        textSimilarity: member.textSimilarity,
      })
    })
  })

  return {
    groups,
    submissions: submissionsWithSimilarity,
  }
}
