import { keccak256, toBytes } from 'viem'
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

type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
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
  const contract =
    (ENV.VITE_OASIS_STORAGE_CONTRACT?.trim() as `0x${string}` | undefined) ||
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

  const provider = readProvider(ethereumProvider)
  const pointer = buildFallbackPointer({ poc, projectId, auditor })

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
    auditor: auditor.toLowerCase(),
    pointer,
    envelope,
    envelopeHash,
    encryptedPoc: {
      algorithm: 'aes-256-gcm',
      ciphertextHex,
      ivHex,
    },
  }

  const to =
    (ENV.VITE_OASIS_STORAGE_CONTRACT?.trim() as `0x${string}` | undefined) ||
    auditor

  await ensureChain(provider, SAPPHIRE_CHAIN_ID_HEX)

  const txHash = (await provider.request({
    method: 'eth_sendTransaction',
    params: [
      {
        from: auditor,
        to,
        value: '0x0',
        data: utf8ToHex(JSON.stringify(payload)),
      },
    ],
  })) as `0x${string}`

  await waitForReceipt(provider, txHash)
  await ensureChain(provider, SEPOLIA_CHAIN_ID_HEX)

  return {
    cipherURI: `oasis://${pointer.chain}/${to.toLowerCase()}/${encodeURIComponent(pointer.slotId)}#${txHash}`,
    decryptionKey: bytesToHex(keyBytes),
    oasisTxHash: txHash,
  }
}
