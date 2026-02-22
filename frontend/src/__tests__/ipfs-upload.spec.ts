import { describe, expect, it, vi } from 'vitest'
import { uploadEncryptedPoC } from '../lib/ipfsUpload'

describe('ipfs upload helper', () => {
  it('returns uri directly when API returns ipfs uri', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ uri: 'ipfs://bafyalpha' }),
    }))

    const uri = await uploadEncryptedPoC({
      ciphertext: '0x1234',
      iv: '0xabcd',
      apiBaseUrl: 'https://api.example.com',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    expect(uri).toBe('ipfs://bafyalpha')
    expect(fetchImpl).toHaveBeenCalledWith('https://api.example.com/api/ipfs/upload', expect.any(Object))
  })

  it('converts cid to ipfs uri when uri field is missing', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ cid: 'bafybeta' }),
    }))

    const uri = await uploadEncryptedPoC({
      ciphertext: '0x1234',
      iv: '0xabcd',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    expect(uri).toBe('ipfs://bafybeta')
    expect(fetchImpl).toHaveBeenCalledWith('/api/ipfs/upload', expect.any(Object))
  })

  it('throws useful error when API returns non-ok response', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 401,
      text: async () => 'unauthorized',
    }))

    await expect(() => uploadEncryptedPoC({
      ciphertext: '0x1234',
      iv: '0xabcd',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })).rejects.toThrow('IPFS upload API failed with status 401: unauthorized')
  })
})
