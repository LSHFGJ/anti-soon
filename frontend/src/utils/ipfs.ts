/**
 * IPFS utility functions for storing and retrieving contract metadata
 * Uses Pinata API for uploads and IPFS gateway for reads
 */

const PINATA_API_URL = 'https://api.pinata.cloud/pinning/pinJSONToIPFS'
const IPFS_GATEWAY = 'https://gateway.pinata.cloud/ipfs/'

interface PinataResponse {
  IpfsHash: string
  PinSize: number
  Timestamp: string
}

/**
 * Upload JSON metadata to IPFS via Pinata
 * @param metadata - Object to upload
 * @returns IPFS CID (content identifier)
 */
export async function uploadToIPFS(metadata: object): Promise<string> {
  const apiKey = import.meta.env.VITE_PINATA_API_KEY
  const apiSecret = import.meta.env.VITE_PINATA_API_SECRET
  
  if (!apiKey || !apiSecret) {
    throw new Error('Pinata API credentials not configured')
  }

  const response = await fetch(PINATA_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'pinata_api_key': apiKey,
      'pinata_secret_api_key': apiSecret,
    },
    body: JSON.stringify(metadata),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`IPFS upload failed: ${error}`)
  }

  const data: PinataResponse = await response.json()
  return data.IpfsHash
}

/**
 * Fetch JSON metadata from IPFS
 * @param cid - IPFS content identifier
 * @returns Parsed JSON object
 */
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

/**
 * Get IPFS gateway URL for a CID
 * @param cid - IPFS content identifier
 * @returns Full gateway URL
 */
export function getIPFSUrl(cid: string): string {
  return `${IPFS_GATEWAY}${cid}`
}
