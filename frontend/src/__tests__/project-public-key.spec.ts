import { describe, expect, it, vi } from 'vitest'
import { extractProjectPublicKey, resolveProjectPublicKey } from '../lib/projectPublicKey'

describe('projectPublicKey helpers', () => {
  it('extracts public key from project tuple index 11', () => {
    const tuple = Array.from({ length: 12 }, () => null) as unknown[]
    tuple[11] = `0x${'ab'.repeat(32)}`

    expect(extractProjectPublicKey(tuple)).toBe(tuple[11])
  })

  it('falls back to on-chain read when API request fails', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 503,
      json: async () => ({}),
    }))

    const readProjectContract = vi.fn(async () => {
      const tuple = Array.from({ length: 12 }, () => null) as unknown[]
      tuple[11] = `0x${'cd'.repeat(32)}`
      return tuple as readonly unknown[]
    })

    const key = await resolveProjectPublicKey({
      projectId: 7n,
      apiBaseUrl: 'https://example.com',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      readProjectContract,
    })

    expect(key).toBe(`0x${'cd'.repeat(32)}`)
    expect(readProjectContract).toHaveBeenCalledWith(7n)
  })

  it('throws a useful error when API and on-chain key are unavailable', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('network down')
    })

    const readProjectContract = vi.fn(async () => {
      const tuple = Array.from({ length: 12 }, () => null)
      return tuple as readonly unknown[]
    })

    await expect(() => resolveProjectPublicKey({
      projectId: 2n,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      readProjectContract,
    })).rejects.toThrow('Failed to load project public key')
  })
})
