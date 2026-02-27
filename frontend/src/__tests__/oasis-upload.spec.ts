import { describe, expect, it, vi } from 'vitest'

vi.mock('@oasisprotocol/sapphire-paratime', () => ({
  wrapEthereumProvider: (provider: unknown) => provider,
}))

import { uploadEncryptedPoC } from '../lib/oasisUpload'

const OASIS_FALLBACK_DATA_SINK = '0x000000000000000000000000000000000000dEaD'

type ProviderRequest = {
  method: string
  params?: unknown[]
}

function createMockProvider(txHash: `0x${string}`, account = '0x1111111111111111111111111111111111111111') {
  const calls: ProviderRequest[] = []
  const provider = {
    request: vi.fn(async ({ method, params }: ProviderRequest) => {
      calls.push({ method, params })
      if (method === 'eth_chainId') return '0x5aff'
      if (method === 'eth_accounts') return [account]
      if (method === 'eth_requestAccounts') return [account]
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
  it('uses relayer API when VITE_OASIS_UPLOAD_API_URL is configured', async () => {
    const previousFetch = globalThis.fetch
    const previousRuntimeUrl = (
      globalThis as { __ANTI_SOON_OASIS_UPLOAD_API_URL__?: string }
    ).__ANTI_SOON_OASIS_UPLOAD_API_URL__
    ;(globalThis as { __ANTI_SOON_OASIS_UPLOAD_API_URL__?: string }).__ANTI_SOON_OASIS_UPLOAD_API_URL__ =
      'https://relay.example/upload'

    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        cipherURI: 'oasis://oasis-sapphire-testnet/0x000000000000000000000000000000000000dead/slot-1#0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        decryptionKey: `0x${'1'.repeat(64)}`,
        oasisTxHash: `0x${'a'.repeat(64)}`,
      }),
      text: async () => '',
    }))

    vi.stubGlobal('fetch', fetchMock)

    try {
      const result = await uploadEncryptedPoC({
        poc: '{"target":"dummy"}',
        projectId: 7n,
        auditor: '0x2222222222222222222222222222222222222222',
        ethereumProvider: {
          request: vi.fn(async () => {
            throw new Error('provider should not be called when relayer API is configured')
          }),
        } as unknown,
      })

      expect(fetchMock).toHaveBeenCalledWith(
        'https://relay.example/upload',
        expect.objectContaining({ method: 'POST' }),
      )
      expect(result.cipherURI).toContain('oasis://')
    } finally {
      ;(globalThis as { __ANTI_SOON_OASIS_UPLOAD_API_URL__?: string }).__ANTI_SOON_OASIS_UPLOAD_API_URL__ =
        previousRuntimeUrl
      if (previousFetch) {
        globalThis.fetch = previousFetch
      } else {
        delete (globalThis as { fetch?: typeof fetch }).fetch
      }
    }
  })

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

  it('uses dedicated fallback sink target when storage contract is unset', async () => {
    const txHash = `0x${'c'.repeat(64)}` as const
    const providerAccount = '0x3333333333333333333333333333333333333333'
    const { provider, calls } = createMockProvider(txHash, providerAccount)

    await uploadEncryptedPoC({
      poc: '{"target":"dummy"}',
      projectId: 9n,
      auditor: '0x2222222222222222222222222222222222222222',
      ethereumProvider: provider as unknown,
    })

    const sendTxCall = calls.find((entry) => entry.method === 'eth_sendTransaction')
    const tx = (sendTxCall?.params?.[0] ?? {}) as {
      from?: string
      to?: string
      data?: string
    }

    expect(tx.from).toBe(providerAccount)
    expect(tx.to).toBe(OASIS_FALLBACK_DATA_SINK)
    expect(typeof tx.data).toBe('string')
  })
})
