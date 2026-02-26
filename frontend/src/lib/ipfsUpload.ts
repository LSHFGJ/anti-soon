import { keccak256, toBytes } from 'viem'
import {
  computeOasisEnvelopeHash,
  createOasisEnvelope,
  createOasisWriteCall,
  type OasisPointer,
} from './oasisStorage'

interface UploadEncryptedPoCArgs {
  ciphertext: `0x${string}`
  iv: `0x${string}`
  projectId?: bigint
  auditor?: `0x${string}`
  apiBaseUrl?: string
  fetchImpl?: typeof fetch
}

interface UploadResponse {
  uri?: string
  pointer?: OasisPointer
}

const ENV =
  (import.meta as ImportMeta & { env?: Record<string, string | undefined> })
    .env ?? {}

function normalizePointer(pointer: OasisPointer): OasisPointer {
  return {
    chain: pointer.chain,
    contract: pointer.contract.toLowerCase(),
    slotId: pointer.slotId,
  }
}

function buildFallbackPointer(args: UploadEncryptedPoCArgs): OasisPointer {
  const chain = ENV.VITE_OASIS_CHAIN?.trim() || 'oasis-sapphire-testnet'
  const contract =
    (ENV.VITE_OASIS_STORAGE_CONTRACT?.trim() as `0x${string}` | undefined) ||
    '0x0000000000000000000000000000000000000000'

  const seed = [
    args.projectId?.toString() ?? '0',
    args.auditor?.toLowerCase() ?? '0x0000000000000000000000000000000000000000',
    args.ciphertext,
    args.iv,
  ].join(':')

  const slotId = `slot-${keccak256(toBytes(seed)).slice(2, 18)}`
  return normalizePointer({ chain, contract, slotId })
}

function toOasisUri(payload: UploadResponse): string | null {
  if (typeof payload.uri === 'string' && payload.uri.startsWith('oasis://')) {
    return payload.uri
  }

  if (
    payload.pointer &&
    typeof payload.pointer.chain === 'string' &&
    typeof payload.pointer.contract === 'string' &&
    typeof payload.pointer.slotId === 'string'
  ) {
    const pointer = normalizePointer(payload.pointer)
    return `oasis://${pointer.chain}/${pointer.contract}/${encodeURIComponent(pointer.slotId)}`
  }

  return null
}

export async function uploadEncryptedPoC({
  ciphertext,
  iv,
  projectId,
  auditor,
  apiBaseUrl,
  fetchImpl = fetch,
}: UploadEncryptedPoCArgs): Promise<string> {
  const trimmedBaseUrl = apiBaseUrl?.trim() ?? ''
  const endpoint = `${trimmedBaseUrl}/api/oasis/write`
  const pointer = buildFallbackPointer({ ciphertext, iv, projectId, auditor })

  const writeCall = createOasisWriteCall({ pointer, ciphertext, iv })
  const envelope = createOasisEnvelope({
    pointer,
    ciphertext: {
      ciphertextHash: keccak256(toBytes(ciphertext)),
      ivHash: keccak256(toBytes(iv)),
    },
  })
  const envelopeHash = computeOasisEnvelopeHash(envelope)

  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      call: writeCall,
      envelope,
      envelopeHash,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    const suffix = errorText ? `: ${errorText}` : ''
    throw new Error(`Oasis write API failed with status ${response.status}${suffix}`)
  }

  const payload = (await response.json()) as UploadResponse
  const uri = toOasisUri(payload)

  if (!uri) {
    return `oasis://${pointer.chain}/${pointer.contract}/${encodeURIComponent(pointer.slotId)}#${envelopeHash}`
  }

  return uri.includes('#') ? uri : `${uri}#${envelopeHash}`
}
