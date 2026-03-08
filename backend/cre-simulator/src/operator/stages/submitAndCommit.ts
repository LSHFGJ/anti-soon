import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"

import type { DemoOperatorConfig, EnvRecord } from "../config"
import {
  assertDemoOperatorStateBindingStable,
  assertDemoOperatorStateStoreHealthy,
  claimDurableDemoOperatorStage,
  loadDemoOperatorStateStore,
  markDurableDemoOperatorStageCompleted,
  markDurableDemoOperatorStageQuarantined,
} from "../stateStore"
import {
  computeCommitHashFromCipherUri,
  generateRandomSalt,
  uploadPoCToOasis,
  type AddressString,
  type HexString,
} from "../oasisNode"

const ADDRESS_REGEX = /^0x[a-f0-9]{40}$/
const HASH_REGEX = /^0x[a-f0-9]{64}$/
const PRIVATE_KEY_REGEX = /^0x[a-f0-9]{64}$/

const BOUNTY_HUB_COMMIT_ABI = [
  {
    name: "commitPoC",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_projectId", type: "uint256" },
      { name: "_commitHash", type: "bytes32" },
      { name: "_cipherURI", type: "string" },
    ],
    outputs: [{ name: "submissionId", type: "uint256" }],
  },
  {
    name: "PoCCommitted",
    type: "event",
    anonymous: false,
    inputs: [
      { name: "submissionId", type: "uint256", indexed: true },
      { name: "projectId", type: "uint256", indexed: true },
      { name: "auditor", type: "address", indexed: true },
      { name: "commitHash", type: "bytes32", indexed: false },
    ],
  },
] as const

type PersistedDemoOperatorStateFile = {
  stageData?: {
    register?: Record<string, unknown>
    submit?: Record<string, unknown>
    [key: string]: unknown
  }
  [key: string]: unknown
}

type SubmitTemplateCondition = {
  type: string
  target?: string
  value?: string | number
}

type SubmitTemplateTransaction = {
  to?: string
  data?: string
  value?: string | number
}

type SubmitTemplateImpact = {
  type?: string
  estimatedLoss?: string | number
  description?: string
}

type DummyVaultTemplate = {
  target?: string
  chain?: string | number
  forkBlock?: number
  conditions?: SubmitTemplateCondition[]
  transactions?: SubmitTemplateTransaction[]
  impact?: SubmitTemplateImpact
}

type SubmitAndCommitArgs = {
  config: DemoOperatorConfig
  env: EnvRecord
  deps?: SubmitAndCommitDependencies
}

type SubmitCommitInput = {
  projectId: bigint
  auditor: AddressString
  cipherURI: string
  salt: HexString
  commitHash: HexString
}

type SubmitCommitOutput = {
  submissionId: bigint
  commitTxHash: HexString
}

export type SubmitAndCommitResult = {
  submissionId: string
  commitTxHash: HexString
  commitHash: HexString
  cipherURI: string
  salt: HexString
  oasisTxHash: HexString
}

export type SubmitAndCommitDependencies = {
  nowMs?: number
  randomSalt?: () => HexString
  computeCommitHashFromCipherUri?: (
    cipherURI: string,
    auditor: AddressString,
    salt: HexString,
  ) => Promise<HexString>
  uploadOasisPoC?: (args: {
    projectId: bigint
    auditor: AddressString
    pocJson: string
  }) => Promise<{
    cipherURI: string
    oasisTxHash: HexString
  }>
  commitPoC?: (args: SubmitCommitInput) => Promise<SubmitCommitOutput>
}

type VerifyPocWorkflowConfig = {
  bountyHubAddress: AddressString
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function ensureParentDirectory(filePath: string): void {
  mkdirSync(dirname(filePath), { recursive: true })
}

function normalizeAddress(value: string, label: string): AddressString {
  const normalized = value.toLowerCase()
  if (!ADDRESS_REGEX.test(normalized)) {
    throw new Error(`${label} must be a valid EVM address`)
  }

  return normalized as AddressString
}

function normalizeHash(value: string, label: string): HexString {
  const normalized = value.toLowerCase()
  if (!HASH_REGEX.test(normalized)) {
    throw new Error(`${label} must be a 32-byte hex string`)
  }

  return normalized as HexString
}

function normalizePrivateKey(value: string, label: string): HexString {
  const normalized = value.toLowerCase()
  if (!PRIVATE_KEY_REGEX.test(normalized)) {
    throw new Error(`${label} must be a 32-byte hex private key`)
  }

  return normalized as HexString
}

function requiredEnv(env: EnvRecord, key: string): string {
  const value = env[key]
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${key}`)
  }

  return value.trim()
}

function parseJsonObject(raw: string, label: string): Record<string, unknown> {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw) as unknown
  } catch {
    throw new Error(`${label} must contain valid JSON`)
  }

  if (!isObject(parsed)) {
    throw new Error(`${label} must contain a JSON object`)
  }

  return parsed
}

function readPersistedStateFile(filePath: string): PersistedDemoOperatorStateFile {
  return parseJsonObject(readFileSync(filePath, "utf8"), "demo-operator state store")
}

function parsePersistedRegisterProjectId(value: unknown): bigint {
  if (!isObject(value)) {
    throw new Error("Persisted register stage projectId is invalid")
  }

  const projectId = String(value.projectId ?? "")
  if (!/^[0-9]+$/.test(projectId)) {
    throw new Error("Persisted register stage projectId is invalid")
  }

  return BigInt(projectId)
}

function readPersistedRegisterProjectId(filePath: string): bigint {
  if (!existsSync(filePath)) {
    throw new Error("Persisted register stage projectId is invalid")
  }

  const persisted = readPersistedStateFile(filePath)
  return parsePersistedRegisterProjectId(persisted.stageData?.register)
}

function parsePersistedSubmitResult(value: unknown): SubmitAndCommitResult {
  if (!isObject(value)) {
    throw new Error("Persisted submit stage data is missing or invalid")
  }

  const submissionId = String(value.submissionId ?? "")
  if (!/^[0-9]+$/.test(submissionId)) {
    throw new Error("Persisted submit stage data is missing or invalid")
  }

  const commitTxHash = normalizeHash(
    String(value.commitTxHash ?? ""),
    "Persisted submit stage commitTxHash",
  )
  const commitHash = normalizeHash(
    String(value.commitHash ?? ""),
    "Persisted submit stage commitHash",
  )
  const salt = normalizeHash(String(value.salt ?? ""), "Persisted submit stage salt")
  const oasisTxHash = normalizeHash(
    String(value.oasisTxHash ?? ""),
    "Persisted submit stage oasisTxHash",
  )
  const cipherURI = String(value.cipherURI ?? "")
  if (cipherURI.trim().length === 0) {
    throw new Error("Persisted submit stage data is missing or invalid")
  }

  return {
    submissionId,
    commitTxHash,
    commitHash,
    cipherURI,
    salt,
    oasisTxHash,
  }
}

function readPersistedSubmitResult(filePath: string): SubmitAndCommitResult | null {
  if (!existsSync(filePath)) {
    return null
  }

  const persisted = readPersistedStateFile(filePath)
  return persisted.stageData?.submit
    ? parsePersistedSubmitResult(persisted.stageData.submit)
    : null
}

function persistSubmitResult(
  filePath: string,
  result: SubmitAndCommitResult,
): void {
  const persisted = readPersistedStateFile(filePath)
  const nextPayload: PersistedDemoOperatorStateFile = {
    ...persisted,
    stageData: {
      ...(isObject(persisted.stageData) ? persisted.stageData : {}),
      submit: result,
    },
  }

  ensureParentDirectory(filePath)
  const tempPath = `${filePath}.tmp`
  writeFileSync(tempPath, `${JSON.stringify(nextPayload, null, 2)}\n`, "utf8")
  renameSync(tempPath, filePath)
}

function normalizeChainId(value: string | number | undefined): number {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value
  }

  if (typeof value !== "string") {
    throw new Error("DummyVault PoC template chain is invalid")
  }

  const normalized = value.trim().toLowerCase()
  if (normalized === "sepolia") {
    return 11155111
  }
  if (/^[0-9]+$/.test(normalized)) {
    return Number(normalized)
  }

  throw new Error("DummyVault PoC template chain is invalid")
}

function normalizeCondition(
  condition: SubmitTemplateCondition,
): { type: string; address?: string; value: string } {
  if (!condition.type || typeof condition.type !== "string") {
    throw new Error("DummyVault PoC template condition is invalid")
  }
  if (condition.value === undefined) {
    throw new Error("DummyVault PoC template condition is invalid")
  }

  if (typeof condition.target === "string" && condition.target.length > 0) {
    return {
      type: condition.type,
      address: condition.target,
      value: String(condition.value),
    }
  }

  return {
    type: condition.type,
    value: String(condition.value),
  }
}

function normalizeTransaction(
  transaction: SubmitTemplateTransaction,
): { to: string; data: string; value: string } {
  if (
    typeof transaction.to !== "string"
    || typeof transaction.data !== "string"
    || transaction.value === undefined
  ) {
    throw new Error("DummyVault PoC template transaction is invalid")
  }

  return {
    to: transaction.to,
    data: transaction.data,
    value: String(transaction.value),
  }
}

function normalizeTemplateToVerifyPocJson(template: DummyVaultTemplate): string {
  if (
    typeof template.target !== "string"
    || typeof template.forkBlock !== "number"
    || !Array.isArray(template.conditions)
    || !Array.isArray(template.transactions)
    || !isObject(template.impact)
    || typeof template.impact.type !== "string"
    || template.impact.estimatedLoss === undefined
    || typeof template.impact.description !== "string"
  ) {
    throw new Error("DummyVault PoC template is invalid")
  }

  return JSON.stringify({
    target: {
      contract: template.target,
      chain: normalizeChainId(template.chain),
      forkBlock: template.forkBlock,
    },
    setup: template.conditions.map(normalizeCondition),
    transactions: template.transactions.map(normalizeTransaction),
    expectedImpact: {
      type: template.impact.type,
      estimatedLoss: String(template.impact.estimatedLoss),
      description: template.impact.description,
    },
  })
}

function extractBalancedObjectLiteral(source: string, startIndex: number): string {
  const objectStart = source.indexOf("{", startIndex)
  if (objectStart === -1) {
    throw new Error("DummyVault fixture template is invalid")
  }

  let depth = 0
  let inString = false
  let stringQuote = ""
  let isEscaped = false

  for (let index = objectStart; index < source.length; index += 1) {
    const character = source[index]

    if (inString) {
      if (isEscaped) {
        isEscaped = false
        continue
      }
      if (character === "\\") {
        isEscaped = true
        continue
      }
      if (character === stringQuote) {
        inString = false
        stringQuote = ""
      }
      continue
    }

    if (character === '"' || character === "'") {
      inString = true
      stringQuote = character
      continue
    }

    if (character === "{") {
      depth += 1
      continue
    }

    if (character === "}") {
      depth -= 1
      if (depth === 0) {
        return source.slice(objectStart, index + 1)
      }
    }
  }

  throw new Error("DummyVault fixture template is invalid")
}

function readDummyVaultTemplateSource(config: DemoOperatorConfig): DummyVaultTemplate {
  const sourcePath = resolve(config.repoRoot, config.scenario.pocFixture.sourcePath)
  const source = readFileSync(sourcePath, "utf8")
  const exportToken = `export const ${config.scenario.pocFixture.exportName}`
  const exportIndex = source.indexOf(exportToken)
  if (exportIndex === -1) {
    throw new Error("DummyVault fixture export is invalid")
  }

  const templateKeyToken = `${config.scenario.pocFixture.templateKey}:`
  const templateKeyIndex = source.indexOf(templateKeyToken, exportIndex)
  if (templateKeyIndex === -1) {
    throw new Error("DummyVault fixture template is invalid")
  }

  const templateToken = "template:"
  const templateIndex = source.indexOf(templateToken, templateKeyIndex)
  if (templateIndex === -1) {
    throw new Error("DummyVault fixture template is invalid")
  }

  const objectLiteral = extractBalancedObjectLiteral(source, templateIndex)
  const evaluated = Function(`return (${objectLiteral})`)() as unknown
  if (!isObject(evaluated)) {
    throw new Error("DummyVault fixture template is invalid")
  }

  return evaluated as DummyVaultTemplate
}

async function loadNormalizedDummyVaultPoc(config: DemoOperatorConfig): Promise<string> {
  return normalizeTemplateToVerifyPocJson(readDummyVaultTemplateSource(config))
}

function readVerifyPocWorkflowConfig(config: DemoOperatorConfig): VerifyPocWorkflowConfig {
  const configPath = resolve(config.repoRoot, "workflow/verify-poc/config.staging.json")
  const parsed = parseJsonObject(
    readFileSync(configPath, "utf8"),
    "workflow/verify-poc/config.staging.json",
  )

  return {
    bountyHubAddress: normalizeAddress(
      String(parsed.bountyHubAddress ?? ""),
      "workflow/verify-poc/config.staging.json bountyHubAddress",
    ),
  }
}

async function commitPoCWithDefaultClient(
  config: DemoOperatorConfig,
  env: EnvRecord,
  input: SubmitCommitInput,
): Promise<SubmitCommitOutput> {
  const publicRpcUrl = requiredEnv(env, "DEMO_OPERATOR_PUBLIC_RPC_URL")
  const adminRpcUrl = requiredEnv(env, "DEMO_OPERATOR_ADMIN_RPC_URL")
  const auditorAddress = normalizeAddress(
    requiredEnv(env, config.scenario.identities.auditor.addressEnvVar),
    config.scenario.identities.auditor.addressEnvVar,
  )
  const auditorPrivateKey = normalizePrivateKey(
    requiredEnv(env, config.scenario.identities.auditor.privateKeyEnvVar),
    config.scenario.identities.auditor.privateKeyEnvVar,
  )

  if (auditorAddress !== input.auditor) {
    throw new Error(
      `${config.scenario.identities.auditor.addressEnvVar} does not match submit-stage auditor`,
    )
  }

  const workflowConfig = readVerifyPocWorkflowConfig(config)
  const viem = (await import("viem")) as {
    createPublicClient: (args: { transport: unknown }) => {
      simulateContract: (request: {
        account: { address: AddressString }
        address: AddressString
        abi: readonly unknown[]
        functionName: string
        args: readonly unknown[]
      }) => Promise<{ request: unknown }>
      waitForTransactionReceipt: (request: {
        hash: HexString
      }) => Promise<{
        logs: Array<{
          data?: string
          topics?: readonly string[]
        }>
      }>
      decodeEventLog: (args: {
        abi: readonly unknown[]
        data: string
        topics: readonly string[]
        strict?: boolean
      }) => {
        eventName: string
        args: Record<string, unknown>
      }
    }
    createWalletClient: (args: {
      account: { address: AddressString }
      transport: unknown
    }) => {
      writeContract: (request: unknown) => Promise<HexString>
    }
    http: (url: string) => unknown
    decodeEventLog: (args: {
      abi: readonly unknown[]
      data: string
      topics: readonly string[]
      strict?: boolean
    }) => {
      eventName: string
      args: Record<string, unknown>
    }
  }
  const accounts = (await import("viem/accounts")) as {
    privateKeyToAccount: (privateKey: HexString) => {
      address: AddressString
    }
  }

  const account = accounts.privateKeyToAccount(auditorPrivateKey)
  if (account.address.toLowerCase() !== auditorAddress) {
    throw new Error(
      `${config.scenario.identities.auditor.privateKeyEnvVar} does not match ${config.scenario.identities.auditor.addressEnvVar}`,
    )
  }

  const publicClient = viem.createPublicClient({
    transport: viem.http(publicRpcUrl),
  })
  const walletClient = viem.createWalletClient({
    account,
    transport: viem.http(adminRpcUrl),
  })

  const simulation = await publicClient.simulateContract({
    account,
    address: workflowConfig.bountyHubAddress,
    abi: BOUNTY_HUB_COMMIT_ABI,
    functionName: "commitPoC",
    args: [input.projectId, input.commitHash, input.cipherURI],
  })
  const commitTxHash = await walletClient.writeContract(simulation.request)
  const receipt = await publicClient.waitForTransactionReceipt({ hash: commitTxHash })

  for (const log of receipt.logs) {
    try {
      const decoded = viem.decodeEventLog({
        abi: BOUNTY_HUB_COMMIT_ABI,
        data: String(log.data ?? "0x"),
        topics: Array.isArray(log.topics) ? log.topics : [],
        strict: false,
      })
      if (decoded.eventName === "PoCCommitted") {
        const submissionId = decoded.args.submissionId
        if (typeof submissionId === "bigint") {
          return {
            submissionId,
            commitTxHash,
          }
        }
      }
    } catch {}
  }

  throw new Error(
    `Submit stage commit confirmed but PoCCommitted event was missing in tx logs (${commitTxHash})`,
  )
}

export async function submitAndCommit(
  args: SubmitAndCommitArgs,
): Promise<SubmitAndCommitResult> {
  const nowMs = args.deps?.nowMs ?? Date.now()
  const store = loadDemoOperatorStateStore(args.config.stateFilePath, nowMs)

  assertDemoOperatorStateBindingStable(
    store,
    {
      scenarioId: args.config.scenario.scenarioId,
      scenarioPath: args.config.scenarioPath,
      evidenceDir: args.config.evidenceDir,
    },
    nowMs,
  )
  assertDemoOperatorStateStoreHealthy(store)

  const projectId = readPersistedRegisterProjectId(args.config.stateFilePath)
  const claimDecision = claimDurableDemoOperatorStage(store, "submit", nowMs)
  if (!claimDecision.shouldProcess) {
    if (claimDecision.reason === "already-completed") {
      const persistedResult = readPersistedSubmitResult(args.config.stateFilePath)
      if (persistedResult) {
        return persistedResult
      }

      throw new Error(
        "Submit stage is marked completed but persisted submit data is missing",
      )
    }

    throw new Error(
      `Submit stage is not runnable because it is ${claimDecision.reason}`,
    )
  }

  try {
    const auditor = normalizeAddress(
      requiredEnv(args.env, args.config.scenario.identities.auditor.addressEnvVar),
      args.config.scenario.identities.auditor.addressEnvVar,
    )
    const salt = args.deps?.randomSalt?.() ?? generateRandomSalt()
    const pocJson = await loadNormalizedDummyVaultPoc(args.config)
    const upload = args.deps?.uploadOasisPoC ?? (async (input) =>
      uploadPoCToOasis({
        pocJson: input.pocJson,
        projectId: input.projectId,
        auditor: input.auditor,
        env: args.env,
      }))
    const commitPoC = args.deps?.commitPoC ?? ((input: SubmitCommitInput) =>
      commitPoCWithDefaultClient(args.config, args.env, input))

    const { cipherURI, oasisTxHash } = await upload({
      projectId,
      auditor,
      pocJson,
    })
    const commitHash = await (
      args.deps?.computeCommitHashFromCipherUri ?? computeCommitHashFromCipherUri
    )(cipherURI, auditor, salt)
    const committed = await commitPoC({
      projectId,
      auditor,
      cipherURI,
      salt,
      commitHash,
    })

    const result: SubmitAndCommitResult = {
      submissionId: committed.submissionId.toString(),
      commitTxHash: committed.commitTxHash,
      commitHash,
      cipherURI,
      salt,
      oasisTxHash,
    }

    markDurableDemoOperatorStageCompleted(store, "submit", nowMs)
    persistSubmitResult(args.config.stateFilePath, result)
    return result
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    markDurableDemoOperatorStageQuarantined(store, "submit", message, nowMs)
    throw error
  }
}

export type { SubmitAndCommitArgs, SubmitCommitInput, SubmitCommitOutput }
