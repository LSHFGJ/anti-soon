import {
  EVMClient,
  HTTPClient,
  handler,
  getNetwork,
  hexToBase64,
  bytesToHex,
  TxStatus,
  Runner,
  consensusIdenticalAggregation,
  type Runtime,
  type NodeRuntime,
  type EVMLog,
} from "@chainlink/cre-sdk"
import {
  decodeFunctionResult,
  encodeFunctionData,
  encodeAbiParameters,
  parseAbiParameters,
  parseAbi,
  keccak256,
  toBytes,
  decodeAbiParameters,
} from "viem"
import { z } from "zod"
import {
  assertVerifyPocIdempotencyMappingStable,
  claimVerifyPocIdempotencySlot,
  deriveVerifyPocIdempotencyKey,
  markVerifyPocIdempotencyCompleted,
  releaseVerifyPocIdempotencySlot,
  type VerifyPocIdempotencyMappingState,
  type VerifyPocIdempotencyStatus,
} from "./src/idempotency"
import {
  decodeSubmissionReadResult,
  encodeSubmissionReadCall,
  type ChainSubmissionRecord,
} from "./src/submissionReader"
import {
  parseOasisReferenceUri,
  type OasisReference,
} from "./src/oasisAttestation"
import { encodeJsonBodyBase64 } from "./src/httpBody"
import {
  validateOasisRpcPayload,
} from "./src/oasisRpcRead"

// ═══════════════════ Config ═══════════════════

const configSchema = z.object({
  chainSelectorName: z.string(),
  bountyHubAddress: z.string(),
  gasLimit: z.string(),
  tenderlyAccountSlug: z.string(),
  tenderlyProjectSlug: z.string(),
  oasisRpcUrl: z.string().optional(),
  sepoliaRpcUrl: z.string().optional(),
  mainnetRpcUrl: z.string(),
})

type Config = z.infer<typeof configSchema>

// ═══════════════════ Types ═══════════════════

type VerificationResult = {
  isValid: boolean
  drainAmountWei: bigint
}

type ProjectRules = {
  maxAttackerSeedWei: bigint
  maxWarpSeconds: bigint
  allowImpersonation: boolean
  thresholds: {
    criticalDrainWei: bigint
    highDrainWei: bigint
    mediumDrainWei: bigint
    lowDrainWei: bigint
  }
}

type PoCData = {
  version: string
  target: {
    contract: string
    chain: number
    forkBlock: number
  }
  setup: Array<{
    type: string
    address?: string
    value: string
  }>
  transactions: Array<{
    to: string
    data: string
    value: string
  }>
  expectedImpact: {
    type: string
    estimatedLoss: string
    description: string
  }
}

// ═══════════════════ ABI Definitions ═══════════════════

const BountyResultParamsV2 = parseAbiParameters(
  "uint256 submissionId, bool isValid, uint256 drainAmountWei"
)

const VNET_STATUS_ACTIVE = 2
const processedRevealIdempotency = new Map<string, VerifyPocIdempotencyStatus>()
const processedRevealIdempotencyMappingBySourceEvent =
  new Map<string, VerifyPocIdempotencyMappingState>()
const VERIFY_POC_REVEALED_IDEMPOTENCY_MAPPING_VERSION =
  "anti-soon.verify-poc.revealed-map.v1"
const VERIFY_POC_REVEALED_IDEMPOTENCY_MAPPING_MODE = "poc_revealed"
const SEPOLIA_RPC_URL = "https://rpc.sepolia.org"

const ProjectStructAbi = parseAbiParameters(
  "address owner, uint256 bountyPool, uint256 maxPayoutPerBug, address targetContract, uint256 forkBlock, bool active, uint8 mode, uint256 commitDeadline, uint256 revealDeadline, uint256 disputeWindow, bytes32 rulesHash, uint8 vnetStatus, string vnetRpcUrl, bytes32 baseSnapshotId, uint256 vnetCreatedAt, string repoUrl"
)

const OasisPoCStoreReadAbi = parseAbi([
  "function read(string slotId) view returns (string payload)",
  "function readMeta(string slotId) view returns (address writer, uint256 storedAt)",
])

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"

export function decodeAuthorizedReadCaller(metaResult: `0x${string}`): `0x${string}` {
  const [writer] = decodeFunctionResult({
    abi: OasisPoCStoreReadAbi,
    functionName: "readMeta",
    data: metaResult,
  })

  const authorizedCaller = writer as `0x${string}`
  if (authorizedCaller.toLowerCase() === ZERO_ADDRESS) {
    throw new Error("Oasis storage metadata missing writer for slot")
  }

  return authorizedCaller
}

export function buildAuthorizedReadCallParams(
  contract: string,
  callData: `0x${string}`,
  authorizedCaller: `0x${string}`,
): [{ to: string; data: `0x${string}`; from: `0x${string}` }, "latest"] {
  return [
    {
      to: contract,
      data: callData,
      from: authorizedCaller,
    },
    "latest",
  ]
}

type ProjectVnetInfo = {
  vnetRpcUrl: string
  baseSnapshotId: string
  vnetStatus: number
}

function encodeProjectCall(projectId: bigint): string {
  const selector = keccak256(toBytes("projects(uint256)")).slice(0, 10)
  const encodedId = encodeAbiParameters(parseAbiParameters("uint256"), [projectId])
  return selector + encodedId.slice(2)
}

function decodeProjectVnetInfo(hexResult: string): ProjectVnetInfo {
  const projectResult = normalizeProjectReadResult(hexResult)
  const decoded = decodeAbiParameters(ProjectStructAbi, projectResult)
  return {
    vnetRpcUrl: decoded[12] as string,
    baseSnapshotId: decoded[13] as string,
    vnetStatus: Number(decoded[11]),
  }
}

function normalizeProjectReadResult(hexResult: string): `0x${string}` {
  const normalized = hexResult.startsWith("0x") ? hexResult.toLowerCase() : `0x${hexResult.toLowerCase()}`

  if (normalized.length < 66) {
    throw new Error("Invalid project read result: too short")
  }

  const headWord = BigInt(`0x${normalized.slice(2, 66)}`)
  if (headWord === 32n) {
    return `0x${normalized.slice(66)}` as `0x${string}`
  }

  return normalized as `0x${string}`
}

function parsePoCData(value: unknown): PoCData {
  if (typeof value !== "object" || value === null) {
    throw new Error("PoC payload must be an object")
  }

  const candidate = value as Partial<PoCData>
  if (
    !candidate.target ||
    typeof candidate.target.contract !== "string" ||
    typeof candidate.target.chain !== "number" ||
    typeof candidate.target.forkBlock !== "number" ||
    !Array.isArray(candidate.setup) ||
    !Array.isArray(candidate.transactions) ||
    !candidate.expectedImpact ||
    typeof candidate.expectedImpact.type !== "string" ||
    typeof candidate.expectedImpact.estimatedLoss !== "string" ||
    typeof candidate.expectedImpact.description !== "string"
  ) {
    throw new Error("PoC payload shape is invalid")
  }

  return candidate as PoCData
}

function parseValidatedPoCPayload(payload: unknown): PoCData {
  if (typeof payload !== "object" || payload === null || !("poc" in payload)) {
    throw new Error("Oasis payload does not include PoC data")
  }

  return parsePoCData((payload as { poc: unknown }).poc)
}

function readStoredPayloadFromOasisContract(
  nodeRuntime: NodeRuntime<Config>,
  reference: OasisReference,
  oasisRpcUrl: string,
): unknown {
  const httpClient = new HTTPClient()
  const metaCallData = encodeFunctionData({
    abi: OasisPoCStoreReadAbi,
    functionName: "readMeta",
    args: [reference.pointer.slotId],
  })

  const metaResp = httpClient.sendRequest(nodeRuntime, {
    url: oasisRpcUrl,
    method: "POST" as const,
    headers: { "Content-Type": "application/json" },
    body: encodeJsonBodyBase64({
      jsonrpc: "2.0",
      method: "eth_call",
      params: [{ to: reference.pointer.contract, data: metaCallData }, "latest"],
      id: 28,
    }),
    cacheSettings: { maxAge: "0s" },
  }).result()

  if (metaResp.statusCode !== 200) {
    throw new Error(`Oasis RPC readMeta eth_call failed: status ${metaResp.statusCode}`)
  }

  const metaPayload = JSON.parse(new TextDecoder().decode(metaResp.body)) as {
    result?: `0x${string}`
    error?: { message?: string }
  }

  if (metaPayload.error) {
    throw new Error(`Oasis storage readMeta failed: ${metaPayload.error.message ?? "unknown error"}`)
  }
  if (!metaPayload.result || metaPayload.result === "0x") {
    throw new Error("Oasis storage readMeta returned empty payload")
  }

  const authorizedCaller = decodeAuthorizedReadCaller(metaPayload.result)

  const callData = encodeFunctionData({
    abi: OasisPoCStoreReadAbi,
    functionName: "read",
    args: [reference.pointer.slotId],
  })

  const callResp = httpClient.sendRequest(nodeRuntime, {
    url: oasisRpcUrl,
    method: "POST" as const,
    headers: { "Content-Type": "application/json" },
    body: encodeJsonBodyBase64({
      jsonrpc: "2.0",
      method: "eth_call",
      params: buildAuthorizedReadCallParams(reference.pointer.contract, callData, authorizedCaller),
      id: 29,
    }),
    cacheSettings: { maxAge: "0s" },
  }).result()

  if (callResp.statusCode !== 200) {
    throw new Error(`Oasis RPC eth_call failed: status ${callResp.statusCode}`)
  }

  const callPayload = JSON.parse(new TextDecoder().decode(callResp.body)) as {
    result?: `0x${string}`
    error?: { message?: string }
  }

  if (callPayload.error) {
    throw new Error(`Oasis storage read failed: ${callPayload.error.message ?? "unknown error"}`)
  }
  if (!callPayload.result || callPayload.result === "0x") {
    throw new Error("Oasis storage read returned empty payload")
  }

  const [payloadJson] = decodeFunctionResult({
    abi: OasisPoCStoreReadAbi,
    functionName: "read",
    data: callPayload.result,
  })

  return JSON.parse(payloadJson)
}

function readPoCFromOasisRpc(
  nodeRuntime: NodeRuntime<Config>,
  reference: OasisReference,
  submissionId: bigint,
  oasisRpcUrl: string,
): PoCData {
  const parsedPayload = readStoredPayloadFromOasisContract(nodeRuntime, reference, oasisRpcUrl)

  const validated = validateOasisRpcPayload({
    reference,
    submissionId,
    payload: parsedPayload,
  })

  if (!validated.ok) {
    throw new Error(
      `Oasis RPC payload validation failed (${validated.error.kind}): ${validated.error.message}`
    )
  }

  return parseValidatedPoCPayload(validated.data)
}

// ═══════════════════ Verification Logic ═══════════════════

/**
 * Validates POC setup operations against project rules.
 * Returns { valid: true } if all operations are allowed.
 * Returns { valid: false, reason: string } if any operation violates rules.
 */
function validateSetupOps(
  setup: PoCData['setup'],
  rules: ProjectRules
): { valid: boolean; reason?: string } {
  for (const step of setup) {
    // Check balance overrides (attacker funding)
    if (step.type === 'setBalance' && step.address) {
      const amount = BigInt(step.value)
      if (amount > rules.maxAttackerSeedWei) {
        return { 
          valid: false, 
          reason: `setBalance exceeds maxAttackerSeedWei: ${amount} > ${rules.maxAttackerSeedWei}` 
        }
      }
    }
    
    // Check timestamp manipulation
    if (step.type === 'setTimestamp' || step.type === 'evm_increaseTime') {
      if (rules.maxWarpSeconds === 0n) {
        return { 
          valid: false, 
          reason: 'Timestamp manipulation not allowed (maxWarpSeconds = 0)' 
        }
      }
      // For setTimestamp, check the offset from current time
      if (step.type === 'setTimestamp') {
        const targetTime = BigInt(step.value)
        const currentTime = BigInt(Math.floor(Date.now() / 1000))
        const offset = targetTime > currentTime ? targetTime - currentTime : currentTime - targetTime
        if (offset > rules.maxWarpSeconds) {
          return {
            valid: false,
            reason: `Timestamp offset exceeds maxWarpSeconds: ${offset} > ${rules.maxWarpSeconds}`
          }
        }
      }
    }
    
    // Check impersonation
    if (step.type === 'impersonate' || step.type === 'prank') {
      if (!rules.allowImpersonation) {
        return { 
          valid: false, 
          reason: 'Impersonation not allowed (allowImpersonation = false)' 
        }
      }
    }
  }
  
  return { valid: true }
}

function verifyForkState(
  nodeRuntime: NodeRuntime<Config>,
  forkBlock: bigint,
  tenderlyAdminRpc: string,
  sourceChainRpcUrl?: string,
): { verified: boolean; forkBlockHash: string; sourceBlockHash?: string } {
  const httpClient = new HTTPClient()

  const forkBlockResp = httpClient.sendRequest(nodeRuntime, {
    url: tenderlyAdminRpc,
    method: "POST" as const,
    headers: { "Content-Type": "application/json" },
    body: encodeJsonBodyBase64({
      jsonrpc: "2.0",
      method: "eth_getBlockByNumber",
      params: [`0x${forkBlock.toString(16)}`, false],
      id: 9998,
    }),
    cacheSettings: { maxAge: "0s" },
  }).result()

  let forkBlockHash = ""
  if (forkBlockResp.statusCode === 200) {
    try {
      const blockData = JSON.parse(new TextDecoder().decode(forkBlockResp.body))
      forkBlockHash = blockData.result?.hash || ""
      nodeRuntime.log(`Fork block ${forkBlock} hash: ${forkBlockHash}`)
    } catch (e) {
      nodeRuntime.log(`Failed to parse fork block response: ${String(e)}`)
    }
  }

  if (!forkBlockHash) {
    return { verified: false, forkBlockHash: "" }
  }

  if (!sourceChainRpcUrl) {
    nodeRuntime.log("Source block comparison skipped (no sourceChainRpcUrl); fork hash presence verified")
    return { verified: true, forkBlockHash }
  }

  const sourceBlockResp = httpClient.sendRequest(nodeRuntime, {
    url: sourceChainRpcUrl,
    method: "POST" as const,
    headers: { "Content-Type": "application/json" },
    body: encodeJsonBodyBase64({
      jsonrpc: "2.0",
      method: "eth_getBlockByNumber",
      params: [`0x${forkBlock.toString(16)}`, false],
      id: 9999,
    }),
    cacheSettings: { maxAge: "0s" },
  }).result()

  let sourceBlockHash = ""
  if (sourceBlockResp.statusCode === 200) {
    try {
      const blockData = JSON.parse(new TextDecoder().decode(sourceBlockResp.body))
      sourceBlockHash = blockData.result?.hash || ""
      nodeRuntime.log(`Source block ${forkBlock} hash: ${sourceBlockHash}`)
    } catch (e) {
      nodeRuntime.log(`Failed to parse source block response: ${String(e)}`)
    }
  }

  const verified = forkBlockHash === sourceBlockHash && forkBlockHash !== ""
  nodeRuntime.log(`State verification: ${verified ? "PASSED" : "FAILED"}`)

  return { verified, forkBlockHash, sourceBlockHash }
}

const verifyPoC = (
  nodeRuntime: NodeRuntime<Config>,
  submissionId: bigint,
  projectId: bigint,
  cipherURI: string,
  rules: ProjectRules,
): VerificationResult => {
  const httpClient = new HTTPClient()
  const config = nodeRuntime.config
  const sepoliaRpcUrl = config.sepoliaRpcUrl ?? SEPOLIA_RPC_URL

  if (!cipherURI.startsWith("oasis://")) {
    nodeRuntime.log("Rejected non-oasis cipherURI in oasis-only mode")
    return { isValid: false, drainAmountWei: 0n }
  }

  if (!config.oasisRpcUrl) {
    nodeRuntime.log("Oasis reference provided but oasisRpcUrl is not configured")
    return { isValid: false, drainAmountWei: 0n }
  }

  let reference: OasisReference
  try {
    reference = parseOasisReferenceUri(cipherURI)
  } catch (e) {
    nodeRuntime.log(`Invalid Oasis reference: ${String(e)}`)
    return { isValid: false, drainAmountWei: 0n }
  }

  let pocJson: PoCData
  try {
    pocJson = readPoCFromOasisRpc(
      nodeRuntime,
      reference,
      submissionId,
      config.oasisRpcUrl,
    )
  } catch (e) {
    nodeRuntime.log(`Failed to read Oasis PoC payload from Sapphire RPC: ${String(e)}`)
    return { isValid: false, drainAmountWei: 0n }
  }

  nodeRuntime.log(`PoC ready: ${pocJson.transactions.length} txs targeting ${pocJson.target.contract}`)

  // Validate setup operations against rules
  const validation = validateSetupOps(pocJson.setup, rules)
  if (!validation.valid) {
    nodeRuntime.log(`POC rejected: ${validation.reason}`)
    return { isValid: false, drainAmountWei: 0n }
  }
  nodeRuntime.log(`Setup validation passed`)

  // ═══ Read project VNet info from contract ═══
  // The VNet is created once per project by vnet-init workflow, reused for all POCs

  const projectCallData = encodeProjectCall(projectId)
  const projectCallResp = httpClient.sendRequest(nodeRuntime, {
    url: sepoliaRpcUrl,
    method: "POST" as const,
    headers: { "Content-Type": "application/json" },
    body: encodeJsonBodyBase64({
      jsonrpc: "2.0",
      method: "eth_call",
      params: [{
        to: config.bountyHubAddress,
        data: projectCallData,
      }, "latest"],
      id: 1,
    }),
    cacheSettings: { maxAge: "0s" },
  }).result()

  if (projectCallResp.statusCode !== 200) {
    nodeRuntime.log(`Failed to read project VNet info: status ${projectCallResp.statusCode}`)
    return { isValid: false, drainAmountWei: 0n }
  }

  const projectCallResult = JSON.parse(new TextDecoder().decode(projectCallResp.body))
  if (projectCallResult.error) {
    nodeRuntime.log(`eth_call error: ${projectCallResult.error.message || projectCallResult.error}`)
    return { isValid: false, drainAmountWei: 0n }
  }

  const { vnetRpcUrl, baseSnapshotId, vnetStatus } = decodeProjectVnetInfo(projectCallResult.result)

  // Check VNet is active
  if (vnetStatus !== VNET_STATUS_ACTIVE) {
    nodeRuntime.log(`VNet not active (status=${vnetStatus}). POC verification skipped.`)
    return { isValid: false, drainAmountWei: 0n }
  }

  if (!vnetRpcUrl || vnetRpcUrl.length === 0) {
    nodeRuntime.log("VNet RPC URL is empty. POC verification skipped.")
    return { isValid: false, drainAmountWei: 0n }
  }

  nodeRuntime.log(`Using project VNet: ${vnetRpcUrl}, snapshot: ${baseSnapshotId}`)

  const adminRpcUrl = vnetRpcUrl

  const forkBlock = BigInt(pocJson.target.forkBlock)
  const sourceChainRpcUrl = pocJson.target.chain === 1 ? config.mainnetRpcUrl : undefined

  const stateResult = verifyForkState(
    nodeRuntime,
    forkBlock,
    adminRpcUrl,
    sourceChainRpcUrl
  )

  if (!stateResult.verified) {
    nodeRuntime.log("State verification failed; rejecting PoC result")
    return { isValid: false, drainAmountWei: 0n }
  }

  // ═══ HTTP 3: Batch RPC — state isolation + setup + execute + state diff ═══
  const batchCalls: Array<{ jsonrpc: string; id: number; method: string; params: unknown[] }> = []
  let callId = 1

  // 3a: State isolation - revert to base snapshot, then create new snapshot
  const revertId = callId++
  batchCalls.push({
    jsonrpc: "2.0",
    id: revertId,
    method: "evm_revert",
    params: [baseSnapshotId],
  })

  const newSnapshotId = callId++
  batchCalls.push({
    jsonrpc: "2.0",
    id: newSnapshotId,
    method: "evm_snapshot",
    params: [],
  })

  // 3b: Setup preconditions
  for (const step of pocJson.setup) {
    if (step.type === "setBalance" && step.address) {
      batchCalls.push({
        jsonrpc: "2.0",
        id: callId++,
        method: "tenderly_setBalance",
        params: [[step.address], `0x${BigInt(step.value).toString(16)}`],
      })
    } else if (step.type === "setTimestamp") {
      batchCalls.push({
        jsonrpc: "2.0",
        id: callId++,
        method: "evm_setNextBlockTimestamp",
        params: [`0x${BigInt(step.value).toString(16)}`],
      })
    }
  }

  // 3c: Get pre-attack balance
  const preBalanceId = callId++
  batchCalls.push({
    jsonrpc: "2.0",
    id: preBalanceId,
    method: "eth_getBalance",
    params: [pocJson.target.contract, "latest"],
  })

  // 3d: Execute attack transactions
  const txIds: number[] = []
  const attackerAddress = pocJson.setup.find(s => s.type === "setBalance")?.address || "0x0000000000000000000000000000000000000001"

  for (const tx of pocJson.transactions) {
    const txId = callId++
    txIds.push(txId)
    batchCalls.push({
      jsonrpc: "2.0",
      id: txId,
      method: "eth_sendTransaction",
      params: [{
        from: attackerAddress,
        to: tx.to,
        data: tx.data,
        value: tx.value && tx.value !== "0" ? `0x${BigInt(tx.value).toString(16)}` : "0x0",
        gas: "0x7A1200",
      }],
    })
  }

  // 3e: Get post-attack balance
  const postBalanceId = callId++
  batchCalls.push({
    jsonrpc: "2.0",
    id: postBalanceId,
    method: "eth_getBalance",
    params: [pocJson.target.contract, "latest"],
  })

  const batchResp = httpClient.sendRequest(nodeRuntime, {
    url: adminRpcUrl,
    method: "POST" as const,
    headers: { "Content-Type": "application/json" },
    body: encodeJsonBodyBase64(batchCalls),
  }).result()

  if (batchResp.statusCode !== 200) {
    nodeRuntime.log(`Tenderly batch RPC failed: status ${batchResp.statusCode}`)
    return { isValid: false, drainAmountWei: 0n }
  }

  const batchResults: Array<{ id: number; result?: string; error?: { message: string } }> =
    JSON.parse(new TextDecoder().decode(batchResp.body))

  // Parse results
  const preBalResult = batchResults.find(r => r.id === preBalanceId)
  const postBalResult = batchResults.find(r => r.id === postBalanceId)
  const balanceBefore = BigInt(preBalResult?.result || "0")
  const balanceAfter = BigInt(postBalResult?.result || "0")
  const balanceDiff = balanceBefore > balanceAfter ? balanceBefore - balanceAfter : 0n

  const txSuccesses = txIds.map(id => {
    const r = batchResults.find(res => res.id === id)
    return r !== undefined && r.error === undefined
  })
  const allTxSucceeded = txSuccesses.every(Boolean)

  nodeRuntime.log(`Pre-balance: ${balanceBefore}, Post-balance: ${balanceAfter}, Diff: ${balanceDiff}`)
  nodeRuntime.log(`TX results: ${txSuccesses.map((s, i) => `tx${i}=${s ? "OK" : "FAIL"}`).join(", ")}`)

  const isValid = allTxSucceeded && balanceDiff > 0n
  nodeRuntime.log(`Final verdict: execution=${isValid}`)

  return {
    isValid,
    drainAmountWei: isValid ? balanceDiff : 0n,
  }
}

// ═══════════════════ Main Handler ═══════════════════

const onPoCRevealed = (runtime: Runtime<Config>, log: EVMLog): string => {
  const topic1 = bytesToHex(log.topics[1])
  const submissionId = BigInt(topic1.startsWith("0x") ? topic1 : `0x${topic1}`)

  runtime.log(`PoC Revealed #${submissionId}`)

  const submission = runtime
    .runInNodeMode(
      readSubmissionInNode,
      consensusIdenticalAggregation<ChainSubmissionRecord>()
    )(submissionId)
    .result()
  const { cipherURI, projectId } = submission

  const idempotencySource = log as unknown as Record<string, unknown>
  const idempotencyInput = {
    mappingVersion: VERIFY_POC_REVEALED_IDEMPOTENCY_MAPPING_VERSION,
    mappingMode: VERIFY_POC_REVEALED_IDEMPOTENCY_MAPPING_MODE,
    chainSelectorName: runtime.config.chainSelectorName,
    bountyHubAddress: runtime.config.bountyHubAddress,
    projectId,
    submissionId,
    txHash:
      typeof idempotencySource.transactionHash === "string"
        ? idempotencySource.transactionHash
        : typeof idempotencySource.txHash === "string"
          ? idempotencySource.txHash
          : undefined,
    logIndex:
      typeof idempotencySource.logIndex === "bigint" ||
      typeof idempotencySource.logIndex === "number" ||
      typeof idempotencySource.logIndex === "string"
        ? idempotencySource.logIndex
        : undefined,
  }

  const idempotencyKey = deriveVerifyPocIdempotencyKey(idempotencyInput)
  assertVerifyPocIdempotencyMappingStable(
    processedRevealIdempotencyMappingBySourceEvent,
    idempotencyInput
  )

  const idempotencyDecision = claimVerifyPocIdempotencySlot(
    processedRevealIdempotency,
    idempotencyKey
  )
  if (!idempotencyDecision.shouldProcess) {
    runtime.log(
      `Skipping duplicate PoCRevealed. key=${idempotencyKey}, reason=${idempotencyDecision.reason}`
    )
    return `idempotency_skip:${idempotencyDecision.reason}:${idempotencyKey}`
  }

  runtime.log(`Idempotency accepted. key=${idempotencyKey}`)

  try {
    const defaultRules: ProjectRules = {
      maxAttackerSeedWei: 1000000000000000000000n,
      maxWarpSeconds: 365n * 24n * 60n * 60n,
      allowImpersonation: true,
      thresholds: {
        criticalDrainWei: 1000000000000000000000n,
        highDrainWei: 100000000000000000000n,
        mediumDrainWei: 10000000000000000000n,
        lowDrainWei: 1000000000000000000n,
      }
    }

    const verifyResult = runtime
      .runInNodeMode(
        verifyPoC,
        consensusIdenticalAggregation<VerificationResult>()
      )(submissionId, projectId, cipherURI, defaultRules)
      .result()

    runtime.log(`Verification result: valid=${verifyResult.isValid}, drain=${verifyResult.drainAmountWei}`)

    const network = getNetwork({
      chainFamily: "evm",
      chainSelectorName: runtime.config.chainSelectorName,
      isTestnet: true,
    })

    if (!network) {
      throw new Error(`Network not found: ${runtime.config.chainSelectorName}`)
    }

    const evmClient = new EVMClient(network.chainSelector.selector)

    const reportData = encodeAbiParameters(BountyResultParamsV2, [
      submissionId,
      verifyResult.isValid,
      verifyResult.drainAmountWei,
    ])

    const report = runtime
      .report({
        encodedPayload: hexToBase64(reportData),
        encoderName: "evm",
        signingAlgo: "ecdsa",
        hashingAlgo: "keccak256",
      })
      .result()

    const writeResult = evmClient
      .writeReport(runtime, {
        receiver: runtime.config.bountyHubAddress,
        report,
        gasConfig: { gasLimit: runtime.config.gasLimit },
      })
      .result()

    if (writeResult.txStatus === TxStatus.SUCCESS) {
      const txHash = bytesToHex(writeResult.txHash || new Uint8Array(32))
      markVerifyPocIdempotencyCompleted(processedRevealIdempotency, idempotencyKey)
      runtime.log(`Result written on-chain. tx=${txHash}`)
      return txHash
    }

    throw new Error(`EVM Write failed: ${writeResult.txStatus}`)
  } catch (error) {
    releaseVerifyPocIdempotencySlot(processedRevealIdempotency, idempotencyKey)
    throw error
  }
}

function readSubmissionInNode(
  nodeRuntime: NodeRuntime<Config>,
  submissionId: bigint
): ChainSubmissionRecord {
  const httpClient = new HTTPClient()
  const callData = encodeSubmissionReadCall(submissionId)
  const sepoliaRpcUrl = nodeRuntime.config.sepoliaRpcUrl ?? SEPOLIA_RPC_URL

  const callResp = httpClient.sendRequest(nodeRuntime, {
    url: sepoliaRpcUrl,
    method: "POST" as const,
    headers: { "Content-Type": "application/json" },
    body: encodeJsonBodyBase64({
      jsonrpc: "2.0",
      method: "eth_call",
      params: [
        {
          to: nodeRuntime.config.bountyHubAddress,
          data: callData,
        },
        "latest",
      ],
      id: 7,
    }),
    cacheSettings: { maxAge: "0s" },
  }).result()

  if (callResp.statusCode !== 200) {
    throw new Error(`Failed to read submission ${submissionId}: status ${callResp.statusCode}`)
  }

  const callResult = JSON.parse(new TextDecoder().decode(callResp.body)) as {
    result?: string
    error?: { message?: string }
  }

  if (callResult.error) {
    throw new Error(
      `Failed to read submission ${submissionId}: ${callResult.error.message ?? "eth_call error"}`
    )
  }

  if (typeof callResult.result !== "string") {
    throw new Error(`Failed to read submission ${submissionId}: invalid eth_call response`)
  }

  return decodeSubmissionReadResult(callResult.result)
}

// ═══════════════════ Workflow Init ═══════════════════

const initWorkflow = (config: Config) => {
  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: config.chainSelectorName,
    isTestnet: true,
  })

  if (!network) {
    throw new Error(`Network not found: ${config.chainSelectorName}`)
  }

  const evmClient = new EVMClient(network.chainSelector.selector)

  const pocRevealedHash = keccak256(
    toBytes("PoCRevealed(uint256)")
  )

  return [
    handler(
      evmClient.logTrigger({
        addresses: [hexToBase64(config.bountyHubAddress)],
        topics: [
          { values: [hexToBase64(pocRevealedHash)] },
        ],
      }),
      onPoCRevealed
    ),
  ]
}

export async function main() {
  const runner = await Runner.newRunner<Config>()
  await runner.run(initWorkflow)
}
