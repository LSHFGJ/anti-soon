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
  encodeAbiParameters,
  parseAbiParameters,
  keccak256,
  toBytes,
  decodeAbiParameters,
} from "viem"
import { z } from "zod"

// ═══════════════════ Config ═══════════════════

const configSchema = z.object({
  chainSelectorName: z.string(),
  bountyHubAddress: z.string(),
  gasLimit: z.string(),
  tenderlyAccountSlug: z.string(),
  tenderlyProjectSlug: z.string(),
  llmApiUrl: z.string(),
  ipfsGateway: z.string(),
})

type Config = z.infer<typeof configSchema>

// ═══════════════════ Types ═══════════════════

type VerificationResult = {
  isValid: boolean
  severity: bigint
  suggestedPayout: bigint
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

const BountyResultParams = parseAbiParameters(
  "uint256 submissionId, bool isValid, uint256 severity, uint256 payoutAmount"
)

const PoCSubmittedDataParams = parseAbiParameters("bytes32 pocHash, string pocURI")

// ═══════════════════ Verification Logic (placeholder) ═══════════════════

const verifyPoC = (
  nodeRuntime: NodeRuntime<Config>,
  submissionId: bigint,
  pocHash: string,
  pocURI: string
): VerificationResult => {
  nodeRuntime.log(`[Node] Verifying PoC #${submissionId}`)
  nodeRuntime.log(`[Node] pocHash: ${pocHash}`)
  nodeRuntime.log(`[Node] pocURI: ${pocURI}`)

  // TODO: HTTP 1 - Fetch PoC from IPFS (Task 8)
  // TODO: HTTP 2 - Create Tenderly fork (Task 9)
  // TODO: HTTP 3 - Execute PoC on Tenderly (Task 9)
  // TODO: HTTP 4 - LLM analysis (Task 10)

  return {
    isValid: false,
    severity: 0n,
    suggestedPayout: 0n,
  }
}

// ═══════════════════ Main Handler ═══════════════════

const onPoCSubmitted = (runtime: Runtime<Config>, log: EVMLog): string => {
  const submissionId = BigInt("0x" + bytesToHex(log.topics[1]).slice(2))
  const projectId = BigInt("0x" + bytesToHex(log.topics[2]).slice(2))
  const auditorHex = "0x" + bytesToHex(log.topics[3]).slice(26)

  runtime.log(`PoC Submission #${submissionId} received`)
  runtime.log(`Project: ${projectId}, Auditor: ${auditorHex}`)

  const dataHex = ("0x" + bytesToHex(log.data)) as `0x${string}`
  const [pocHash, pocURI] = decodeAbiParameters(PoCSubmittedDataParams, dataHex)

  runtime.log(`pocHash: ${pocHash}`)
  runtime.log(`pocURI: ${pocURI}`)

  const verifyResult = runtime
    .runInNodeMode(
      verifyPoC,
      consensusIdenticalAggregation<VerificationResult>()
    )(submissionId, pocHash as string, pocURI)
    .result()

  runtime.log(`Verification result: valid=${verifyResult.isValid}, severity=${verifyResult.severity}`)

  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: runtime.config.chainSelectorName,
    isTestnet: true,
  })

  if (!network) {
    throw new Error(`Network not found: ${runtime.config.chainSelectorName}`)
  }

  const evmClient = new EVMClient(network.chainSelector.selector)

  const reportData = encodeAbiParameters(BountyResultParams, [
    submissionId,
    verifyResult.isValid,
    verifyResult.severity,
    verifyResult.suggestedPayout,
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
    runtime.log(`Result written on-chain. tx=${txHash}`)
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

  const pocSubmittedHash = keccak256(
    toBytes("PoCSubmitted(uint256,uint256,address,bytes32,string)")
  )

  return [
    handler(
      evmClient.logTrigger({
        addresses: [hexToBase64(config.bountyHubAddress)],
        topics: [
          { values: [hexToBase64(pocSubmittedHash)] },
        ],
      }),
      onPoCSubmitted
    ),
  ]
}

export async function main() {
  const runner = await Runner.newRunner<Config>()
  await runner.run(initWorkflow)
}
