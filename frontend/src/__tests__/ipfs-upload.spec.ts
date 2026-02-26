import { describe, expect, it, vi } from 'vitest'
import { uploadEncryptedPoC } from '../lib/ipfsUpload'

describe('oasis upload helper', () => {
  it('returns uri directly when API returns oasis uri', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ uri: 'oasis://oasis-sapphire-testnet/0x1111111111111111111111111111111111111111/slot-1#0xabc' }),
    }))

    const uri = await uploadEncryptedPoC({
      ciphertext: '0x1234',
      iv: '0xabcd',
      projectId: 7n,
      auditor: '0x2222222222222222222222222222222222222222',
      apiBaseUrl: 'https://api.example.com',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    expect(uri.startsWith('oasis://')).toBe(true)
    expect(fetchImpl).toHaveBeenCalledWith('https://api.example.com/api/oasis/write', expect.any(Object))
  })

  it('builds deterministic oasis reference when API returns pointer only', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        pointer: {
          chain: 'oasis-sapphire-testnet',
          contract: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
          slotId: 'slot-42',
        },
      }),
    }))

    const uriA = await uploadEncryptedPoC({
      ciphertext: '0x1234',
      iv: '0xabcd',
      projectId: 1n,
      auditor: '0x1111111111111111111111111111111111111111',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    const uriB = await uploadEncryptedPoC({
      ciphertext: '0x1234',
      iv: '0xabcd',
      projectId: 1n,
      auditor: '0x1111111111111111111111111111111111111111',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    expect(uriA.startsWith('oasis://')).toBe(true)
    expect(uriA).toBe(uriB)
    expect(fetchImpl).toHaveBeenCalledWith('/api/oasis/write', expect.any(Object))
  })

  it('throws useful error when API returns non-ok response', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 401,
      text: async () => 'unauthorized',
    }))

    await expect(uploadEncryptedPoC({
      ciphertext: '0x1234',
      iv: '0xabcd',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })).rejects.toThrow('Oasis write API failed with status 401: unauthorized')
  })
})
