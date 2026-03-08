import { describe, expect, it } from 'vitest'
import { resolveRpcUrl, resolveRpcUrls } from '../lib/rpcConfig'

describe('resolveRpcUrl', () => {
	it('prefers VITE_RPC_URL over the legacy cre-sim RPC name', () => {
		const result = resolveRpcUrl({
			VITE_RPC_URL: 'https://rpc-primary.test',
			VITE_CRE_SIM_SEPOLIA_RPC_URL: 'https://rpc-legacy.test',
		} as Record<string, string | undefined>)

		expect(result).toBe('https://rpc-primary.test')
	})

	it('falls back to the legacy cre-sim RPC name when VITE_RPC_URL is unset', () => {
		const result = resolveRpcUrl({
			VITE_CRE_SIM_SEPOLIA_RPC_URL: 'https://rpc-cre-sim.test',
		} as Record<string, string | undefined>)

		expect(result).toBe('https://rpc-cre-sim.test')
	})

	it('uses VITE_RPC_URL when set', () => {
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
			VITE_CRE_SIM_SEPOLIA_RPC_URL: 'https://rpc-legacy.test',
			VITE_PRIVATE_RPC_URL: 'https://rpc-c.test',
		})

		expect(result).toEqual([
			'https://rpc-a.test',
			'https://rpc-b.test',
			'https://rpc-legacy.test',
			'https://rpc-c.test',
		])
	})
})
