import {
  HTTPClient,
  type NodeRuntime,
} from "@chainlink/cre-sdk"
import { z } from "zod"

// ═══════════════════ Config ═══════════════════

const configSchema = z.object({
  githubApiUrl: z.string().default("https://api.github.com"),
})

type Config = z.infer<typeof configSchema>

// ═══════════════════ Types ═══════════════════

export type ScanInput = {
  repoUrl: string      // e.g., "https://github.com/owner/repo"
  githubToken?: string // OAuth token for private repos
}

export type DeployScript = {
  name: string
  path: string
  contracts: string[]
}

export type ScanOutput = {
  scripts: DeployScript[]
  error?: string
}

type GitHubContent = {
  name: string
  path: string
  type: "file" | "dir"
  download_url: string | null
}

// ═══════════════════ Helper Functions ═══════════════════

/**
 * Parse GitHub URL to extract owner and repo
 */
function parseRepoUrl(repoUrl: string): { owner: string; repo: string } | null {
  const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/\?]+)/)
  if (!match) return null
  return { owner: match[1], repo: match[2].replace(/\.git$/, "") }
}

/**
 * Extract contract names from Foundry script content
 * Looks for patterns like: new ContractName(
 */
function extractContractNames(content: string): string[] {
  const contracts: string[] = []
  // Match "new ContractName(" pattern
  const regex = /new\s+([A-Z][a-zA-Z0-9_]*)\s*\(/g
  let match
  while ((match = regex.exec(content)) !== null) {
    if (!contracts.includes(match[1])) {
      contracts.push(match[1])
    }
  }
  return contracts
}

// ═══════════════════ Main Scan Function ═══════════════════

/**
 * Scan a GitHub repository for Foundry deployment scripts
 * This is the main function that will be called from CRE workflow
 */
export async function scanRepository(
  input: ScanInput,
  nodeRuntime: NodeRuntime<Config>
): Promise<ScanOutput> {
  const { repoUrl, githubToken } = input
  const config = nodeRuntime.config

  // Parse repo URL
  const parsed = parseRepoUrl(repoUrl)
  if (!parsed) {
    return {
      scripts: [],
      error: `Invalid GitHub URL: ${repoUrl}`,
    }
  }
  const { owner, repo } = parsed

  // Prepare headers
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "AntiSoon-CRE-Workflow/1.0",
  }
  if (githubToken) {
    headers["Authorization"] = `Bearer ${githubToken}`
  }

  const httpClient = new HTTPClient()

  try {
    // Step 1: List contents of script/ directory
    const scriptDirUrl = `${config.githubApiUrl}/repos/${owner}/${repo}/contents/script`
    
    nodeRuntime.log(`Scanning: ${scriptDirUrl}`)

    const dirResponse = httpClient.sendRequest(nodeRuntime, {
      method: "GET",
      url: scriptDirUrl,
      headers,
      cacheSettings: { maxAge: "0s" },
    }).result()

    if (dirResponse.statusCode !== 200) {
      return {
        scripts: [],
        error: `Failed to fetch script directory: ${dirResponse.statusCode}`,
      }
    }

    const bodyText = new TextDecoder().decode(dirResponse.body)
    const contents = JSON.parse(bodyText) as GitHubContent[]
    
    // Filter for .s.sol files
    const scriptFiles = contents.filter(
      (item) => item.type === "file" && item.name.endsWith(".s.sol")
    )

    nodeRuntime.log(`Found ${scriptFiles.length} script files`)

    // Step 2: Fetch each script file and extract contract names
    const scripts: DeployScript[] = []

    for (const file of scriptFiles) {
      if (!file.download_url) continue

      const fileResponse = httpClient.sendRequest(nodeRuntime, {
        method: "GET",
        url: file.download_url,
        headers: {},
        cacheSettings: { maxAge: "0s" },
      }).result()

      if (fileResponse.statusCode === 200) {
        const content = new TextDecoder().decode(fileResponse.body)
        const contracts = extractContractNames(content)

        scripts.push({
          name: file.name,
          path: file.path,
          contracts,
        })

        nodeRuntime.log(`Parsed ${file.name}: ${contracts.length} contracts`)
      }
    }

    return { scripts }

  } catch (error) {
    return {
      scripts: [],
      error: `Scan failed: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

// Export for external use
export { configSchema }
export type { Config }
