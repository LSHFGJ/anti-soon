import { describe, expect, it } from 'vitest'
import { resolveRpcUrl, resolveRpcUrls } from '../lib/rpcConfig'

describe('resolveRpcUrl', () => {
  it('uses private RPC when VITE_RPC_URL is set', () => {
    const result = resolveRpcUrl({
      VITE_RPC_URL: 'https://example-private-rpc.test',
    })

    expect(result).toBe('https://example-private-rpc.test')
  })

  it('falls back when private RPC is empty', () => {
    const result = resolveRpcUrl({
      VITE_RPC_URL: '   ',
    })

    expect(result).toBeUndefined()
  })

  it('returns all configured RPC URLs for concurrent reads', () => {
    const result = resolveRpcUrls({
      VITE_RPC_URL: 'https://rpc-a.test, https://rpc-b.test',
      VITE_PRIVATE_RPC_URL: 'https://rpc-c.test',
    })

    expect(result).toEqual([
      'https://rpc-a.test',
      'https://rpc-b.test',
      'https://rpc-c.test',
    ])
  })
})
