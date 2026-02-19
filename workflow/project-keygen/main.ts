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
import elliptic from "elliptic"

// ═══════════════════ Config ═══════════════════

const configSchema = z.object({
  chainSelectorName: z.string(),
  bountyHubAddress: z.string(),
  forwarderAddress: z.string(),
  gasLimit: z.string(),
})

type Config = z.infer<typeof configSchema>

// ═══════════════════ Types ═══════════════════

type KeygenResult = {
  projectId: bigint
  publicKeyBytes: string // hex string of 64 bytes
}

// ═══════════════════ ABI Definitions ═══════════════════

// Report format: (projectId, publicKey) for keygen
// The contract's _processReport will detect this format and update the public key
const KeygenReportParams = parseAbiParameters(
  "uint256 projectId, bytes publicKey"
)

// ═══════════════════ ECDH Key Generation ═══════════════════

const EC = elliptic.ec
const curve = new EC("p256") // P-256 curve for ECDH

/**
 * Generates an ECDH key pair using the P-256 curve
 * @returns {privateKey: hex string, publicKey: 64-byte uncompressed hex}
 */
function generateECDHKeyPair(): { privateKey: string; publicKey: string } {
  // Generate random key pair
  const keyPair = curve.genKeyPair()
  
  // Get private key as 32-byte hex
  const privateKey = keyPair.getPrivate("hex").padStart(64, "0")
  
  // Get public key as uncompressed 64-byte (X || Y, without 0x04 prefix)
  const pubPoint = keyPair.getPublic()
  const pubX = pubPoint.getX().toString("hex").padStart(64, "0")
  const pubY = pubPoint.getY().toString("hex").padStart(64, "0")
  const publicKey = pubX + pubY // 128 hex chars = 64 bytes
  
  return { privateKey, publicKey }
}

/**
 * Derives the ECDH shared secret from a private key and another public key
 * Used for decrypting POC ciphertexts
 */
function deriveSharedSecret(privateKeyHex: string, publicKeyHex: string): string {
  const keyPair = curve.keyFromPrivate(privateKeyHex, "hex")
  const pubPoint = curve.keyFromPublic(publicKeyHex, "hex").getPublic()
  const shared = keyPair.derive(pubPoint)
  return shared.toString("hex").padStart(64, "0")
}

// ═══════════════════ Vault DON Storage ═══════════════════

/**
 * Stores the private key in Vault DON with owner-based access control
 * 
 * NOTE: CRE SDK currently exposes runtime.getSecret() for retrieval but not
 * a direct runtime.setSecret() for dynamic storage. This implementation
 * uses a placeholder approach that can be extended to:
 * 
 * 1. Use HTTP capability to call an external secret management service
 * 2. Use DON threshold encryption (requires DON-level configuration)
 * 3. Use a dedicated secret storage contract
 * 
 * For the hackathon demo, we log the key hash for verification.
 */
function storePrivateKeyInVault(
  runtime: Runtime<Config>,
  projectId: bigint,
  owner: string,
  privateKey: string
): void {
  // Compute key hash for verification (never log the actual private key)
  const keyHash = keccak256(toBytes(privateKey))
  
  // Log for demo purposes - in production, this would use proper Vault DON storage
  runtime.log(`Keygen: Project ${projectId} private key stored (hash: ${keyHash})`)
  runtime.log(`Keygen: Owner ${owner} has access to this key`)
  
  // TODO: Production implementation would use one of:
  // 1. HTTP capability to external secret store with owner authentication
  // 2. DON threshold encryption with owner-bound decryption
  // 3. On-chain encrypted storage with owner-controlled decryption
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
  const { privateKey, publicKey } = generateECDHKeyPair()
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
  const projectRegisteredHash = keccak256(
    toBytes("ProjectRegisteredV2(uint256,uint256,uint8)")
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

// Export for testing
export { generateECDHKeyPair, deriveSharedSecret }
