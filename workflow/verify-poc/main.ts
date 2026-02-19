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
  decodeAbiParameters,
} from "viem"
import { z } from "zod"
import { gcm } from "@noble/ciphers/aes.js"

// ═══════════════════ Config ═══════════════════

const configSchema = z.object({
  chainSelectorName: z.string(),
  bountyHubAddress: z.string(),
  gasLimit: z.string(),
  tenderlyAccountSlug: z.string(),
  tenderlyProjectSlug: z.string(),
  llmApiUrl: z.string(),
  llmModel: z.string(),
  ipfsGateway: z.string(),
  skipLlm: z.boolean().optional().default(false),
  mainnetRpcUrl: z.string().optional(),
  skipStateVerification: z.boolean().optional().default(true),
  owner: z.string(), // DON owner address for vaultDonSecrets
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

// ═══════════════════ AES-GCM Decryption Helpers ═══════════════════

/**
 * Convert hex string to Uint8Array
 */
function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex
  const bytes = new Uint8Array(clean.length / 2)
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.slice(i, i + 2), 16)
  }
  return bytes
}

/**
 * AES-256-GCM decryption using pure JS implementation from @noble/ciphers.
 * Compatible with CRE WASM runtime (no Web Crypto API needed).
 *
 * @param ciphertext - Ciphertext with auth tag appended (as hex string)
 * @param iv - 12-byte initialization vector as hex string
 * @param key - 32-byte AES key as hex string
 * @returns Decrypted plaintext string
 */
function aesGcmDecrypt(
  ciphertext: string,
  iv: string,
  key: string
): string {
  const keyBytes = hexToBytes(key)
  const ivBytes = hexToBytes(iv)
  const ciphertextBytes = hexToBytes(ciphertext)

  // @noble/ciphers GCM: ciphertext includes the 16-byte auth tag at the end
  const decrypted = gcm(keyBytes, ivBytes).decrypt(ciphertextBytes)

  return new TextDecoder().decode(decrypted)
}

/**
 * Parse encrypted PoC data from IPFS.
 * Frontend format: { ciphertext: hex, iv: hex }
 */
type EncryptedPoC = {
  ciphertext: string
  iv: string
}

function parseEncryptedPoC(rawData: string): EncryptedPoC {
  try {
    const parsed = JSON.parse(rawData)
    if (typeof parsed.ciphertext === "string" && typeof parsed.iv === "string") {
      return parsed
    }
    throw new Error("Invalid encrypted PoC format: missing ciphertext or iv")
  } catch (e) {
    throw new Error(`Failed to parse encrypted PoC: ${e}`)
  }
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

// ═══════════════════ Fork State Verification ═══════════════════

/**
 * Verifies Tenderly fork state matches mainnet by comparing block hashes.
 * Returns true if verification passes or is skipped.
 * This prevents Tenderly admin tampering with fork state.
 */
function verifyForkState(
  nodeRuntime: NodeRuntime<Config>,
  forkBlock: bigint,
  tenderlyAdminRpc: string,
  mainnetRpcUrl: string | undefined,
  skipMainnetCheck: boolean
): { verified: boolean; forkBlockHash: string; mainnetBlockHash?: string } {
  const httpClient = new HTTPClient()

  // ═══ Get fork block hash from Tenderly ═══
  const forkBlockResp = httpClient.sendRequest(nodeRuntime, {
    url: tenderlyAdminRpc,
    method: "POST" as const,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
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

  // ═══ Optionally verify against mainnet ═══
  if (skipMainnetCheck || !mainnetRpcUrl) {
    nodeRuntime.log(`Mainnet check skipped, fork hash: ${forkBlockHash}`)
    return { verified: true, forkBlockHash }
  }

  // HTTP 5: Query mainnet RPC
  const mainnetResp = httpClient.sendRequest(nodeRuntime, {
    url: mainnetRpcUrl,
    method: "POST" as const,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "eth_getBlockByNumber",
      params: [`0x${forkBlock.toString(16)}`, false],
      id: 9999,
    }),
    cacheSettings: { maxAge: "0s" },
  }).result()

  let mainnetBlockHash = ""
  if (mainnetResp.statusCode === 200) {
    try {
      const blockData = JSON.parse(new TextDecoder().decode(mainnetResp.body))
      mainnetBlockHash = blockData.result?.hash || ""
      nodeRuntime.log(`Mainnet block ${forkBlock} hash: ${mainnetBlockHash}`)
    } catch (e) {
      nodeRuntime.log(`Failed to parse mainnet block response: ${String(e)}`)
    }
  }

  const verified = forkBlockHash === mainnetBlockHash && forkBlockHash !== ""
  nodeRuntime.log(`State verification: ${verified ? "PASSED" : "FAILED"}`)

  return { verified, forkBlockHash, mainnetBlockHash }
}

const verifyPoC = (
  nodeRuntime: NodeRuntime<Config>,
  submissionId: bigint,
  pocHash: string,
  cipherURI: string,
  projectKey: string,
  rules: ProjectRules,
  tenderlyApiKey: string,
  llmApiKey: string
): VerificationResult => {
  const httpClient = new HTTPClient()
  const config = nodeRuntime.config

  // ═══ HTTP 1: Fetch encrypted PoC from IPFS or HTTP ═══
  let pocUrl: string
  if (cipherURI.startsWith("ipfs://")) {
    pocUrl = `${config.ipfsGateway}${cipherURI.replace("ipfs://", "")}`
  } else {
    pocUrl = cipherURI // Direct HTTP(S) URL
  }
  const cipherResp = httpClient.sendRequest(nodeRuntime, {
    url: pocUrl,
    method: "GET" as const,
  }).result()

  if (cipherResp.statusCode !== 200) {
    nodeRuntime.log(`Ciphertext fetch failed: status ${cipherResp.statusCode}`)
    return { isValid: false, drainAmountWei: 0n }
  }

  const ciphertextRaw = new TextDecoder().decode(cipherResp.body)

  // Decrypt using AES-GCM with project key (fetched from Vault DON in DON mode)
  let pocJson: PoCData
  try {
    const encryptedPoC = parseEncryptedPoC(ciphertextRaw)
    const plaintext = aesGcmDecrypt(encryptedPoC.ciphertext, encryptedPoC.iv, projectKey)
    pocJson = JSON.parse(plaintext)
  } catch (e) {
    nodeRuntime.log(`Decryption failed: ${String(e)}`)
    return { isValid: false, drainAmountWei: 0n }
  }

  nodeRuntime.log(`Decrypted PoC: ${pocJson.transactions.length} txs targeting ${pocJson.target.contract}`)
  nodeRuntime.log(`PoC ready: ${pocJson.transactions.length} txs targeting ${pocJson.target.contract}`)

  // Validate setup operations against rules
  const validation = validateSetupOps(pocJson.setup, rules)
  if (!validation.valid) {
    nodeRuntime.log(`POC rejected: ${validation.reason}`)
    return { isValid: false, drainAmountWei: 0n }
  }
  nodeRuntime.log(`Setup validation passed`)

  // ═══ HTTP 2: Create Tenderly Virtual TestNet ═══

  const confidentialHttpClient = new ConfidentialHTTPClient()

  const createVnetResp = confidentialHttpClient.sendRequest(nodeRuntime, {
    request: {
      url: `https://api.tenderly.co/api/v1/account/${config.tenderlyAccountSlug}/project/${config.tenderlyProjectSlug}/vnets`,
      method: "POST",
      multiHeaders: {
        "Content-Type": { values: ["application/json"] },
        "X-Access-Key": { values: ["{{.TENDERLY_API_KEY}}"] },
      },
      bodyString: JSON.stringify({
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
      }),
    },
    vaultDonSecrets: [
      { key: "TENDERLY_API_KEY", owner: config.owner },
      { key: "san_marino_aes_gcm_encryption_key" },
    ],
    encryptOutput: true,
  }).result()

  if (createVnetResp.statusCode !== 200 && createVnetResp.statusCode !== 201) {
    nodeRuntime.log(`Tenderly VNet creation failed: status ${createVnetResp.statusCode}`)
    return { isValid: false, drainAmountWei: 0n }
  }

  const vnetData = JSON.parse(new TextDecoder().decode(createVnetResp.body))
  const adminRpcUrl = vnetData.rpcs?.find((r: { name: string; url: string }) => r.name === "Admin RPC")?.url
    || vnetData.rpcs?.[0]?.url

  if (!adminRpcUrl) {
    nodeRuntime.log("Failed to get Admin RPC URL from Tenderly response")
    return { isValid: false, drainAmountWei: 0n }
  }

  nodeRuntime.log(`Tenderly VNet created: ${adminRpcUrl}`)

  // Fork state verification (optional HTTP 5)
  const forkBlock = BigInt(pocJson.target.forkBlock)
  const stateResult = verifyForkState(
    nodeRuntime,
    forkBlock,
    adminRpcUrl,
    config.mainnetRpcUrl,
    config.skipStateVerification ?? true
  )

  if (!stateResult.verified) {
    nodeRuntime.log(`State verification failed, but continuing...`)
  }

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
    body: JSON.stringify(batchCalls),
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

  // ═══ Calculate execution validity (needed before LLM section) ═══
  const executionValid = allTxSucceeded && balanceDiff > 0n

  // ═══ HTTP 4: LLM Analysis (OPTIONAL) ═══


  let llmValid = false
  let llmSeverity = 0n
  let llmPayout = 0n
  let llmSummary = "LLM analysis skipped"

  if (!nodeRuntime.config.skipLlm) {
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

    const llmResp = confidentialHttpClient.sendRequest(nodeRuntime, {
      request: {
        url: config.llmApiUrl,
        method: "POST",
        multiHeaders: {
          "Content-Type": { values: ["application/json"] },
          "Authorization": { values: ["Bearer {{.LLM_API_KEY}}"] },
        },
        bodyString: JSON.stringify({
          model: config.llmModel,
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" },
          temperature: 0,
          max_tokens: 300,
        }),
      },
      vaultDonSecrets: [
        { key: "LLM_API_KEY", owner: config.owner },
        { key: "san_marino_aes_gcm_encryption_key" },
      ],
      encryptOutput: true,
    }).result()

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
  } else {
    // When LLM is skipped, use execution result only
    llmValid = executionValid
    llmSummary = "Execution-only validation (LLM skipped)"
    nodeRuntime.log(`LLM skipped, using execution result: ${executionValid}`)
  }

  // ═══ Dual Validation: Execution AND LLM must agree ═══
  // When LLM is skipped, only use execution result
  const isValid = nodeRuntime.config.skipLlm
    ? executionValid
    : (executionValid && llmValid)

  nodeRuntime.log(`Final verdict: execution=${executionValid}, llm=${llmValid}, combined=${isValid}`)

  // Return drain amount - contract calculates severity from thresholds
  return {
    isValid,
    drainAmountWei: isValid ? balanceDiff : 0n,
  }
}

// ═══════════════════ Main Handler ═══════════════════

const onPoCRevealed = (runtime: Runtime<Config>, log: EVMLog): string => {
  const topic1 = bytesToHex(log.topics[1])
  const submissionId = BigInt(topic1.startsWith("0x") ? topic1 : "0x" + topic1)

  runtime.log(`PoC Revealed #${submissionId}`)

  const tenderlyApiKey = runtime.getSecret({ id: "TENDERLY_API_KEY" }).result().value
  const llmApiKey = runtime.getSecret({ id: "LLM_API_KEY" }).result().value

  const cipherURI = extractCipherURI(runtime, submissionId)
  const projectId = extractProjectId(runtime, submissionId)

  // Get project private key from Vault DON
  const projectKey = runtime.getSecret({ id: `PROJECT_KEY_${projectId}` }).result().value

  const defaultRules: ProjectRules = {
    maxAttackerSeedWei: 1000000000000000000000n, // 1000 ETH
    maxWarpSeconds: 365n * 24n * 60n * 60n, // 1 year
    allowImpersonation: true,
    thresholds: {
      criticalDrainWei: 1000000000000000000000n, // 1000 ETH
      highDrainWei: 100000000000000000000n, // 100 ETH
      mediumDrainWei: 10000000000000000000n, // 10 ETH
      lowDrainWei: 1000000000000000000n, // 1 ETH
    }
  }

  const pocHash = "0x" // TODO: Extract from event or fetch from contract

  const verifyResult = runtime
    .runInNodeMode(
      verifyPoC,
      consensusIdenticalAggregation<VerificationResult>()
    )(submissionId, pocHash, cipherURI, projectKey, defaultRules, tenderlyApiKey, llmApiKey)
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
    runtime.log(`Result written on-chain. tx=${txHash}`)
    return txHash
  }

  throw new Error(`EVM Write failed: ${writeResult.txStatus}`)
}

const extractCipherURI = (_runtime: Runtime<Config>, _submissionId: bigint): string => {
  return "ipfs://placeholder"
}

const extractProjectId = (_runtime: Runtime<Config>, _submissionId: bigint): bigint => {
  return 1n // TODO: Fetch from BountyHub contract using eth_call
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
    toBytes("PoCRevealed(uint256,bytes32)")
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
