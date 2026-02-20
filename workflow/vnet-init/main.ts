import {
  EVMClient,
  HTTPClient,
  ConfidentialHTTPClient,
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
  encodeAbiParameters,
  parseAbiParameters,
  keccak256,
  toBytes,
} from "viem"
import { z } from "zod"

// ═══════════════════ Config ═══════════════════

const configSchema = z.object({
  chainSelectorName: z.string(),
  bountyHubAddress: z.string(),
  gasLimit: z.string(),
  tenderlyAccountSlug: z.string(),
  tenderlyProjectSlug: z.string(),
  owner: z.string(), // DON owner address for vaultDonSecrets
})

type Config = z.infer<typeof configSchema>

// ═══════════════════ Types ═══════════════════

type VnetResult = {
  success: boolean
  projectId: bigint
  vnetRpcUrl: string
  baseSnapshotId: string // bytes32 as hex string
}

// ═══════════════════ ABI Definitions ═══════════════════

// Report format for setProjectVnet: (projectId, vnetRpcUrl, baseSnapshotId)
const VnetReportParams = parseAbiParameters(
  "uint256 projectId, string vnetRpcUrl, bytes32 baseSnapshotId"
)

// Report format for markVnetFailed: (projectId, reason)
const VnetFailedParams = parseAbiParameters(
  "uint256 projectId, string reason"
)

// ═══════════════════ VNet Creation Logic ═══════════════════

const MAX_RETRIES = 3
const SEPOLIA_CHAIN_ID = 11155111
const VNET_CHAIN_ID = 73571

/**
 * Creates a Tenderly VNet with State Sync enabled and returns the RPC URL
 * Uses ConfidentialHTTPClient for API key protection
 */
function createVnet(
  nodeRuntime: NodeRuntime<Config>,
  projectId: bigint,
  attempt: number
): { success: boolean; adminRpcUrl?: string; error?: string } {
  const confidentialHttpClient = new ConfidentialHTTPClient()
  const config = nodeRuntime.config

  nodeRuntime.log(`VNet creation attempt ${attempt}/${MAX_RETRIES} for project ${projectId}`)

  const createVnetResp = confidentialHttpClient.sendRequest(nodeRuntime, {
    request: {
      url: `https://api.tenderly.co/api/v1/account/${config.tenderlyAccountSlug}/project/${config.tenderlyProjectSlug}/vnets`,
      method: "POST",
      multiHeaders: {
        "Content-Type": { values: ["application/json"] },
        "X-Access-Key": { values: ["{{.TENDERLY_API_KEY}}"] },
      },
      bodyString: JSON.stringify({
        slug: `antisoon-project-${projectId}`,
        display_name: `AntiSoon Project #${projectId}`,
        fork_config: {
          network_id: SEPOLIA_CHAIN_ID,
          block_number: "latest",
        },
        virtual_network_config: {
          chain_config: { chain_id: VNET_CHAIN_ID },
        },
        sync_state_config: { enabled: true },
      }),
    },
    vaultDonSecrets: [
      { key: "TENDERLY_API_KEY", owner: config.owner },
      { key: "san_marino_aes_gcm_encryption_key" },
    ],
    encryptOutput: true,
  }).result()

  if (createVnetResp.statusCode !== 200 && createVnetResp.statusCode !== 201) {
    const errorBody = new TextDecoder().decode(createVnetResp.body)
    nodeRuntime.log(`VNet creation failed (status ${createVnetResp.statusCode}): ${errorBody}`)
    return { success: false, error: `HTTP ${createVnetResp.statusCode}: ${errorBody.slice(0, 200)}` }
  }

  const vnetData = JSON.parse(new TextDecoder().decode(createVnetResp.body))
  const adminRpcUrl = vnetData.rpcs?.find((r: { name: string; url: string }) => r.name === "Admin RPC")?.url
    || vnetData.rpcs?.[0]?.url

  if (!adminRpcUrl) {
    nodeRuntime.log("Failed to get Admin RPC URL from Tenderly response")
    return { success: false, error: "No RPC URL in Tenderly response" }
  }

  nodeRuntime.log(`VNet created successfully: ${adminRpcUrl}`)
  return { success: true, adminRpcUrl }
}

/**
 * Calls evm_snapshot on the VNet to get a base snapshot ID for state isolation
 */
function createSnapshot(
  nodeRuntime: NodeRuntime<Config>,
  adminRpcUrl: string
): { success: boolean; snapshotId?: string; error?: string } {
  const httpClient = new HTTPClient()

  const snapshotResp = httpClient.sendRequest(nodeRuntime, {
    url: adminRpcUrl,
    method: "POST" as const,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "evm_snapshot",
      params: [],
      id: 1,
    }),
    cacheSettings: { maxAge: "0s" },
  }).result()

  if (snapshotResp.statusCode !== 200) {
    const errorBody = new TextDecoder().decode(snapshotResp.body)
    nodeRuntime.log(`evm_snapshot failed (status ${snapshotResp.statusCode}): ${errorBody}`)
    return { success: false, error: `Snapshot failed: HTTP ${snapshotResp.statusCode}` }
  }

  try {
    const result = JSON.parse(new TextDecoder().decode(snapshotResp.body))
    if (result.error) {
      nodeRuntime.log(`evm_snapshot error: ${result.error.message || result.error}`)
      return { success: false, error: result.error.message || "evm_snapshot error" }
    }
    
    const snapshotId = result.result
    if (!snapshotId || typeof snapshotId !== "string") {
      nodeRuntime.log(`evm_snapshot returned invalid result: ${JSON.stringify(result)}`)
      return { success: false, error: "Invalid snapshot ID returned" }
    }

    nodeRuntime.log(`Created base snapshot: ${snapshotId}`)
    return { success: true, snapshotId }
  } catch (e) {
    nodeRuntime.log(`Failed to parse evm_snapshot response: ${String(e)}`)
    return { success: false, error: `Parse error: ${String(e)}` }
  }
}

/**
 * Main VNet initialization logic with retry handling
 */
const initVnet = (
  nodeRuntime: NodeRuntime<Config>,
  projectId: bigint
): VnetResult => {
  let lastError = "Unknown error"

  // Retry VNet creation up to MAX_RETRIES times
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const vnetResult = createVnet(nodeRuntime, projectId, attempt)
    
    if (!vnetResult.success) {
      lastError = vnetResult.error || "VNet creation failed"
      if (attempt < MAX_RETRIES) {
        nodeRuntime.log(`Retrying VNet creation (${attempt}/${MAX_RETRIES})...`)
        continue
      }
      // All retries exhausted
      return {
        success: false,
        projectId,
        vnetRpcUrl: "",
        baseSnapshotId: "",
      }
    }

    // VNet created, now create snapshot
    const snapshotResult = createSnapshot(nodeRuntime, vnetResult.adminRpcUrl!)
    
    if (!snapshotResult.success) {
      lastError = snapshotResult.error || "Snapshot creation failed"
      // Snapshot failure doesn't retry - VNet is already created
      // We'll use empty snapshot ID as fallback
      nodeRuntime.log(`Snapshot failed, using empty snapshot ID: ${lastError}`)
      return {
        success: true,
        projectId,
        vnetRpcUrl: vnetResult.adminRpcUrl!,
        baseSnapshotId: "0x0000000000000000000000000000000000000000000000000000000000000000",
      }
    }

    return {
      success: true,
      projectId,
      vnetRpcUrl: vnetResult.adminRpcUrl!,
      baseSnapshotId: snapshotResult.snapshotId!,
    }
  }

  // Should never reach here, but TypeScript needs a return
  return {
    success: false,
    projectId,
    vnetRpcUrl: "",
    baseSnapshotId: "",
  }
}

// ═══════════════════ Main Handler ═══════════════════

const onProjectRegistered = (runtime: Runtime<Config>, log: EVMLog): string => {
  // Extract projectId (topic[1]) and owner (topic[2]) from indexed params
  // Event: ProjectRegisteredV2(uint256 indexed projectId, address indexed owner, CompetitionMode mode)
  const projectIdHex = bytesToHex(log.topics[1])
  const ownerHex = bytesToHex(log.topics[2])
  const modeHex = log.topics.length > 3 ? bytesToHex(log.topics[3]) : "0x00"
  
  const projectId = BigInt(projectIdHex.startsWith("0x") ? projectIdHex : "0x" + projectIdHex)
  const owner = ownerHex.startsWith("0x") ? ownerHex : "0x" + ownerHex
  const mode = parseInt(modeHex.replace("0x", ""), 16)
  
  runtime.log(`ProjectRegisteredV2: projectId=${projectId}, owner=${owner}, mode=${mode}`)

  // Run VNet initialization in Node mode for HTTP access
  const result = runtime
    .runInNodeMode(
      initVnet,
      consensusIdenticalAggregation<VnetResult>()
    )(projectId)
    .result()

  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: runtime.config.chainSelectorName,
    isTestnet: true,
  })

  if (!network) {
    throw new Error(`Network not found: ${runtime.config.chainSelectorName}`)
  }

  const evmClient = new EVMClient(network.chainSelector.selector)

  if (!result.success) {
    // VNet creation failed - report failure to contract
    runtime.log(`VNet initialization failed for project ${projectId}`)
    
    const failureReason = "VNet creation failed after max retries"
    const reportData = encodeAbiParameters(VnetFailedParams, [
      projectId,
      failureReason,
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
      runtime.log(`VNet failure reported on-chain. tx=${txHash}`)
      return txHash
    }

    throw new Error(`EVM Write failed for vnet failure report: ${writeResult.txStatus}`)
  }

  // VNet creation succeeded - report success to contract
  runtime.log(`VNet initialized: rpc=${result.vnetRpcUrl}, snapshot=${result.baseSnapshotId}`)

  const reportData = encodeAbiParameters(VnetReportParams, [
    projectId,
    result.vnetRpcUrl,
    result.baseSnapshotId as `0x${string}`,
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
    runtime.log(`VNet info written on-chain. tx=${txHash}`)
    return txHash
  }

  throw new Error(`EVM Write failed: ${writeResult.txStatus}`)
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

  // Event: ProjectRegisteredV2(uint256 indexed projectId, address indexed owner, CompetitionMode mode)
  // CompetitionMode is uint8, indexed as topic[3]
  const projectRegisteredHash = keccak256(
    toBytes("ProjectRegisteredV2(uint256,address,uint8)")
  )

  return [
    handler(
      evmClient.logTrigger({
        addresses: [hexToBase64(config.bountyHubAddress)],
        topics: [
          { values: [hexToBase64(projectRegisteredHash)] },
        ],
      }),
      onProjectRegistered
    ),
  ]
}

export async function main() {
  const runner = await Runner.newRunner<Config>()
  await runner.run(initWorkflow)
}
