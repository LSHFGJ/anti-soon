import { screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '../test/utils'

const { mockReadContract, mockMulticall } = vi.hoisted(() => ({
  mockReadContract: vi.fn(),
  mockMulticall: vi.fn(),
}))

vi.mock('viem', async () => {
  const actual = await vi.importActual<typeof import('viem')>('viem')
  return {
    ...actual,
    createPublicClient: vi.fn(() => ({
      readContract: mockReadContract,
      multicall: mockMulticall,
    })),
    http: vi.fn(() => ({})),
  }
})

import { Landing } from '../pages/Landing'

function buildTuple(params: { id: bigint; active: boolean; mode: number; bountyPool: bigint }) {
  const baseAddress = `0x${params.id.toString().padStart(40, '0')}` as `0x${string}`
  return [
    baseAddress,
    params.bountyPool,
    1_000_000_000_000_000_000n,
    `0x${'2'.repeat(40)}` as `0x${string}`,
    20_000_000n + params.id,
    params.active,
    params.mode,
    0n,
    0n,
    0n,
    `0x${'0'.repeat(64)}` as `0x${string}`,
    2,
    'https://rpc.tenderly.co/fork/mock',
    `0x${'a'.repeat(64)}` as `0x${string}`,
    1_900_000_000n,
    `https://github.com/mock/repo-${params.id.toString()}`,
  ] as const
}

describe('Landing featured projects', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('IntersectionObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() { return [] }
    })
  })

  it('renders featured cards from on-chain project reads instead of hardcoded demo list', async () => {
    mockReadContract.mockResolvedValue(3n)
    mockMulticall.mockResolvedValue([
      buildTuple({ id: 0n, active: true, mode: 0, bountyPool: 5_000_000_000_000_000_000n }),
      buildTuple({ id: 1n, active: false, mode: 1, bountyPool: 6_000_000_000_000_000_000n }),
      buildTuple({ id: 2n, active: true, mode: 1, bountyPool: 7_000_000_000_000_000_000n }),
    ])

    renderWithRouter(<Landing />)

    await waitFor(() => {
      expect(screen.getByText('PROJECT_#0')).toBeInTheDocument()
      expect(screen.getByText('PROJECT_#2')).toBeInTheDocument()
    })

    expect(screen.queryByText('PROJECT_#1')).not.toBeInTheDocument()
    expect(screen.queryByText('DummyVault')).not.toBeInTheDocument()
  })
})
