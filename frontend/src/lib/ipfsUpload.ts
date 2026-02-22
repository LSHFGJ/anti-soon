interface UploadEncryptedPoCArgs {
  ciphertext: `0x${string}`
  iv: `0x${string}`
  apiBaseUrl?: string
  fetchImpl?: typeof fetch
}

interface UploadResponse {
  cid?: string
  uri?: string
}

function toIpfsUri(payload: UploadResponse): string | null {
  if (typeof payload.uri === 'string' && payload.uri.startsWith('ipfs://')) {
    return payload.uri
  }

  if (typeof payload.cid === 'string' && payload.cid.length > 0) {
    return `ipfs://${payload.cid}`
  }

  return null
}

export async function uploadEncryptedPoC({
  ciphertext,
  iv,
  apiBaseUrl,
  fetchImpl = fetch,
}: UploadEncryptedPoCArgs): Promise<string> {
  const trimmedBaseUrl = apiBaseUrl?.trim() ?? ''
  const endpoint = `${trimmedBaseUrl}/api/ipfs/upload`

  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({ ciphertext, iv }),
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    const suffix = errorText ? `: ${errorText}` : ''
    throw new Error(`IPFS upload API failed with status ${response.status}${suffix}`)
  }

  const payload = await response.json() as UploadResponse
  const uri = toIpfsUri(payload)

  if (!uri) {
    throw new Error('IPFS upload API returned no cid or uri')
  }

  return uri
}
