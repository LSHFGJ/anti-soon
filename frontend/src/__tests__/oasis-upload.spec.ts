import { afterEach, describe, expect, it, vi } from 'vitest'
import { decodeFunctionData, encodeAbiParameters, parseAbi, parseAbiParameters } from 'viem'

vi.mock('@oasisprotocol/sapphire-paratime', () => ({
  wrapEthereumProvider: (provider: unknown) => provider,
}))

import { uploadEncryptedPoC } from '../lib/oasisUpload'

const OASIS_STORAGE_ABI = parseAbi([
  'function write(string slotId, string payload)',
  'function read(string slotId) view returns (string payload)',
])

type ProviderRequest = {
  method: string
  params?: unknown[]
}

function createMockProvider(
  txHash: `0x${string}`,
  account = '0x1111111111111111111111111111111111111111',
  options?: { readPayloadBySlot?: Record<string, string> },
) {
  const calls: ProviderRequest[] = []
  const slotPayloads = new Map<string, string>()

  if (options?.readPayloadBySlot) {
    for (const [slotId, payload] of Object.entries(options.readPayloadBySlot)) {
      slotPayloads.set(slotId, payload)
    }
  }

  const provider = {
    request: vi.fn(async ({ method, params }: ProviderRequest) => {
      calls.push({ method, params })
      if (method === 'eth_chainId') return '0x5aff'
      if (method === 'eth_accounts') return [account]
      if (method === 'eth_requestAccounts') return [account]
      if (method === 'eth_sendTransaction') {
        const txRequest = params?.[0] as { data?: `0x${string}` } | undefined
        if (txRequest?.data) {
          const decodedWrite = decodeFunctionData({
            abi: OASIS_STORAGE_ABI,
            data: txRequest.data,
          })

          if (decodedWrite.functionName === 'write') {
            const slotId = decodedWrite.args?.[0] as string
            const payload = decodedWrite.args?.[1] as string
            slotPayloads.set(slotId, payload)
          }
        }
        return txHash
      }

      if (method === 'eth_call') {
        const call = params?.[0] as { data?: `0x${string}` } | undefined
        if (!call?.data) throw new Error('eth_call missing data')

        const decodedRead = decodeFunctionData({
          abi: OASIS_STORAGE_ABI,
          data: call.data,
        })

        if (decodedRead.functionName !== 'read') {
          throw new Error(`Unexpected eth_call function: ${decodedRead.functionName}`)
        }

        const slotId = decodedRead.args?.[0] as string
        const payload = slotPayloads.get(slotId)
        if (!payload) {
          throw new Error(`No payload in mock provider for slot ${slotId}`)
        }

        return encodeAbiParameters(parseAbiParameters('string'), [payload])
      }

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

function setRuntimeStorageContract(value?: string) {
  const runtime = globalThis as { __ANTI_SOON_OASIS_STORAGE_CONTRACT__?: string }
  const previous = runtime.__ANTI_SOON_OASIS_STORAGE_CONTRACT__

  if (typeof value === 'string') {
    runtime.__ANTI_SOON_OASIS_STORAGE_CONTRACT__ = value
  } else {
    delete runtime.__ANTI_SOON_OASIS_STORAGE_CONTRACT__
  }

  return () => {
    if (typeof previous === 'string') {
      runtime.__ANTI_SOON_OASIS_STORAGE_CONTRACT__ = previous
    } else {
      delete runtime.__ANTI_SOON_OASIS_STORAGE_CONTRACT__
    }
  }
}

describe('oasis upload helper', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

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
        oasisTxHash: `0x${'a'.repeat(64)}`,
      }),
      text: async () => '',
    }))

    vi.stubGlobal('fetch', fetchMock)

    const envelopeHash = `0x${'a'.repeat(64)}`
    const { provider, calls } = createMockProvider(
      `0x${'f'.repeat(64)}` as const,
      '0x1111111111111111111111111111111111111111',
      {
      readPayloadBySlot: {
        'slot-1': JSON.stringify({
          envelopeHash,
          pointer: {
            slotId: 'slot-1',
            contract: '0x000000000000000000000000000000000000dead',
          },
        }),
      },
      },
    )

    try {
      const result = await uploadEncryptedPoC({
        poc: '{"target":"dummy"}',
        projectId: 7n,
        auditor: '0x2222222222222222222222222222222222222222',
        ethereumProvider: provider as unknown,
      })

      expect(fetchMock).toHaveBeenCalledWith(
        'https://relay.example/upload',
        expect.objectContaining({ method: 'POST' }),
      )
      expect(result.cipherURI).toContain('oasis://')
      expect(calls.some((call) => call.method === 'eth_call')).toBe(true)
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

  it('fails closed when relayer readback payload does not match cipherURI envelope hash', async () => {
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
        oasisTxHash: `0x${'a'.repeat(64)}`,
      }),
      text: async () => '',
    }))

    vi.stubGlobal('fetch', fetchMock)

    const { provider } = createMockProvider(
      `0x${'f'.repeat(64)}` as const,
      '0x1111111111111111111111111111111111111111',
      {
      readPayloadBySlot: {
        'slot-1': JSON.stringify({
          envelopeHash: `0x${'b'.repeat(64)}`,
          pointer: {
            slotId: 'slot-1',
            contract: '0x000000000000000000000000000000000000dead',
          },
        }),
      },
      },
    )

    try {
      await expect(
        uploadEncryptedPoC({
          poc: '{"target":"dummy"}',
          projectId: 7n,
          auditor: '0x2222222222222222222222222222222222222222',
          ethereumProvider: provider as unknown,
        }),
      ).rejects.toThrow('Sapphire readback validation failed: envelope hash does not match cipherURI')
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

  it('fails closed when VITE_OASIS_STORAGE_CONTRACT is missing', async () => {
    const restoreRuntimeStorage = setRuntimeStorageContract('not-an-address')
    vi.stubEnv('VITE_OASIS_STORAGE_CONTRACT', '')
    const { provider } = createMockProvider(`0x${'a'.repeat(64)}` as const)

    try {
      await expect(
        uploadEncryptedPoC({
          poc: '{"target":"dummy","secret":"super-sensitive-poc"}',
          projectId: 7n,
          auditor: '0x2222222222222222222222222222222222222222',
          ethereumProvider: provider as unknown,
        }),
      ).rejects.toThrow(
        'VITE_OASIS_STORAGE_CONTRACT must be set to a valid Ethereum address before uploading PoCs.',
      )
    } finally {
      restoreRuntimeStorage()
    }
  })

  it('fails closed when VITE_OASIS_STORAGE_CONTRACT is invalid', async () => {
    const restoreRuntimeStorage = setRuntimeStorageContract('not-an-address')
    vi.stubEnv('VITE_OASIS_STORAGE_CONTRACT', 'not-an-address')
    const { provider } = createMockProvider(`0x${'d'.repeat(64)}` as const)

    try {
      await expect(
        uploadEncryptedPoC({
          poc: '{"target":"dummy"}',
          projectId: 11n,
          auditor: '0x2222222222222222222222222222222222222222',
          ethereumProvider: provider as unknown,
        }),
      ).rejects.toThrow(
        'VITE_OASIS_STORAGE_CONTRACT must be set to a valid Ethereum address before uploading PoCs.',
      )

      expect(provider.request).not.toHaveBeenCalled()
    } finally {
      restoreRuntimeStorage()
    }
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

  it('does not send a transaction when storage contract is missing', async () => {
    const restoreRuntimeStorage = setRuntimeStorageContract('not-an-address')
    vi.stubEnv('VITE_OASIS_STORAGE_CONTRACT', '')
    const { provider } = createMockProvider(`0x${'c'.repeat(64)}` as const)

    try {
      await expect(
        uploadEncryptedPoC({
          poc: '{"target":"dummy"}',
          projectId: 9n,
          auditor: '0x2222222222222222222222222222222222222222',
          ethereumProvider: provider as unknown,
        }),
      ).rejects.toThrow(
        'VITE_OASIS_STORAGE_CONTRACT must be set to a valid Ethereum address before uploading PoCs.',
      )

      expect(provider.request).not.toHaveBeenCalled()
    } finally {
      restoreRuntimeStorage()
    }
  })

  it('uses envelope hash as cipherURI fragment for slot references', async () => {
    const previousStorageContract = (
      globalThis as { __ANTI_SOON_OASIS_STORAGE_CONTRACT__?: string }
    ).__ANTI_SOON_OASIS_STORAGE_CONTRACT__
    ;(globalThis as { __ANTI_SOON_OASIS_STORAGE_CONTRACT__?: string }).__ANTI_SOON_OASIS_STORAGE_CONTRACT__ =
      '0x000000000000000000000000000000000000dEaD'
    const txHash = `0x${'e'.repeat(64)}` as const
    const { provider, calls } = createMockProvider(txHash)

    try {
      const result = await uploadEncryptedPoC({
        poc: '{"target":"dummy"}',
        projectId: 19n,
        auditor: '0x2222222222222222222222222222222222222222',
        ethereumProvider: provider as unknown,
      })

      const sendCall = calls.find((call) => call.method === 'eth_sendTransaction')
      const txRequest = sendCall?.params?.[0] as { data?: string } | undefined
      expect(txRequest?.data).toBeTruthy()

      const decoded = decodeFunctionData({
        abi: OASIS_STORAGE_ABI,
        data: txRequest?.data as `0x${string}`,
      })
      const payload = JSON.parse(decoded.args?.[1] as string) as { envelopeHash: string }
      const fragment = result.cipherURI.split('#')[1]

      expect(fragment).toBe(payload.envelopeHash)
      expect(fragment).not.toBe(txHash)
    } finally {
      ;(globalThis as { __ANTI_SOON_OASIS_STORAGE_CONTRACT__?: string }).__ANTI_SOON_OASIS_STORAGE_CONTRACT__ =
        previousStorageContract
    }
  })
})
