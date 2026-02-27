import {
  HTTPClient,
  ConfidentialHTTPClient,
  type NodeRuntime,
} from "@chainlink/cre-sdk"
import { z } from "zod"

// ═══════════════════ Config ═══════════════════

const configSchema = z.object({
  etherscanApiUrl: z.string().default("https://api-sepolia.etherscan.io/api"),
  metadataUploadApiUrl: z.string(),
  githubApiUrl: z.string().default("https://api.github.com"),
  owner: z.string(),
})

type Config = z.infer<typeof configSchema>

// ═══════════════════ Input/Output Types ═══════════════════

export type DeployInput = {
  repoUrl: string
  deployedContracts: {
    name: string
    address: string
    constructorArgs?: string
  }[]
  rpcUrl: string
  githubToken?: string
}

export type DeployOutput = {
  deployedContracts: {
    name: string
    address: string
  }[]
  metadataRefs?: {
    address: string
    contentId: string
  }[]
  verificationStatus?: {
    address: string
    verified: boolean
    explorerUrl?: string
  }[]
  error?: string
}

type GitHubContent = {
  name: string
  path: string
  download_url: string | null
}

type ContractSource = {
  name: string
  path: string
  content: string
}

// ═══════════════════ Helper Functions ═══════════════════

function parseRepoUrl(repoUrl: string): { owner: string; repo: string } | null {
  const match = repoUrl.match(/github\.com\/([^/]+)\/([^/?]+)/)
  if (!match) return null
  return { owner: match[1], repo: match[2].replace(/\.git$/, "") }
}

// ═══════════════════ GitHub Source Fetching ═══════════════════

function fetchContractSources(
  nodeRuntime: NodeRuntime<Config>,
  repoUrl: string,
  contractNames: string[],
  githubToken?: string
): ContractSource[] {
  const httpClient = new HTTPClient()
  const config = nodeRuntime.config
  const parsed = parseRepoUrl(repoUrl)
  if (!parsed) {
    nodeRuntime.log(`Invalid repo URL: ${repoUrl}`)
    return []
  }

  const headers: Record<string, string> = {
    "User-Agent": "AntiSoon-CRE-Workflow/1.0",
    "Accept": "application/vnd.github.v3+json",
  }
  if (githubToken) {
    headers.Authorization = `Bearer ${githubToken}`
  }

  const sources: ContractSource[] = []

  const srcDirUrl = `${config.githubApiUrl}/repos/${parsed.owner}/${parsed.repo}/contents/src`
  const dirResp = httpClient.sendRequest(nodeRuntime, {
    method: "GET",
    url: srcDirUrl,
    headers,
    cacheSettings: { maxAge: "0s" },
  }).result()

  if (dirResp.statusCode !== 200) {
    nodeRuntime.log(`Failed to list src/ directory: ${dirResp.statusCode}`)
    return sources
  }

  const files = JSON.parse(new TextDecoder().decode(dirResp.body)) as GitHubContent[]

  for (const contractName of contractNames) {
    const solFile = files.find(f => f.name === `${contractName}.sol`)
    if (!solFile?.download_url) {
      nodeRuntime.log(`Source not found for ${contractName}`)
      continue
    }

    const fileResp = httpClient.sendRequest(nodeRuntime, {
      method: "GET",
      url: solFile.download_url,
      headers: {},
      cacheSettings: { maxAge: "0s" },
    }).result()

    if (fileResp.statusCode === 200) {
      sources.push({
        name: contractName,
        path: solFile.path,
        content: new TextDecoder().decode(fileResp.body),
      })
      nodeRuntime.log(`Fetched source for ${contractName}`)
    }
  }

  return sources
}

// ═══════════════════ Etherscan Verification ═══════════════════

type VerificationResult = {
  address: string
  verified: boolean
  explorerUrl?: string
}

function verifyOnEtherscan(
  nodeRuntime: NodeRuntime<Config>,
  contractAddress: string,
  contractName: string,
  sourceCode: string,
  constructorArgs?: string
): VerificationResult {
  const confidentialHttpClient = new ConfidentialHTTPClient()
  const config = nodeRuntime.config

  const params = new URLSearchParams()
  params.set("module", "contract")
  params.set("action", "verifysourcecode")
  params.set("contractaddress", contractAddress)
  params.set("sourceCode", sourceCode)
  params.set("codeformat", "solidity-single-file")
  params.set("contractname", contractName)
  params.set("compilerversion", "v0.8.26+commit.8a97fa7a")
  params.set("optimizationUsed", "1")
  params.set("runs", "200")
  params.set("apikey", "{{.ETHERSCAN_API_KEY}}")
  if (constructorArgs) {
    params.set("constructorArguements", constructorArgs.replace("0x", ""))
  }

  const resp = confidentialHttpClient.sendRequest(nodeRuntime, {
    request: {
      url: config.etherscanApiUrl,
      method: "POST",
      multiHeaders: {
        "Content-Type": { values: ["application/x-www-form-urlencoded"] },
      },
      bodyString: params.toString(),
    },
    vaultDonSecrets: [
      { key: "ETHERSCAN_API_KEY", owner: config.owner },
      { key: "san_marino_aes_gcm_encryption_key" },
    ],
    encryptOutput: true,
  }).result()

  if (resp.statusCode !== 200) {
    nodeRuntime.log(`Etherscan API failed: ${resp.statusCode}`)
    return { address: contractAddress, verified: false }
  }

  try {
    const result = JSON.parse(new TextDecoder().decode(resp.body))
    if (result.status === "1") {
      nodeRuntime.log(`Etherscan verification submitted: GUID=${result.result}`)
      return {
        address: contractAddress,
        verified: true,
        explorerUrl: `https://sepolia.etherscan.io/address/${contractAddress}#code`,
      }
    }
    nodeRuntime.log(`Etherscan verification failed: ${result.result}`)
    return { address: contractAddress, verified: false }
  } catch (e) {
    nodeRuntime.log(`Failed to parse Etherscan response: ${String(e)}`)
    return { address: contractAddress, verified: false }
  }
}

type MetadataUploadResult = {
  address: string
  contentId: string
}

function extractContentId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null
  }

  const data = payload as Record<string, unknown>

  if (typeof data.contentId === "string" && data.contentId.length > 0) {
    return data.contentId
  }

  if (typeof data.cid === "string" && data.cid.length > 0) {
    return data.cid
  }

  if (typeof data.IpfsHash === "string" && data.IpfsHash.length > 0) {
    return data.IpfsHash
  }

  const uriCandidate =
    typeof data.contentUri === "string"
      ? data.contentUri
      : typeof data.uri === "string"
        ? data.uri
        : typeof data.ipfsUri === "string"
          ? data.ipfsUri
        : null

  if (typeof uriCandidate === "string" && uriCandidate.startsWith("ipfs://")) {
    const contentId = uriCandidate.slice("ipfs://".length).split(/[/?#]/)[0]
    return contentId?.length ? contentId : null
  }

  if (
    typeof uriCandidate === "string" &&
    (uriCandidate.startsWith("https://") || uriCandidate.startsWith("http://"))
  ) {
    try {
      const url = new URL(uriCandidate)
      const ipfsMatch = url.pathname.match(/\/ipfs\/([^/?#]+)/)
      if (ipfsMatch?.[1]) {
        return ipfsMatch[1]
      }

      const segments = url.pathname.split("/").filter(Boolean)
      const tail = segments[segments.length - 1]
      if (segments.length > 1 && tail && tail.length >= 8) {
        return tail
      }
    } catch {
      return null
    }
  }

  const gatewayCandidate =
    typeof data.gatewayUrl === "string"
      ? data.gatewayUrl
      : typeof data.url === "string"
        ? data.url
        : null

  if (typeof gatewayCandidate === "string") {
    const ipfsMatch = gatewayCandidate.match(/\/ipfs\/([^/?#]+)/)
    if (ipfsMatch?.[1]) {
      return ipfsMatch[1]
    }

    const segments = gatewayCandidate.split("/").filter(Boolean)
    const tail = segments[segments.length - 1]?.split(/[?#]/)[0]
    if (segments.length > 1 && tail && tail.length >= 8) {
      return tail
    }
  }

  return null
}

function uploadMetadata(
  nodeRuntime: NodeRuntime<Config>,
  contractAddress: string,
  contractName: string,
  sourceCode: string,
  repoUrl: string
): MetadataUploadResult | null {
  const confidentialHttpClient = new ConfidentialHTTPClient()
  const config = nodeRuntime.config

  const metadata = {
    name: contractName,
    address: contractAddress,
    source: sourceCode,
    repoUrl,
    timestamp: Date.now(),
    network: "sepolia",
  }

  const resp = confidentialHttpClient.sendRequest(nodeRuntime, {
    request: {
      url: config.metadataUploadApiUrl,
      method: "POST",
      multiHeaders: {
        "Content-Type": { values: ["application/json"] },
        "Authorization": { values: ["Bearer {{.METADATA_UPLOAD_TOKEN}}"] },
      },
      bodyString: JSON.stringify({
        payloadType: "contract-metadata",
        metadata,
      }),
    },
    vaultDonSecrets: [
      { key: "METADATA_UPLOAD_TOKEN", owner: config.owner },
      { key: "san_marino_aes_gcm_encryption_key" },
    ],
    encryptOutput: true,
  }).result()

  if (resp.statusCode !== 200 && resp.statusCode !== 201) {
    nodeRuntime.log(`Metadata upload failed: ${resp.statusCode}`)
    return null
  }

  try {
    const result = JSON.parse(new TextDecoder().decode(resp.body))
    const contentId = extractContentId(result)
    if (!contentId) {
      nodeRuntime.log(`Metadata upload response missing content id`)
      return null
    }

    nodeRuntime.log(`Metadata uploaded: contentId=${contentId}`)
    return {
      address: contractAddress,
      contentId,
    }
  } catch (e) {
    nodeRuntime.log(`Failed to parse metadata upload response: ${String(e)}`)
    return null
  }
}

// ═══════════════════ Main Workflow Function ═══════════════════

export function postDeployVerify(
  nodeRuntime: NodeRuntime<Config>,
  input: DeployInput
): DeployOutput {
  const { repoUrl, deployedContracts, githubToken } = input

  if (!deployedContracts || deployedContracts.length === 0) {
    return {
      deployedContracts: [],
      error: "No deployed contracts provided",
    }
  }

  nodeRuntime.log(`Post-deploy verification for ${deployedContracts.length} contracts from ${repoUrl}`)

  const contractNames = deployedContracts.map(c => c.name)
  const sources = fetchContractSources(nodeRuntime, repoUrl, contractNames, githubToken)

  const verificationResults: VerificationResult[] = []
  const metadataRefs: MetadataUploadResult[] = []

  for (const contract of deployedContracts) {
    const source = sources.find(s => s.name === contract.name)

    if (!source) {
      nodeRuntime.log(`Skipping ${contract.name}: source not found`)
      verificationResults.push({
        address: contract.address,
        verified: false,
      })
      continue
    }

    const verifyResult = verifyOnEtherscan(
      nodeRuntime,
      contract.address,
      contract.name,
      source.content,
      contract.constructorArgs
    )
    verificationResults.push(verifyResult)

    const metadataResult = uploadMetadata(
      nodeRuntime,
      contract.address,
      contract.name,
      source.content,
      repoUrl
    )
    if (metadataResult) {
      metadataRefs.push(metadataResult)
    }
  }

  return {
    deployedContracts: deployedContracts.map(c => ({
      name: c.name,
      address: c.address,
    })),
    verificationStatus: verificationResults.map(v => ({
      address: v.address,
      verified: v.verified,
      explorerUrl: v.explorerUrl,
    })),
    metadataRefs: metadataRefs.length > 0 ? metadataRefs : undefined,
  }
}

// ═══════════════════ Exports ═══════════════════

export { configSchema }
export type { Config }
