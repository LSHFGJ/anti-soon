type ReadProjectContract = (projectId: bigint) => Promise<readonly unknown[]>

interface ResolveProjectPublicKeyArgs {
  projectId: bigint
  apiBaseUrl?: string
  fetchImpl?: typeof fetch
  readProjectContract: ReadProjectContract
}

function isHexString(value: unknown): value is `0x${string}` {
  return typeof value === 'string' && value.startsWith('0x')
}

export function extractProjectPublicKey(projectTuple: readonly unknown[]): `0x${string}` | null {
  const candidate = projectTuple[11]
  if (!isHexString(candidate) || candidate.length <= 2) {
    return null
  }
  return candidate
}

export async function resolveProjectPublicKey({
  projectId,
  apiBaseUrl,
  fetchImpl = fetch,
  readProjectContract,
}: ResolveProjectPublicKeyArgs): Promise<`0x${string}`> {
  const trimmedBaseUrl = apiBaseUrl?.trim() ?? ''
  const endpoint = `${trimmedBaseUrl}/api/project/${projectId}/public-key`

  let apiErrorMessage = ''

  try {
    const response = await fetchImpl(endpoint)
    if (response.ok) {
      const data = await response.json() as { publicKey?: string }
      if (isHexString(data.publicKey) && data.publicKey.length > 2) {
        return data.publicKey
      }
    } else {
      apiErrorMessage = `API request failed with status ${response.status}`
    }
  } catch (error) {
    apiErrorMessage = error instanceof Error ? error.message : 'unknown API error'
  }

  try {
    const projectTuple = await readProjectContract(projectId)
    const fallbackKey = extractProjectPublicKey(projectTuple)
    if (fallbackKey) {
      return fallbackKey
    }
  } catch (error) {
    const contractError = error instanceof Error ? error.message : 'unknown on-chain read error'
    const apiContext = apiErrorMessage ? ` API: ${apiErrorMessage}.` : ''
    throw new Error(`Failed to load project public key.${apiContext} On-chain: ${contractError}.`)
  }

  const apiContext = apiErrorMessage ? ` API: ${apiErrorMessage}.` : ''
  throw new Error(`Failed to load project public key.${apiContext} On-chain key is unavailable.`)
}
