import { describe, expect, it } from 'vitest'
import { resolveRpcUrl } from '../lib/rpcConfig'

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
})
