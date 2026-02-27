import { encodeFunctionData, keccak256, parseAbi, toBytes } from 'viem'
import { wrapEthereumProvider } from '@oasisprotocol/sapphire-paratime'
import { normalizeEthereumAddress } from './address'
import { extractErrorMessage } from './errorMessage'
import {
  computeOasisEnvelopeHash,
  createOasisEnvelope,
  type OasisPointer,
} from './oasisStorage'
import {
  aesGcmEncrypt,
  exportPublicKey,
  generateAesKey,
} from '../utils/encryption'

interface UploadEncryptedPoCArgs {
  poc: string
  projectId: bigint
  auditor: `0x${string}`
  ethereumProvider?: unknown
}

interface UploadEncryptedPoCResult {
  cipherURI: string
  decryptionKey: `0x${string}`
  oasisTxHash: `0x${string}`
}

const ENV =
  (import.meta as ImportMeta & { env?: Record<string, string | undefined> })
    .env ?? {}

const SAPPHIRE_CHAIN_ID_HEX = '0x5aff'
const SEPOLIA_CHAIN_ID_HEX = '0xaa36a7'
const OASIS_TX_ENCRYPTION_ENABLED = ENV.VITE_OASIS_TX_ENCRYPTION !== 'false'
const OASIS_FALLBACK_DATA_SINK = '0x000000000000000000000000000000000000dEaD' as const

type RelayerUploadResponse = {
  cipherURI: string
  decryptionKey: `0x${string}`
  oasisTxHash: `0x${string}`
}

const OASIS_STORAGE_ABI = parseAbi([
  'function write(string slotId, string payload)',
])

type Eip1193Provider = {
  request: (args: { method: string; params?: object | readonly unknown[] }) => Promise<unknown>
}

function normalizePointer(pointer: OasisPointer): OasisPointer {
  return {
    chain: pointer.chain,
    contract: pointer.contract.toLowerCase(),
    slotId: pointer.slotId,
  }
}

function buildFallbackPointer(args: UploadEncryptedPoCArgs): OasisPointer {
  const chain = ENV.VITE_OASIS_CHAIN?.trim() || 'oasis-sapphire-testnet'
  const envStorageContract = ENV.VITE_OASIS_STORAGE_CONTRACT?.trim()
  const contract =
    normalizeEthereumAddress(envStorageContract) ||
    normalizeEthereumAddress(OASIS_FALLBACK_DATA_SINK) ||
    args.auditor

  const seed = [
    args.projectId.toString(),
    args.auditor.toLowerCase(),
    args.poc,
  ].join(':')

  const slotId = `slot-${keccak256(toBytes(seed)).slice(2, 18)}`
  return normalizePointer({ chain, contract, slotId })
}

function bytesToHex(bytes: Uint8Array): `0x${string}` {
  return `0x${Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')}`
}

function utf8ToHex(input: string): `0x${string}` {
  const encoded = new TextEncoder().encode(input)
  return bytesToHex(encoded)
}

function readProvider(provider?: unknown): Eip1193Provider {
  if (provider && typeof provider === 'object' && 'request' in provider) {
    return provider as Eip1193Provider
  }

  if (typeof window !== 'undefined') {
    const maybeProvider = (window as Window & { ethereum?: unknown }).ethereum
    if (maybeProvider && typeof maybeProvider === 'object' && 'request' in maybeProvider) {
      return maybeProvider as Eip1193Provider
    }
  }

  throw new Error('No EIP-1193 provider available for Sapphire submission')
}

function getOasisUploadApiUrl(): string | undefined {
  const globalRuntimeUrl = (
    globalThis as { __ANTI_SOON_OASIS_UPLOAD_API_URL__?: string }
  ).__ANTI_SOON_OASIS_UPLOAD_API_URL__
  if (typeof globalRuntimeUrl === 'string' && globalRuntimeUrl.trim().length > 0) {
    return globalRuntimeUrl.trim()
  }

  const runtimeEnv =
    (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env ?? ENV
  const raw = runtimeEnv.VITE_OASIS_UPLOAD_API_URL?.trim()
  return raw && raw.length > 0 ? raw : undefined
}

function isBytes32Hex(value: string): value is `0x${string}` {
  return /^0x[0-9a-fA-F]{64}$/.test(value)
}

async function uploadViaRelayerApi(args: {
  apiUrl: string
  poc: string
  projectId: bigint
  auditor: `0x${string}`
}): Promise<UploadEncryptedPoCResult> {
  const response = await fetch(args.apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      poc: args.poc,
      projectId: args.projectId.toString(),
      auditor: args.auditor,
    }),
  })

  if (!response.ok) {
    const message = await response.text()
    throw new Error(
      `Oasis relayer upload failed (${response.status}): ${message || 'empty response'}`,
    )
  }

  const payload = (await response.json()) as Partial<RelayerUploadResponse>

  if (
    !payload ||
    typeof payload.cipherURI !== 'string' ||
    !payload.cipherURI.startsWith('oasis://') ||
    typeof payload.decryptionKey !== 'string' ||
    !isBytes32Hex(payload.decryptionKey) ||
    typeof payload.oasisTxHash !== 'string' ||
    !isBytes32Hex(payload.oasisTxHash)
  ) {
    throw new Error('Oasis relayer response shape is invalid')
  }

  return {
    cipherURI: payload.cipherURI,
    decryptionKey: payload.decryptionKey,
    oasisTxHash: payload.oasisTxHash,
  }
}

async function resolveProviderAddress(
  provider: Eip1193Provider,
  fallback: `0x${string}`,
): Promise<`0x${string}`> {
  for (const method of ['eth_accounts', 'eth_requestAccounts'] as const) {
    try {
      const accounts = (await provider.request({ method })) as unknown
      if (!Array.isArray(accounts)) continue

      for (const account of accounts) {
        const normalized = normalizeEthereumAddress(account)
        if (normalized) return normalized
      }
    } catch {
    }
  }

  return fallback
}

async function ensureChain(provider: Eip1193Provider, chainIdHex: string): Promise<void> {
  const currentChainId = (await provider.request({ method: 'eth_chainId' })) as string
  if (typeof currentChainId === 'string' && currentChainId.toLowerCase() === chainIdHex) {
    return
  }

  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: chainIdHex }],
    })
  } catch (switchError) {
    const err = switchError as { code?: number }
    if (err.code !== 4902 || chainIdHex !== SAPPHIRE_CHAIN_ID_HEX) {
      throw switchError
    }

    await provider.request({
      method: 'wallet_addEthereumChain',
      params: [
        {
          chainId: SAPPHIRE_CHAIN_ID_HEX,
          chainName: 'Oasis Sapphire Testnet',
          nativeCurrency: {
            name: 'TEST',
            symbol: 'TEST',
            decimals: 18,
          },
          rpcUrls: ['https://testnet.sapphire.oasis.io'],
          blockExplorerUrls: ['https://explorer.oasis.io/testnet/sapphire'],
        },
      ],
    })

    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: chainIdHex }],
    })
  }
}

async function waitForReceipt(provider: Eip1193Provider, txHash: `0x${string}`): Promise<void> {
  const startedAt = Date.now()
  while (Date.now() - startedAt < 90_000) {
    const receipt = (await provider.request({
      method: 'eth_getTransactionReceipt',
      params: [txHash],
    })) as { status?: string } | null

    if (receipt && typeof receipt.status === 'string') {
      if (receipt.status === '0x1') return
      throw new Error(`Sapphire write transaction failed with status ${receipt.status}`)
    }

    await new Promise((resolve) => setTimeout(resolve, 1_000))
  }

  throw new Error('Timed out waiting for Sapphire write transaction receipt')
}

export async function uploadEncryptedPoC({
  poc,
  projectId,
  auditor,
  ethereumProvider,
}: UploadEncryptedPoCArgs): Promise<UploadEncryptedPoCResult> {
  let parsedPoC: unknown
  try {
    parsedPoC = JSON.parse(poc)
  } catch {
    throw new Error('PoC JSON must be valid JSON object')
  }

  if (typeof parsedPoC !== 'object' || parsedPoC === null || Array.isArray(parsedPoC)) {
    throw new Error('PoC JSON must be valid JSON object')
  }

  const normalizedAuditor = normalizeEthereumAddress(auditor)
  if (!normalizedAuditor) {
    throw new Error('Connected wallet address is invalid. Reconnect wallet and retry.')
  }

  const relayerApiUrl = getOasisUploadApiUrl()
  if (relayerApiUrl) {
    return uploadViaRelayerApi({
      apiUrl: relayerApiUrl,
      poc,
      projectId,
      auditor: normalizedAuditor,
    })
  }

  const provider = readProvider(ethereumProvider)
  const configuredStorageContract = ENV.VITE_OASIS_STORAGE_CONTRACT?.trim()
  const storageContract = normalizeEthereumAddress(configuredStorageContract)

  if (configuredStorageContract && !storageContract) {
    console.warn('Ignoring invalid VITE_OASIS_STORAGE_CONTRACT. Falling back to auditor address.')
  }

  const sapphireProvider = OASIS_TX_ENCRYPTION_ENABLED
    ? (wrapEthereumProvider(provider) as unknown as Eip1193Provider)
    : provider

  await ensureChain(sapphireProvider, SAPPHIRE_CHAIN_ID_HEX)

  const providerAddress = await resolveProviderAddress(
    sapphireProvider,
    normalizedAuditor,
  )
  const pointer = buildFallbackPointer({
    poc,
    projectId,
    auditor: providerAddress,
  })

  const encryptionKey = await generateAesKey()
  const keyBytes = await exportPublicKey(encryptionKey)
  if (keyBytes.length !== 32) {
    throw new Error('Expected 32-byte AES key for reveal decryption')
  }

  const encrypted = await aesGcmEncrypt(JSON.stringify(parsedPoC), keyBytes)
  const ciphertextHex = bytesToHex(encrypted.ciphertext)
  const ivHex = bytesToHex(encrypted.iv)

  const ciphertextHash = keccak256(toBytes(ciphertextHex))
  const ivHash = keccak256(toBytes(ivHex))

  const envelope = createOasisEnvelope({
    pointer,
    ciphertext: {
      ciphertextHash,
      ivHash,
    },
  })
  const envelopeHash = computeOasisEnvelopeHash(envelope)

  const payload = {
    ok: true,
    version: 'anti-soon.oasis-tx.v2',
    projectId: projectId.toString(),
    auditor: providerAddress.toLowerCase(),
    pointer,
    envelope,
    envelopeHash,
    encryptedPoc: {
      algorithm: 'aes-256-gcm',
      ciphertextHex,
      ivHex,
    },
  }

  const fallbackTarget = normalizeEthereumAddress(OASIS_FALLBACK_DATA_SINK)
  if (!fallbackTarget) {
    throw new Error('Invalid default Oasis fallback sink address')
  }

  const writeTarget = storageContract || fallbackTarget
  const uriContract = writeTarget.toLowerCase()
  const payloadJson = JSON.stringify(payload)

  const txData = storageContract
    ? encodeFunctionData({
      abi: OASIS_STORAGE_ABI,
      functionName: 'write',
      args: [pointer.slotId, payloadJson],
    })
    : utf8ToHex(payloadJson)

  let txHash: `0x${string}`
  try {
    const txRequest: Record<string, unknown> = {
      from: providerAddress,
      to: writeTarget,
      value: '0x0',
      data: txData,
    }

    txHash = (await sapphireProvider.request({
      method: 'eth_sendTransaction',
      params: [txRequest],
    })) as `0x${string}`
  } catch (err) {
    const message = extractErrorMessage(err)
    if (message.includes('must provide an Ethereum address')) {
      throw new Error(
        `Invalid parameters: must provide an Ethereum address (from=${providerAddress}, to=${writeTarget}, storageContract=${storageContract ?? 'none'}).`,
      )
    }
    throw err
  }

  await waitForReceipt(sapphireProvider, txHash)
  await ensureChain(sapphireProvider, SEPOLIA_CHAIN_ID_HEX)

  return {
    cipherURI: `oasis://${pointer.chain}/${uriContract}/${encodeURIComponent(pointer.slotId)}#${txHash}`,
    decryptionKey: bytesToHex(keyBytes),
    oasisTxHash: txHash,
  }
}
