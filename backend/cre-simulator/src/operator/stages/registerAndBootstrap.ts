import { spawn } from "node:child_process"
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs"
import { dirname, join, resolve } from "node:path"

import type { DemoOperatorConfig, EnvRecord } from "../config"
import {
	assertCreWorkflowSecretsAvailable,
	prepareCreWorkflowExecution,
} from "../creWorkflowRuntime"
import {
  buildReadProjectRequest,
  buildRegisterProjectV2Request,
  extractRegistrationWorkflowTrigger,
  type AddressString,
  type BountyHubProject,
  type BountyHubReceipt,
  type HexString,
  type RegisterProjectV2Input,
  type RegistrationWorkflowTrigger,
} from "../bountyHubClient"
import {
  assertDemoOperatorStateBindingStable,
  assertDemoOperatorStateStoreHealthy,
  claimDurableDemoOperatorStage,
  loadDemoOperatorStateStore,
  markDurableDemoOperatorStageCompleted,
  markDurableDemoOperatorStageQuarantined,
} from "../stateStore"

const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/
const HASH_REGEX = /^0x[a-fA-F0-9]{64}$/
const PRIVATE_KEY_REGEX = /^0x[a-fA-F0-9]{64}$/
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"

const VNET_STATUS_ACTIVE = 2
const REGISTER_TRIGGER_INDEX = 0
const PROJECT_REGISTERED_V2_EVENT_ABI = {
  anonymous: false,
  type: "event",
  name: "ProjectRegisteredV2",
  inputs: [
    { indexed: true, name: "projectId", type: "uint256" },
    { indexed: true, name: "owner", type: "address" },
    { indexed: false, name: "mode", type: "uint8" },
  ],
} as const

const BOUNTY_HUB_TASK4_ABI = [
  {
    name: "registerProjectV2",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "_targetContract", type: "address" },
      { name: "_maxPayoutPerBug", type: "uint256" },
      { name: "_forkBlock", type: "uint256" },
      { name: "_mode", type: "uint8" },
      { name: "_commitDeadline", type: "uint256" },
      { name: "_revealDeadline", type: "uint256" },
      { name: "_disputeWindow", type: "uint256" },
      {
        name: "_rules",
        type: "tuple",
        components: [
          { name: "maxAttackerSeedWei", type: "uint256" },
          { name: "maxWarpSeconds", type: "uint256" },
          { name: "allowImpersonation", type: "bool" },
          {
            name: "thresholds",
            type: "tuple",
            components: [
              { name: "criticalDrainWei", type: "uint256" },
              { name: "highDrainWei", type: "uint256" },
              { name: "mediumDrainWei", type: "uint256" },
              { name: "lowDrainWei", type: "uint256" },
            ],
          },
        ],
      },
    ],
    outputs: [{ name: "projectId", type: "uint256" }],
  },
  {
    name: "projects",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [
      {
        name: "project",
        type: "tuple",
        components: [
          { name: "owner", type: "address" },
          { name: "bountyPool", type: "uint256" },
          { name: "maxPayoutPerBug", type: "uint256" },
          { name: "targetContract", type: "address" },
          { name: "forkBlock", type: "uint256" },
          { name: "active", type: "bool" },
          { name: "mode", type: "uint8" },
          { name: "commitDeadline", type: "uint256" },
          { name: "revealDeadline", type: "uint256" },
          { name: "disputeWindow", type: "uint256" },
          { name: "rulesHash", type: "bytes32" },
          { name: "vnetStatus", type: "uint8" },
          { name: "vnetRpcUrl", type: "string" },
          { name: "baseSnapshotId", type: "bytes32" },
          { name: "vnetCreatedAt", type: "uint256" },
          { name: "repoUrl", type: "string" },
        ],
      },
    ],
  },
  PROJECT_REGISTERED_V2_EVENT_ABI,
] as const

type RegisterAndBootstrapResult = {
  projectId: string
  registrationTxHash: HexString
  registrationEventIndex: number
  simulateCommand: string[]
  vnetStatus: number
  vnetRpcUrl: string
}

type RegisterAndBootstrapClient = {
  registerProjectV2(
    input: RegisterProjectV2Input,
  ): Promise<RegistrationWorkflowTrigger>
  readProject(projectId: bigint): Promise<BountyHubProject>
}

type SimulateCommandSpec = {
  command: string
  args: string[]
  cwd: string
}

type SimulateCommandResult = {
  exitCode: number
  stdout: string
  stderr: string
}

type RegisterAndBootstrapPrerequisites = {
  publicRpcUrl: string
  adminRpcUrl: string
  projectOwnerAddress: AddressString
  projectOwnerPrivateKey: HexString
  operatorAddress: AddressString
  bountyHubAddress: AddressString
}

type RegisterAndBootstrapDependencies = {
  nowMs?: number
  createClient?: (args: {
    config: DemoOperatorConfig
    env: EnvRecord
    prerequisites: RegisterAndBootstrapPrerequisites
  }) => Promise<RegisterAndBootstrapClient>
  runCommand?: (
    spec: SimulateCommandSpec,
  ) => Promise<SimulateCommandResult>
}

type RegisterAndBootstrapArgs = {
  config: DemoOperatorConfig
  env: EnvRecord
  deps?: RegisterAndBootstrapDependencies
}

type PersistedDemoOperatorStateFile = {
  stageData?: {
    register?: RegisterAndBootstrapResult
    [key: string]: unknown
  }
  [key: string]: unknown
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function requiredEnv(env: EnvRecord, key: string): string {
  const value = env[key]
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${key}`)
  }

  return value.trim()
}

function parseUrl(rawValue: string, label: string): string {
  let parsed: URL
  try {
    parsed = new URL(rawValue)
  } catch {
    throw new Error(`${label} must be a valid URL`)
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${label} must use http or https`)
  }

  return parsed.toString()
}

function parseAddress(rawValue: string, label: string): AddressString {
  if (!ADDRESS_REGEX.test(rawValue)) {
    throw new Error(`${label} must be a valid EVM address`)
  }

  return rawValue.toLowerCase() as AddressString
}

function parseHash(rawValue: string, label: string): HexString {
  if (!HASH_REGEX.test(rawValue)) {
    throw new Error(`${label} must be a 32-byte hex string`)
  }

  return rawValue.toLowerCase() as HexString
}

function parsePrivateKey(rawValue: string, label: string): HexString {
  if (!PRIVATE_KEY_REGEX.test(rawValue)) {
    throw new Error(`${label} must be a 32-byte hex private key`)
  }

  return rawValue.toLowerCase() as HexString
}

function ensureParentDirectory(filePath: string): void {
  mkdirSync(dirname(filePath), { recursive: true })
}

function readJsonFile(filePath: string, label: string): Record<string, unknown> {
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(filePath, "utf8")) as unknown
  } catch {
    throw new Error(`${label} must contain valid JSON`)
  }

  if (!isObject(parsed)) {
    throw new Error(`${label} must contain a JSON object`)
  }

  return parsed
}

function readWorkflowFixtureText(config: DemoOperatorConfig): {
  workflowPath: string
  workflowYamlPath: string
  workflowYaml: string
  workflowConfigPath: string
  secretsPath: string
} {
  const workflowPath = config.scenario.commandDefaults.register.workflowPath
  const workflowDir = resolve(config.repoRoot, workflowPath)
  const workflowYamlPath = join(workflowDir, "workflow.yaml")

  if (!existsSync(workflowYamlPath)) {
    throw new Error(
      `Missing broadcast prerequisite: ${workflowPath} requires workflow.yaml`,
    )
  }

  const workflowYaml = readFileSync(workflowYamlPath, "utf8")
  const target = config.scenario.commandDefaults.creTarget
  if (!workflowYaml.includes(`${target}:`)) {
    throw new Error(
      `Missing broadcast prerequisite: ${workflowPath} target ${target} is missing from workflow.yaml`,
    )
  }

  return {
    workflowPath,
    workflowYamlPath,
    workflowYaml,
    workflowConfigPath: join(workflowDir, "config.staging.json"),
    secretsPath: resolve(config.repoRoot, "secrets.yaml"),
  }
}

function validateBroadcastPrerequisites(
  config: DemoOperatorConfig,
  env: EnvRecord,
): RegisterAndBootstrapPrerequisites {
	const workflowFixtures = readWorkflowFixtureText(config)

  if (config.scenario.commandDefaults.creTarget !== "staging-settings") {
    throw new Error(
      "Missing broadcast prerequisite: register adapter expects creTarget=staging-settings",
    )
  }
  if (!config.scenario.commandDefaults.nonInteractive) {
    throw new Error(
      "Missing broadcast prerequisite: register adapter requires nonInteractive=true",
    )
  }
  if (!config.scenario.commandDefaults.broadcast) {
    throw new Error(
      "Missing broadcast prerequisite: register adapter requires broadcast=true",
    )
  }

  const publicRpcUrl = parseUrl(
    requiredEnv(env, "DEMO_OPERATOR_PUBLIC_RPC_URL"),
    "DEMO_OPERATOR_PUBLIC_RPC_URL",
  )
  const adminRpcUrl = parseUrl(
    requiredEnv(env, "DEMO_OPERATOR_ADMIN_RPC_URL"),
    "DEMO_OPERATOR_ADMIN_RPC_URL",
  )
  const projectOwnerAddress = parseAddress(
    requiredEnv(env, config.scenario.identities.projectOwner.addressEnvVar),
    config.scenario.identities.projectOwner.addressEnvVar,
  )
  const projectOwnerPrivateKey = parsePrivateKey(
    requiredEnv(env, config.scenario.identities.projectOwner.privateKeyEnvVar),
    config.scenario.identities.projectOwner.privateKeyEnvVar,
  )
  const operatorAddress = parseAddress(
    requiredEnv(env, config.scenario.identities.operator.addressEnvVar),
    config.scenario.identities.operator.addressEnvVar,
  )

  if (publicRpcUrl === adminRpcUrl) {
    throw new Error(
      "DEMO_OPERATOR_ADMIN_RPC_URL must be different from DEMO_OPERATOR_PUBLIC_RPC_URL",
    )
  }

  if (!existsSync(workflowFixtures.workflowConfigPath)) {
    throw new Error(
      `Missing broadcast prerequisite: ${workflowFixtures.workflowPath} requires config.staging.json`,
    )
  }

  const workflowConfig = readJsonFile(
    workflowFixtures.workflowConfigPath,
    `${workflowFixtures.workflowPath}/config.staging.json`,
  )
  const bountyHubAddress = parseAddress(
    String(workflowConfig.bountyHubAddress ?? ""),
    `${workflowFixtures.workflowPath}/config.staging.json bountyHubAddress`,
  )
  const workflowOwner = parseAddress(
    String(workflowConfig.owner ?? ""),
    `${workflowFixtures.workflowPath}/config.staging.json owner`,
  )

  if (workflowOwner === ZERO_ADDRESS) {
    throw new Error(
      `Missing broadcast prerequisite: ${workflowFixtures.workflowPath} config owner must be a non-zero address`,
    )
  }
  if (workflowOwner !== operatorAddress) {
    throw new Error(
      `Missing broadcast prerequisite: ${workflowFixtures.workflowPath} config owner must match ${config.scenario.identities.operator.addressEnvVar}`,
    )
  }

	assertCreWorkflowSecretsAvailable({
		repoRoot: config.repoRoot,
		workflowPath: workflowFixtures.workflowPath,
		env,
	})

  return {
    publicRpcUrl,
    adminRpcUrl,
    projectOwnerAddress,
    projectOwnerPrivateKey,
    operatorAddress,
    bountyHubAddress,
  }
}

function buildRegisterProjectInput(
  config: DemoOperatorConfig,
  nowMs: number,
): RegisterProjectV2Input {
  const nowSeconds = BigInt(Math.floor(nowMs / 1000))
  const project = config.scenario.project

  return {
    value: BigInt(project.bountyPoolWei),
    targetContract: project.targetContract as AddressString,
    maxPayoutPerBug: BigInt(project.maxPayoutPerBugWei),
    forkBlock: BigInt(project.forkBlock),
    mode: 1,
    commitDeadline: nowSeconds + BigInt(project.timing.commitDeadlineSeconds),
    revealDeadline: nowSeconds + BigInt(project.timing.revealDeadlineSeconds),
    disputeWindow: 0n,
    rules: {
      maxAttackerSeedWei: BigInt(project.rules.maxAttackerSeedWei),
      maxWarpSeconds: BigInt(project.rules.maxWarpSeconds),
      allowImpersonation: project.rules.allowImpersonation,
      thresholds: {
        criticalDrainWei: BigInt(project.rules.severityThresholds.criticalDrainWei),
        highDrainWei: BigInt(project.rules.severityThresholds.highDrainWei),
        mediumDrainWei: BigInt(project.rules.severityThresholds.mediumDrainWei),
        lowDrainWei: BigInt(project.rules.severityThresholds.lowDrainWei),
      },
    },
  }
}

function buildSimulateCommand(
	config: DemoOperatorConfig,
	trigger: RegistrationWorkflowTrigger,
	workflowPath: string = config.scenario.commandDefaults.register.workflowPath,
): SimulateCommandSpec {
	const args = [
		"workflow",
		"simulate",
		workflowPath,
    "--target",
    config.scenario.commandDefaults.creTarget,
    "--non-interactive",
    "--trigger-index",
    String(REGISTER_TRIGGER_INDEX),
    "--evm-tx-hash",
    trigger.txHash,
    "--evm-event-index",
    String(trigger.eventIndex),
    "--broadcast",
  ]

  return {
    command: "cre",
    args,
    cwd: config.repoRoot,
  }
}

function assertVnetActivated(
  project: Pick<BountyHubProject, "vnetStatus" | "vnetRpcUrl">,
  projectId: bigint,
): void {
  if (project.vnetStatus !== VNET_STATUS_ACTIVE) {
    throw new Error(
      `Project ${projectId.toString()} did not reach vnetStatus=Active after vnet-init simulate`,
    )
  }

  if (project.vnetRpcUrl.trim().length === 0) {
    throw new Error(
      `Project ${projectId.toString()} did not persist a non-empty vnetRpcUrl after vnet-init simulate`,
    )
  }
}

function readPersistedStateFile(filePath: string): PersistedDemoOperatorStateFile {
  return readJsonFile(filePath, "demo-operator state store")
}

function parsePersistedRegisterResult(
  value: unknown,
): RegisterAndBootstrapResult {
  if (!isObject(value)) {
    throw new Error("Persisted register stage data is missing or invalid")
  }

  const projectId = String(value.projectId ?? "")
  if (!/^[0-9]+$/.test(projectId)) {
    throw new Error("Persisted register stage projectId is invalid")
  }

  const registrationTxHash = parseHash(
    String(value.registrationTxHash ?? ""),
    "Persisted register stage registrationTxHash",
  )
  const registrationEventIndex = Number(value.registrationEventIndex)
  if (
    !Number.isInteger(registrationEventIndex)
    || registrationEventIndex < 0
  ) {
    throw new Error("Persisted register stage registrationEventIndex is invalid")
  }

  if (!Array.isArray(value.simulateCommand)) {
    throw new Error("Persisted register stage simulateCommand is invalid")
  }
  const simulateCommand = value.simulateCommand.map((entry) => {
    if (typeof entry !== "string" || entry.length === 0) {
      throw new Error("Persisted register stage simulateCommand is invalid")
    }
    return entry
  })

  const vnetStatus = Number(value.vnetStatus)
  if (!Number.isInteger(vnetStatus) || vnetStatus < 0) {
    throw new Error("Persisted register stage vnetStatus is invalid")
  }

  const vnetRpcUrl = String(value.vnetRpcUrl ?? "")
  if (vnetRpcUrl.trim().length === 0) {
    throw new Error("Persisted register stage vnetRpcUrl is invalid")
  }

  return {
    projectId,
    registrationTxHash,
    registrationEventIndex,
    simulateCommand,
    vnetStatus,
    vnetRpcUrl,
  }
}

function readPersistedRegisterResult(
  filePath: string,
): RegisterAndBootstrapResult | null {
  if (!existsSync(filePath)) {
    return null
  }

  const persisted = readPersistedStateFile(filePath)
  return persisted.stageData?.register
    ? parsePersistedRegisterResult(persisted.stageData.register)
    : null
}

function persistRegisterResult(
  filePath: string,
  result: RegisterAndBootstrapResult,
): void {
  const persisted = readPersistedStateFile(filePath)
  const nextPayload: PersistedDemoOperatorStateFile = {
    ...persisted,
    stageData: {
      ...(isObject(persisted.stageData) ? persisted.stageData : {}),
      register: result,
    },
  }

  ensureParentDirectory(filePath)
  const tempPath = `${filePath}.tmp`
  writeFileSync(tempPath, `${JSON.stringify(nextPayload, null, 2)}\n`, "utf8")
  renameSync(tempPath, filePath)
}

async function runLocalCommand(
  spec: SimulateCommandSpec,
): Promise<SimulateCommandResult> {
  return await new Promise((resolvePromise, rejectPromise) => {
    const subprocess = spawn(spec.command, spec.args, {
      cwd: spec.cwd,
      stdio: ["ignore", "pipe", "pipe"],
    })

    let stdout = ""
    let stderr = ""

    subprocess.stdout.on("data", (chunk) => {
      stdout += String(chunk)
    })
    subprocess.stderr.on("data", (chunk) => {
      stderr += String(chunk)
    })
    subprocess.on("error", (error) => {
      rejectPromise(
        new Error(`Failed to execute ${spec.command}: ${error.message}`),
      )
    })
    subprocess.on("close", (code) => {
      resolvePromise({
        exitCode: code ?? 1,
        stdout,
        stderr,
      })
    })
  })
}

function normalizeRegistrationReceipt(receipt: unknown): BountyHubReceipt {
  if (!isObject(receipt)) {
    throw new Error("BountyHub registration receipt is invalid")
  }

  const receiptSource = receipt as {
    transactionHash?: string
    logs?: Array<{
      data?: string
      topics?: readonly string[]
      transactionHash?: string
      logIndex?: bigint | number
      blockNumber?: bigint | number
    }>
  }

  const logs = Array.isArray(receiptSource.logs) ? receiptSource.logs : []

  return {
    transactionHash: parseHash(
      String(receiptSource.transactionHash ?? ""),
      "registration receipt transaction hash",
    ),
    logs: logs
      .map((log) => {
	try {
          return decodeProjectRegisteredEvent(log)
        } catch {
          return null
        }
      })
      .filter((log): log is NonNullable<typeof log> => log !== null),
  }
}

async function decodeProjectRegisteredEvent(
  log: {
    data?: string
    topics?: readonly string[]
    transactionHash?: string
    logIndex?: bigint | number
    blockNumber?: bigint | number
  },
) {
  const viem = (await import("viem")) as {
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

  const decoded = viem.decodeEventLog({
    abi: [PROJECT_REGISTERED_V2_EVENT_ABI],
    data: String(log.data ?? "0x"),
    topics: Array.isArray(log.topics) ? log.topics : [],
    strict: false,
  })

  if (decoded.eventName !== "ProjectRegisteredV2") {
    throw new Error("Not a ProjectRegisteredV2 log")
  }

  return {
    eventName: "ProjectRegisteredV2" as const,
    args: decoded.args,
    transactionHash: log.transactionHash
      ? parseHash(log.transactionHash, "ProjectRegisteredV2 transaction hash")
      : undefined,
    logIndex: log.logIndex,
    blockNumber: log.blockNumber,
  }
}

async function createDefaultClient(args: {
  config: DemoOperatorConfig
  prerequisites: RegisterAndBootstrapPrerequisites
}): Promise<RegisterAndBootstrapClient> {
  const viem = (await import("viem")) as {
    createPublicClient: (args: { transport: unknown }) => {
      readContract: (request: {
        address: AddressString
        abi: readonly unknown[]
        functionName: string
        args: readonly unknown[]
      }) => Promise<unknown>
      simulateContract: (request: {
        account: { address: AddressString }
        address: AddressString
        abi: readonly unknown[]
        functionName: string
        args: readonly unknown[]
        value?: bigint
      }) => Promise<{ request: unknown }>
      waitForTransactionReceipt: (request: {
        hash: HexString
      }) => Promise<unknown>
    }
    createWalletClient: (args: {
      account: { address: AddressString }
      transport: unknown
    }) => {
      writeContract: (request: unknown) => Promise<HexString>
    }
    http: (url: string) => unknown
  }
  const accounts = (await import("viem/accounts")) as {
    privateKeyToAccount: (privateKey: HexString) => {
      address: AddressString
    }
  }

  const account = accounts.privateKeyToAccount(
    args.prerequisites.projectOwnerPrivateKey,
  )
  if (
    account.address.toLowerCase() !== args.prerequisites.projectOwnerAddress
  ) {
    throw new Error(
      `${args.config.scenario.identities.projectOwner.privateKeyEnvVar} does not match ${args.config.scenario.identities.projectOwner.addressEnvVar}`,
    )
  }

  const publicClient = viem.createPublicClient({
    transport: viem.http(args.prerequisites.publicRpcUrl),
  })
  const walletClient = viem.createWalletClient({
    account,
    transport: viem.http(args.prerequisites.adminRpcUrl),
  })

  return {
    async registerProjectV2(input) {
      const request = buildRegisterProjectV2Request(
        args.prerequisites.bountyHubAddress,
        input,
      )
      const simulation = await publicClient.simulateContract({
        account,
        address: request.address,
        abi: BOUNTY_HUB_TASK4_ABI,
        functionName: request.functionName,
        args: request.args,
        value: request.value,
      })
      const hash = await walletClient.writeContract(simulation.request)
      const receipt = await publicClient.waitForTransactionReceipt({ hash })

      return extractRegistrationWorkflowTrigger(
        normalizeRegistrationReceipt(receipt),
      )
    },

    async readProject(projectId) {
      const request = buildReadProjectRequest(
        args.prerequisites.bountyHubAddress,
        projectId,
      )
      return (await publicClient.readContract({
        address: request.address,
        abi: BOUNTY_HUB_TASK4_ABI,
        functionName: request.functionName,
        args: request.args,
      })) as BountyHubProject
    },
  }
}

export async function registerAndBootstrap(
  args: RegisterAndBootstrapArgs,
): Promise<RegisterAndBootstrapResult> {
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

  const prerequisites = validateBroadcastPrerequisites(args.config, args.env)
  const claimDecision = claimDurableDemoOperatorStage(store, "register", nowMs)
  if (!claimDecision.shouldProcess) {
    if (claimDecision.reason === "already-completed") {
      const persistedResult = readPersistedRegisterResult(args.config.stateFilePath)
      if (persistedResult) {
        return persistedResult
      }

      throw new Error(
        "Register stage is marked completed but persisted register data is missing",
      )
    }

    throw new Error(
      `Register stage is not runnable because it is ${claimDecision.reason}`,
    )
  }

  try {
    const client = args.deps?.createClient
      ? await args.deps.createClient({
          config: args.config,
          env: args.env,
          prerequisites,
        })
      : await createDefaultClient({
          config: args.config,
          prerequisites,
        })
		const simulateRunner = args.deps?.runCommand ?? runLocalCommand
		const registerInput = buildRegisterProjectInput(args.config, nowMs)
		const trigger = await client.registerProjectV2(registerInput)
		const workflowRuntime = prepareCreWorkflowExecution({
			repoRoot: args.config.repoRoot,
			workflowPath: args.config.scenario.commandDefaults.register.workflowPath,
			env: args.env,
		})
		const displaySimulateSpec = buildSimulateCommand(args.config, trigger)
		const simulateResult = await (async () => {
			try {
				const simulateSpec = buildSimulateCommand(
					args.config,
					trigger,
					workflowRuntime.workflowPath,
				)
				return await simulateRunner(simulateSpec)
			} finally {
				workflowRuntime.cleanup()
			}
		})()

		if (simulateResult.exitCode !== 0) {
			throw new Error(
        `cre workflow simulate failed with exitCode=${simulateResult.exitCode}: ${simulateResult.stderr.trim() || simulateResult.stdout.trim() || "no output"}`,
      )
    }

    const project = await client.readProject(trigger.projectId)
    assertVnetActivated(project, trigger.projectId)

		const result: RegisterAndBootstrapResult = {
			projectId: trigger.projectId.toString(),
			registrationTxHash: trigger.txHash,
			registrationEventIndex: trigger.eventIndex,
			simulateCommand: [displaySimulateSpec.command, ...displaySimulateSpec.args],
			vnetStatus: project.vnetStatus,
			vnetRpcUrl: project.vnetRpcUrl,
		}

    markDurableDemoOperatorStageCompleted(store, "register", nowMs)
    persistRegisterResult(args.config.stateFilePath, result)
    return result
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    markDurableDemoOperatorStageQuarantined(store, "register", message, nowMs)
    throw error
  }
}

export type {
  RegisterAndBootstrapArgs,
  RegisterAndBootstrapClient,
  RegisterAndBootstrapDependencies,
  RegisterAndBootstrapResult,
  SimulateCommandResult,
  SimulateCommandSpec,
}
