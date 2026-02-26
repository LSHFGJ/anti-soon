import {
  EVMClient,
  handler,
  getNetwork,
  hexToBase64,
  bytesToHex,
  TxStatus,
  Runner,
  type Runtime,
  type EVMLog,
} from "@chainlink/cre-sdk"
import {
  encodeAbiParameters,
  parseAbiParameters,
  keccak256,
  toBytes,
} from "viem"
import { z } from "zod"
import {
  buildProjectKeyProvisioningMetadata,
  createSafeProvisioningLogs,
  validatePrivateKeyHex,
} from "./src/provisioning"
import { generateDeterministicECDHKeyPair } from "./src/keypair"

// ═══════════════════ Config ═══════════════════

const configSchema = z.object({
  chainSelectorName: z.string(),
  bountyHubAddress: z.string(),
  forwarderAddress: z.string(),
  gasLimit: z.string(),
  keyProvisioningMode: z.literal("manual").optional().default("manual"),
  keySecretPrefix: z.string().optional().default("PROJECT_KEY_"),
  oasisChain: z.string().optional().default("oasis-sapphire-testnet"),
})

type Config = z.infer<typeof configSchema>

// ═══════════════════ ABI Definitions ═══════════════════

// Report format: (projectId, publicKey) for keygen
// The contract's _processReport will detect this format and update the public key
const KeygenReportParams = parseAbiParameters(
  "uint256 projectId, bytes publicKey"
)

// ═══════════════════ Vault DON Storage ═══════════════════

function storePrivateKeyInVault(
  runtime: Runtime<Config>,
  projectId: bigint,
  owner: string,
  privateKey: string
): void {
  if (!validatePrivateKeyHex(privateKey)) {
    throw new Error(`Invalid private key generated for project ${projectId}`)
  }

  const provisioning = buildProjectKeyProvisioningMetadata(projectId, owner, {
    keyProvisioningMode: runtime.config.keyProvisioningMode,
    keySecretPrefix: runtime.config.keySecretPrefix,
    oasisChain: runtime.config.oasisChain,
  })

  for (const line of createSafeProvisioningLogs(provisioning)) {
    runtime.log(line)
  }
}

// ═══════════════════ Main Handler ═══════════════════

const onProjectRegistered = (runtime: Runtime<Config>, log: EVMLog): string => {
  // Extract projectId (topic[1]) and owner (topic[2]) from indexed params
  const projectIdHex = bytesToHex(log.topics[1])
  const ownerHex = bytesToHex(log.topics[2])
  const modeHex = log.topics.length > 3 ? bytesToHex(log.topics[3]) : "0x00"
  
  const projectId = BigInt(projectIdHex.startsWith("0x") ? projectIdHex : "0x" + projectIdHex)
  const owner = ownerHex.startsWith("0x") ? ownerHex : "0x" + ownerHex
  const mode = parseInt(modeHex.replace("0x", ""), 16)
  
  runtime.log(`ProjectRegisteredV2: projectId=${projectId}, owner=${owner}, mode=${mode}`)
  
  // Generate ECDH keypair
  const { privateKey, publicKey } = generateDeterministicECDHKeyPair(projectId, owner)
  runtime.log(`Generated ECDH keypair for project ${projectId} (pubkey: ${publicKey.slice(0, 16)}...)`)
  
  // Store private key in Vault DON with owner binding
  storePrivateKeyInVault(runtime, projectId, owner, privateKey)
  
  const publicKeyBytes = ("0x" + publicKey) as `0x${string}`
  const reportData = encodeAbiParameters(KeygenReportParams, [
    projectId,
    publicKeyBytes,
  ])
  
  // Create and sign the report
  const report = runtime
    .report({
      encodedPayload: hexToBase64(reportData),
      encoderName: "evm",
      signingAlgo: "ecdsa",
      hashingAlgo: "keccak256",
    })
    .result()
  
  // Get network and create EVM client
  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: runtime.config.chainSelectorName,
    isTestnet: true,
  })
  
  if (!network) {
    throw new Error(`Network not found: ${runtime.config.chainSelectorName}`)
  }
  
  const evmClient = new EVMClient(network.chainSelector.selector)
  
  // Write the public key update to BountyHub
  // The contract's _processReport will decode this and call updateProjectPublicKey
  const writeResult = evmClient
    .writeReport(runtime, {
      receiver: runtime.config.bountyHubAddress,
      report,
      gasConfig: { gasLimit: runtime.config.gasLimit },
    })
    .result()
  
  if (writeResult.txStatus === TxStatus.SUCCESS) {
    const txHash = bytesToHex(writeResult.txHash || new Uint8Array(32))
    runtime.log(`Public key updated on-chain. tx=${txHash}`)
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
  
  // Event: ProjectRegisteredV2(uint256 indexed projectId, address indexed owner, uint8 mode)
  // Note: indexed uint8 mode becomes topic[3]
  const projectRegisteredHash = keccak256(toBytes("ProjectRegisteredV2(uint256,address,uint8)"))
  
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
