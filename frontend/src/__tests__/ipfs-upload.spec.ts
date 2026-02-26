import { describe, expect, it, vi } from 'vitest'
import { uploadEncryptedPoC } from '../lib/ipfsUpload'

type ProviderRequest = {
  method: string
  params?: unknown[]
}

function createMockProvider(txHash: `0x${string}`) {
  const calls: ProviderRequest[] = []
  const provider = {
    request: vi.fn(async ({ method, params }: ProviderRequest) => {
      calls.push({ method, params })
      if (method === 'eth_chainId') return '0x5aff'
      if (method === 'eth_sendTransaction') return txHash
      if (method === 'eth_getTransactionReceipt') {
        return {
          status: '0x1',
          transactionHash: txHash,
        }
      }
      if (method === 'wallet_switchEthereumChain') return null
      if (method === 'wallet_addEthereumChain') return null
      throw new Error(`Unexpected method: ${method}`)
    }),
  }

  return { provider, calls }
}

function decodeTxData(data: string): string {
  const hex = data.startsWith('0x') ? data.slice(2) : data
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = Number.parseInt(hex.slice(i, i + 2), 16)
  }
  return new TextDecoder().decode(bytes)
}

describe('oasis upload helper', () => {
  it('encrypts poc payload before sapphire tx submission', async () => {
    const txHash = `0x${'a'.repeat(64)}` as const
    const { provider, calls } = createMockProvider(txHash)

    const result = await uploadEncryptedPoC({
      poc: '{"target":"dummy","secret":"super-sensitive-poc"}',
      projectId: 7n,
      auditor: '0x2222222222222222222222222222222222222222',
      ethereumProvider: provider as unknown,
    })

    const sendTxCall = calls.find((entry) => entry.method === 'eth_sendTransaction')
    const tx = (sendTxCall?.params?.[0] ?? {}) as { data?: string }
    const rawInput = decodeTxData(tx.data ?? '0x')

    expect(rawInput.includes('super-sensitive-poc')).toBe(false)
    expect(rawInput.includes('encryptedPoc')).toBe(true)
    expect(result.cipherURI).toContain(`#${txHash}`)
    expect(result.decryptionKey.length).toBe(66)
  })

  it('throws when poc json is invalid', async () => {
    const { provider } = createMockProvider(`0x${'b'.repeat(64)}` as const)

    await expect(uploadEncryptedPoC({
      poc: '{invalid',
      projectId: 1n,
      auditor: '0x1111111111111111111111111111111111111111',
      ethereumProvider: provider as unknown,
    })).rejects.toThrow('PoC JSON must be valid JSON object')
  })
})
