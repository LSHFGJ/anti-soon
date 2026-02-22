const ENV = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env ?? {}
const API_BASE_URL = ENV.VITE_API_URL?.trim() ?? ''
const IPFS_UPLOAD_ENDPOINT = `${API_BASE_URL}/api/ipfs/upload`
const IPFS_GATEWAY = ENV.VITE_IPFS_GATEWAY?.trim() || 'https://storacha.link/ipfs/'

interface UploadResponse {
  cid?: string
  uri?: string
}

export async function uploadToIPFS(metadata: object): Promise<string> {
  const response = await fetch(IPFS_UPLOAD_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({ metadata }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`IPFS upload failed: ${error}`)
  }

  const data: UploadResponse = await response.json()
  if (typeof data.cid === 'string' && data.cid.length > 0) {
    return data.cid
  }
  if (typeof data.uri === 'string' && data.uri.startsWith('ipfs://')) {
    return data.uri.replace('ipfs://', '')
  }

  throw new Error('IPFS upload response missing cid/uri')
}

export async function fetchFromIPFS<T = object>(cid: string): Promise<T> {
  const url = `${IPFS_GATEWAY}${cid}`
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`IPFS fetch failed: ${response.status}`)
  }

  return response.json()
}

export function getIPFSUrl(cid: string): string {
  return `${IPFS_GATEWAY}${cid}`
}
