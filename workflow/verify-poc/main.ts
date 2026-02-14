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
  const httpClient = new HTTPClient()
  const config = nodeRuntime.config

  // ═══ HTTP 1: Fetch PoC from IPFS ═══
  const ipfsCid = pocURI.replace("ipfs://", "")
  const pocResp = httpClient.sendRequest(nodeRuntime, {
    url: `${config.ipfsGateway}${ipfsCid}`,
    method: "GET" as const,
  }).result()

  if (pocResp.statusCode !== 200) {
    nodeRuntime.log(`IPFS fetch failed: status ${pocResp.statusCode}`)
    return { isValid: false, severity: 0n, suggestedPayout: 0n }
  }

  const pocJson: PoCData = JSON.parse(new TextDecoder().decode(pocResp.body))
  nodeRuntime.log(`PoC fetched: ${pocJson.transactions.length} txs targeting ${pocJson.target.contract}`)

  // ═══ HTTP 2: Create Tenderly Virtual TestNet ═══
  const tenderlyApiKey = nodeRuntime.getSecret({ id: "TENDERLY_API_KEY" }).result()

  const createVnetResp = httpClient.sendRequest(nodeRuntime, {
    url: `https://api.tenderly.co/api/v1/account/${config.tenderlyAccountSlug}/project/${config.tenderlyProjectSlug}/vnets`,
    method: "POST" as const,
    headers: {
      "Content-Type": "application/json",
      "X-Access-Key": tenderlyApiKey,
    },
    body: new TextEncoder().encode(JSON.stringify({
      slug: `antisoon-${submissionId}-${Date.now()}`,
      display_name: `AntiSoon Verify #${submissionId}`,
      fork_config: {
        network_id: pocJson.target.chain,
        block_number: pocJson.target.forkBlock,
      },
      virtual_network_config: {
        chain_config: { chain_id: 73571 },
      },
      sync_state_config: { enabled: false },
    })),
  }).result()

  if (createVnetResp.statusCode !== 200 && createVnetResp.statusCode !== 201) {
    nodeRuntime.log(`Tenderly VNet creation failed: status ${createVnetResp.statusCode}`)
    return { isValid: false, severity: 0n, suggestedPayout: 0n }
  }

  const vnetData = JSON.parse(new TextDecoder().decode(createVnetResp.body))
  const adminRpcUrl = vnetData.rpcs?.find((r: { name: string; url: string }) => r.name === "Admin RPC")?.url
    || vnetData.rpcs?.[0]?.url

  if (!adminRpcUrl) {
    nodeRuntime.log("Failed to get Admin RPC URL from Tenderly response")
    return { isValid: false, severity: 0n, suggestedPayout: 0n }
  }

  nodeRuntime.log(`Tenderly VNet created: ${adminRpcUrl}`)

  // ═══ HTTP 3: Batch RPC — setup + execute + state diff ═══
  const batchCalls: Array<{ jsonrpc: string; id: number; method: string; params: unknown[] }> = []
  let callId = 1

  // 3a: Setup preconditions
  for (const step of pocJson.setup) {
    if (step.type === "setBalance" && step.address) {
      batchCalls.push({
        jsonrpc: "2.0",
        id: callId++,
        method: "tenderly_setBalance",
        params: [[step.address], "0x" + BigInt(step.value).toString(16)],
      })
    } else if (step.type === "setTimestamp") {
      batchCalls.push({
        jsonrpc: "2.0",
        id: callId++,
        method: "evm_setNextBlockTimestamp",
        params: ["0x" + BigInt(step.value).toString(16)],
      })
    }
  }

  // 3b: Get pre-attack balance
  const preBalanceId = callId++
  batchCalls.push({
    jsonrpc: "2.0",
    id: preBalanceId,
    method: "eth_getBalance",
    params: [pocJson.target.contract, "latest"],
  })

  // 3c: Execute attack transactions
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
        value: tx.value && tx.value !== "0" ? "0x" + BigInt(tx.value).toString(16) : "0x0",
        gas: "0x7A1200",
      }],
    })
  }

  // 3d: Get post-attack balance
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
    body: new TextEncoder().encode(JSON.stringify(batchCalls)),
  }).result()

  if (batchResp.statusCode !== 200) {
    nodeRuntime.log(`Tenderly batch RPC failed: status ${batchResp.statusCode}`)
    return { isValid: false, severity: 0n, suggestedPayout: 0n }
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

  // ═══ HTTP 4: LLM Analysis ═══
  const llmApiKey = nodeRuntime.getSecret({ id: "LLM_API_KEY" }).result()

  const prompt = [
    "Analyze this smart contract exploit simulation result.",
    `Target contract: ${pocJson.target.contract} on chain ${pocJson.target.chain}`,
    `Fork block: ${pocJson.target.forkBlock}`,
    `Attack transactions: ${pocJson.transactions.length}`,
    `All transactions succeeded: ${allTxSucceeded}`,
    `Target balance before: ${balanceBefore.toString()} wei`,
    `Target balance after: ${balanceAfter.toString()} wei`,
    `Balance drained: ${balanceDiff.toString()} wei`,
    `Expected impact: ${JSON.stringify(pocJson.expectedImpact)}`,
    "",
    "Determine:",
    "1) Is this a valid vulnerability exploit? (the attack must succeed AND cause measurable impact)",
    "2) Severity score 0-100",
    "3) Suggested bounty payout in wei (proportional to impact)",
    "",
    'Respond ONLY in JSON: {"valid":true/false,"severity":0-100,"payout":"wei_string","summary":"one line"}',
  ].join("\n")

  const llmResp = httpClient.sendRequest(nodeRuntime, {
    url: config.llmApiUrl,
    method: "POST" as const,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${llmApiKey}`,
    },
    body: new TextEncoder().encode(JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0,
      max_tokens: 300,
    })),
    cacheSettings: { maxAge: "0s" },
  }).result()

  let llmValid = false
  let llmSeverity = 0n
  let llmPayout = 0n
  let llmSummary = "LLM analysis unavailable"

  if (llmResp.statusCode === 200) {
    try {
      const llmData = JSON.parse(new TextDecoder().decode(llmResp.body))
      const analysis = JSON.parse(llmData.choices[0].message.content)
      llmValid = analysis.valid === true
      llmSeverity = BigInt(analysis.severity || 0)
      llmPayout = BigInt(analysis.payout || "0")
      llmSummary = analysis.summary || "No summary"
      nodeRuntime.log(`LLM verdict: valid=${llmValid}, severity=${llmSeverity}, summary="${llmSummary}"`)
    } catch (e) {
      nodeRuntime.log(`LLM response parse error: ${String(e)}`)
    }
  } else {
    nodeRuntime.log(`LLM API failed: status ${llmResp.statusCode}`)
  }

  // ═══ Dual Validation: Execution AND LLM must agree ═══
  const executionValid = allTxSucceeded && balanceDiff > 0n
  const isValid = executionValid && llmValid

  nodeRuntime.log(`Final verdict: execution=${executionValid}, llm=${llmValid}, combined=${isValid}`)

  return {
    isValid,
    severity: llmSeverity,
    suggestedPayout: isValid ? llmPayout : 0n,
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
