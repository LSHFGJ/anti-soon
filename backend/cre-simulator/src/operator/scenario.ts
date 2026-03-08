import { existsSync, readFileSync, statSync } from "node:fs"
import { dirname, isAbsolute, normalize, resolve, sep } from "node:path"

export const SCENARIO_SCHEMA_VERSION =
  "anti-soon.demo-operator.scenario.v1" as const

type ScenarioIdentity = {
  kind: "env"
  addressEnvVar: string
  privateKeyEnvVar: string
}

type SeverityThresholds = {
  criticalDrainWei: string
  highDrainWei: string
  mediumDrainWei: string
  lowDrainWei: string
}

type ProjectRules = {
  maxAttackerSeedWei: string
  maxWarpSeconds: number
  allowImpersonation: boolean
  severityThresholds: SeverityThresholds
}

type ScenarioProject = {
  repoUrl: string
  targetContract: string
  bountyPoolWei: string
  maxPayoutPerBugWei: string
  forkBlock: number
  mode: "MULTI"
  timing: {
    commitDeadlineSeconds: number
    revealDeadlineSeconds: number
    disputeWindowSeconds: 0
  }
  rules: ProjectRules
}

type ScenarioPocFixture = {
  sourcePath: string
  exportName: string
  templateKey: string
  normalizer: string
}

type ScenarioCommandDefaults = {
  creTarget: string
  nonInteractive: boolean
  broadcast: boolean
  register: {
    workflowPath: string
  }
  reveal: {
    cursorFilePath: string
    lookbackBlocks: number
    replayOverlapBlocks: number
    logChunkBlocks: number
    maxExecutionBatchSize: number
  }
  verify: {
    workflowPath: string
    triggerEvent: "PoCRevealed"
    triggerIndex: number
  }
}

type ScenarioTerminalAssertions = {
  submissionStatus: "Finalized"
  payoutEvent: "BountyPaid"
  finalizedEvent: "BountyFinalized"
  auditorStatsPaidCountDeltaAtLeast: number
  auditorStatsTotalPaidWeiGreaterThan: string
}

export type DemoOperatorScenario = {
  schemaVersion: typeof SCENARIO_SCHEMA_VERSION
  scenarioId: string
  description: string
  project: ScenarioProject
  pocFixture: ScenarioPocFixture
  identities: {
    projectOwner: ScenarioIdentity
    auditor: ScenarioIdentity
    operator: ScenarioIdentity
  }
  commandDefaults: ScenarioCommandDefaults
  stateFilePath: string
  evidenceDir: string
  terminalAssertions: ScenarioTerminalAssertions
}

type LoadScenarioOptions = {
  repoRoot?: string
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function expectObject(value: unknown, label: string): Record<string, unknown> {
  if (!isObject(value)) {
    throw new Error(`${label} must be an object`)
  }
  return value
}

function expectString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`)
  }
  return value
}

function expectBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be a boolean`)
  }
  return value
}

function expectInteger(value: unknown, label: string, minimum: number): number {
  if (!Number.isInteger(value) || (value as number) < minimum) {
    throw new Error(`${label} must be an integer >= ${minimum}`)
  }
  return value as number
}

function expectBigIntString(value: unknown, label: string): string {
  const raw = expectString(value, label)
  if (!/^(0|[1-9][0-9]*)$/.test(raw)) {
    throw new Error(`${label} must be a base-10 bigint string`)
  }
  return raw
}

function expectAddress(value: unknown, label: string): string {
  const raw = expectString(value, label)
  if (!/^0x[a-fA-F0-9]{40}$/.test(raw)) {
    throw new Error(`${label} must be a 20-byte hex address`)
  }
  return raw
}

function expectEnvVarName(value: unknown, label: string): string {
  const raw = expectString(value, label)
  if (!/^[A-Z][A-Z0-9_]*$/.test(raw)) {
    throw new Error(`${label} must be an uppercase env var name`)
  }
  return raw
}

function ensureSafeRepoRelativePath(
  repoRoot: string,
  value: unknown,
  label: string,
): string {
  const raw = expectString(value, label)

  if (isAbsolute(raw) || raw.includes("\0") || /^[a-z]+:\/\//i.test(raw)) {
    throw new Error(`${label} must be a safe repo-relative path`)
  }

  const normalized = normalize(raw)
  if (normalized === ".." || normalized.startsWith(`..${sep}`)) {
    throw new Error(`${label} must be a safe repo-relative path`)
  }

  const absolutePath = resolve(repoRoot, normalized)
  if (absolutePath !== repoRoot && !absolutePath.startsWith(`${repoRoot}${sep}`)) {
    throw new Error(`${label} must be a safe repo-relative path`)
  }

  return normalized
}

function ensureCheckedInFile(repoRoot: string, relativePath: string, label: string): void {
  const absolutePath = resolve(repoRoot, relativePath)
  if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) {
    throw new Error(`${label} must reference an existing checked-in file`)
  }
}

function ensureCheckedInDirectory(
  repoRoot: string,
  relativePath: string,
  label: string,
): void {
  const absolutePath = resolve(repoRoot, relativePath)
  if (!existsSync(absolutePath) || !statSync(absolutePath).isDirectory()) {
    throw new Error(`${label} must reference an existing checked-in directory`)
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function findRepoRoot(startPath: string): string {
  let current = resolve(startPath)

  while (true) {
    if (existsSync(resolve(current, "project.yaml"))) {
      return current
    }

    const parent = dirname(current)
    if (parent === current) {
      throw new Error("Unable to locate repo root from scenario path")
    }
    current = parent
  }
}

function parseIdentity(value: unknown, label: string): ScenarioIdentity {
  const record = expectObject(value, label)
  const kind = expectString(record.kind, `${label}.kind`)
  if (kind !== "env") {
    throw new Error(`${label}.kind must be env`)
  }

  return {
    kind: "env",
    addressEnvVar: expectEnvVarName(record.addressEnvVar, `${label}.addressEnvVar`),
    privateKeyEnvVar: expectEnvVarName(
      record.privateKeyEnvVar,
      `${label}.privateKeyEnvVar`,
    ),
  }
}

function parseProjectRules(value: unknown, label: string): ProjectRules {
  const record = expectObject(value, label)
  const thresholds = expectObject(
    record.severityThresholds,
    `${label}.severityThresholds`,
  )

  return {
    maxAttackerSeedWei: expectBigIntString(
      record.maxAttackerSeedWei,
      `${label}.maxAttackerSeedWei`,
    ),
    maxWarpSeconds: expectInteger(record.maxWarpSeconds, `${label}.maxWarpSeconds`, 0),
    allowImpersonation: expectBoolean(
      record.allowImpersonation,
      `${label}.allowImpersonation`,
    ),
    severityThresholds: {
      criticalDrainWei: expectBigIntString(
        thresholds.criticalDrainWei,
        `${label}.severityThresholds.criticalDrainWei`,
      ),
      highDrainWei: expectBigIntString(
        thresholds.highDrainWei,
        `${label}.severityThresholds.highDrainWei`,
      ),
      mediumDrainWei: expectBigIntString(
        thresholds.mediumDrainWei,
        `${label}.severityThresholds.mediumDrainWei`,
      ),
      lowDrainWei: expectBigIntString(
        thresholds.lowDrainWei,
        `${label}.severityThresholds.lowDrainWei`,
      ),
    },
  }
}

function parseProject(value: unknown): ScenarioProject {
  const record = expectObject(value, "project")
  const timing = expectObject(record.timing, "project.timing")
  const mode = expectString(record.mode, "project.mode")

  if (mode !== "MULTI") {
    throw new Error("project.mode must be MULTI")
  }

  const commitDeadlineSeconds = expectInteger(
    timing.commitDeadlineSeconds,
    "project.timing.commitDeadlineSeconds",
    1,
  )
  const revealDeadlineSeconds = expectInteger(
    timing.revealDeadlineSeconds,
    "project.timing.revealDeadlineSeconds",
    1,
  )
  if (revealDeadlineSeconds <= commitDeadlineSeconds) {
    throw new Error(
      "project.timing.revealDeadlineSeconds must be greater than commitDeadlineSeconds",
    )
  }

  const disputeWindowSeconds = expectInteger(
    timing.disputeWindowSeconds,
    "project.timing.disputeWindowSeconds",
    0,
  )
  if (disputeWindowSeconds !== 0) {
    throw new Error("project.timing.disputeWindowSeconds must be 0")
  }

  return {
    repoUrl: expectString(record.repoUrl, "project.repoUrl"),
    targetContract: expectAddress(record.targetContract, "project.targetContract"),
    bountyPoolWei: expectBigIntString(record.bountyPoolWei, "project.bountyPoolWei"),
    maxPayoutPerBugWei: expectBigIntString(
      record.maxPayoutPerBugWei,
      "project.maxPayoutPerBugWei",
    ),
    forkBlock: expectInteger(record.forkBlock, "project.forkBlock", 1),
    mode: "MULTI",
    timing: {
      commitDeadlineSeconds,
      revealDeadlineSeconds,
      disputeWindowSeconds: 0,
    },
    rules: parseProjectRules(record.rules, "project.rules"),
  }
}

function parsePocFixture(
  value: unknown,
  repoRoot: string,
): ScenarioPocFixture {
  const record = expectObject(value, "pocFixture")
  const sourcePath = ensureSafeRepoRelativePath(
    repoRoot,
    record.sourcePath,
    "pocFixture.sourcePath",
  )
  ensureCheckedInFile(repoRoot, sourcePath, "pocFixture.sourcePath")

  const exportName = expectString(record.exportName, "pocFixture.exportName")
  const templateKey = expectString(record.templateKey, "pocFixture.templateKey")
  const normalizer = expectString(record.normalizer, "pocFixture.normalizer")

  const source = readFileSync(resolve(repoRoot, sourcePath), "utf8")
  const exportPattern = new RegExp(
    `export\\s+const\\s+${escapeRegExp(exportName)}\\b`,
  )
  if (!exportPattern.test(source)) {
    throw new Error(
      `pocFixture.exportName must reference an exported checked-in fixture in ${sourcePath}`,
    )
  }
  if (!source.includes(`${templateKey}:`)) {
    throw new Error(
      `pocFixture.templateKey must reference a checked-in fixture entry in ${sourcePath}`,
    )
  }

  return {
    sourcePath,
    exportName,
    templateKey,
    normalizer,
  }
}

function parseCommandDefaults(
  value: unknown,
  repoRoot: string,
): ScenarioCommandDefaults {
  const record = expectObject(value, "commandDefaults")
  const register = expectObject(record.register, "commandDefaults.register")
  const reveal = expectObject(record.reveal, "commandDefaults.reveal")
  const verify = expectObject(record.verify, "commandDefaults.verify")

  const registerWorkflowPath = ensureSafeRepoRelativePath(
    repoRoot,
    register.workflowPath,
    "commandDefaults.register.workflowPath",
  )
  ensureCheckedInDirectory(
    repoRoot,
    registerWorkflowPath,
    "commandDefaults.register.workflowPath",
  )

  const verifyWorkflowPath = ensureSafeRepoRelativePath(
    repoRoot,
    verify.workflowPath,
    "commandDefaults.verify.workflowPath",
  )
  ensureCheckedInDirectory(
    repoRoot,
    verifyWorkflowPath,
    "commandDefaults.verify.workflowPath",
  )

  const triggerEvent = expectString(
    verify.triggerEvent,
    "commandDefaults.verify.triggerEvent",
  )
  if (triggerEvent !== "PoCRevealed") {
    throw new Error("commandDefaults.verify.triggerEvent must be PoCRevealed")
  }

  return {
    creTarget: expectString(record.creTarget, "commandDefaults.creTarget"),
    nonInteractive: expectBoolean(
      record.nonInteractive,
      "commandDefaults.nonInteractive",
    ),
    broadcast: expectBoolean(record.broadcast, "commandDefaults.broadcast"),
    register: {
      workflowPath: registerWorkflowPath,
    },
    reveal: {
      cursorFilePath: ensureSafeRepoRelativePath(
        repoRoot,
        reveal.cursorFilePath,
        "commandDefaults.reveal.cursorFilePath",
      ),
      lookbackBlocks: expectInteger(
        reveal.lookbackBlocks,
        "commandDefaults.reveal.lookbackBlocks",
        1,
      ),
      replayOverlapBlocks: expectInteger(
        reveal.replayOverlapBlocks,
        "commandDefaults.reveal.replayOverlapBlocks",
        0,
      ),
      logChunkBlocks: expectInteger(
        reveal.logChunkBlocks,
        "commandDefaults.reveal.logChunkBlocks",
        1,
      ),
      maxExecutionBatchSize: expectInteger(
        reveal.maxExecutionBatchSize,
        "commandDefaults.reveal.maxExecutionBatchSize",
        1,
      ),
    },
    verify: {
      workflowPath: verifyWorkflowPath,
      triggerEvent: "PoCRevealed",
      triggerIndex: expectInteger(
        verify.triggerIndex,
        "commandDefaults.verify.triggerIndex",
        0,
      ),
    },
  }
}

function parseTerminalAssertions(value: unknown): ScenarioTerminalAssertions {
  const record = expectObject(value, "terminalAssertions")

  const submissionStatus = expectString(
    record.submissionStatus,
    "terminalAssertions.submissionStatus",
  )
  if (submissionStatus !== "Finalized") {
    throw new Error("terminalAssertions.submissionStatus must be Finalized")
  }

  const payoutEvent = expectString(
    record.payoutEvent,
    "terminalAssertions.payoutEvent",
  )
  if (payoutEvent !== "BountyPaid") {
    throw new Error("terminalAssertions.payoutEvent must be BountyPaid")
  }

  const finalizedEvent = expectString(
    record.finalizedEvent,
    "terminalAssertions.finalizedEvent",
  )
  if (finalizedEvent !== "BountyFinalized") {
    throw new Error("terminalAssertions.finalizedEvent must be BountyFinalized")
  }

  return {
    submissionStatus: "Finalized",
    payoutEvent: "BountyPaid",
    finalizedEvent: "BountyFinalized",
    auditorStatsPaidCountDeltaAtLeast: expectInteger(
      record.auditorStatsPaidCountDeltaAtLeast,
      "terminalAssertions.auditorStatsPaidCountDeltaAtLeast",
      1,
    ),
    auditorStatsTotalPaidWeiGreaterThan: expectBigIntString(
      record.auditorStatsTotalPaidWeiGreaterThan,
      "terminalAssertions.auditorStatsTotalPaidWeiGreaterThan",
    ),
  }
}

function parseScenarioPayload(
  value: unknown,
  repoRoot: string,
): DemoOperatorScenario {
  const record = expectObject(value, "scenario")

  if (record.schemaVersion !== SCENARIO_SCHEMA_VERSION) {
    throw new Error(
      `scenario.schemaVersion must be ${SCENARIO_SCHEMA_VERSION}`,
    )
  }

  const identities = expectObject(record.identities, "identities")

  return {
    schemaVersion: SCENARIO_SCHEMA_VERSION,
    scenarioId: expectString(record.scenarioId, "scenarioId"),
    description: expectString(record.description, "description"),
    project: parseProject(record.project),
    pocFixture: parsePocFixture(record.pocFixture, repoRoot),
    identities: {
      projectOwner: parseIdentity(identities.projectOwner, "identities.projectOwner"),
      auditor: parseIdentity(identities.auditor, "identities.auditor"),
      operator: parseIdentity(identities.operator, "identities.operator"),
    },
    commandDefaults: parseCommandDefaults(record.commandDefaults, repoRoot),
    stateFilePath: ensureSafeRepoRelativePath(
      repoRoot,
      record.stateFilePath,
      "stateFilePath",
    ),
    evidenceDir: ensureSafeRepoRelativePath(repoRoot, record.evidenceDir, "evidenceDir"),
    terminalAssertions: parseTerminalAssertions(record.terminalAssertions),
  }
}

export function loadScenarioFromFile(
  filePath: string,
  options: LoadScenarioOptions = {},
): DemoOperatorScenario {
  const absoluteScenarioPath = isAbsolute(filePath)
    ? filePath
    : resolve(process.cwd(), filePath)
  const repoRoot = options.repoRoot ? resolve(options.repoRoot) : findRepoRoot(dirname(absoluteScenarioPath))

  const raw = readFileSync(absoluteScenarioPath, "utf8")
  let parsed: unknown
  try {
    parsed = JSON.parse(raw) as unknown
  } catch {
    throw new Error(`Scenario file is not valid JSON: ${absoluteScenarioPath}`)
  }

  return parseScenarioPayload(parsed, repoRoot)
}
