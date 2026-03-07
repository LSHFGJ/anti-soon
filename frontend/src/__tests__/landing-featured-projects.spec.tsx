import { screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '../test/utils'

const {
  mockPrimaryReadContract,
  mockPrimaryMulticall,
  mockSecondaryReadContract,
  mockSecondaryMulticall,
  nextMockClient,
  resetMockClients,
} = vi.hoisted(() => {
  const primaryClient = {
    readContract: vi.fn(),
    multicall: vi.fn(),
  }

  const secondaryClient = {
    readContract: vi.fn(),
    multicall: vi.fn(),
  }

  let clientIndex = 0

  return {
    mockPrimaryReadContract: primaryClient.readContract,
    mockPrimaryMulticall: primaryClient.multicall,
    mockSecondaryReadContract: secondaryClient.readContract,
    mockSecondaryMulticall: secondaryClient.multicall,
    nextMockClient: () => {
      clientIndex += 1
      return clientIndex === 1 ? primaryClient : secondaryClient
    },
    resetMockClients: () => {
      clientIndex = 0
      primaryClient.readContract.mockReset()
      primaryClient.multicall.mockReset()
      secondaryClient.readContract.mockReset()
      secondaryClient.multicall.mockReset()
    },
  }
})

vi.mock('../lib/rpcConfig', () => ({
  resolveRpcUrl: () => 'https://rpc-primary.test',
  resolveRpcUrls: () => ['https://rpc-primary.test', 'https://rpc-secondary.test'],
}))

vi.mock('viem', async () => {
  const actual = await vi.importActual<typeof import('viem')>('viem')
  return {
    ...actual,
    createPublicClient: vi.fn(() => nextMockClient()),
    http: vi.fn(() => ({})),
  }
})

import { Landing } from '../pages/Landing'

function buildProjectRow(params: { id: bigint; active: boolean; mode: number; bountyPool: bigint }) {
  const baseAddress = `0x${params.id.toString().padStart(40, '0')}` as `0x${string}`
  return {
    owner: baseAddress,
    bountyPool: params.bountyPool,
    maxPayoutPerBug: 1_000_000_000_000_000_000n,
    targetContract: `0x${'2'.repeat(40)}` as `0x${string}`,
    forkBlock: 20_000_000n + params.id,
    active: params.active,
    mode: params.mode,
    commitDeadline: 0n,
    revealDeadline: 0n,
    disputeWindow: 0n,
    rulesHash: `0x${'0'.repeat(64)}` as `0x${string}`,
    vnetStatus: 2,
    vnetRpcUrl: 'https://rpc.tenderly.co/fork/mock',
    baseSnapshotId: `0x${'a'.repeat(64)}` as `0x${string}`,
    vnetCreatedAt: 1_900_000_000n,
    repoUrl: `https://github.com/mock/repo-${params.id.toString()}`,
  } as const
}

describe('Landing featured projects', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetMockClients()
    vi.stubGlobal('IntersectionObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() { return [] }
    })
  })

  it('renders featured cards from on-chain project reads instead of hardcoded demo list', async () => {
    mockPrimaryReadContract.mockResolvedValue(3n)
    mockPrimaryMulticall.mockResolvedValue([
      buildProjectRow({ id: 0n, active: true, mode: 0, bountyPool: 5_000_000_000_000_000_000n }),
      buildProjectRow({ id: 1n, active: false, mode: 1, bountyPool: 6_000_000_000_000_000_000n }),
      buildProjectRow({ id: 2n, active: true, mode: 1, bountyPool: 7_000_000_000_000_000_000n }),
    ])
    mockSecondaryReadContract.mockResolvedValue(3n)
    mockSecondaryMulticall.mockResolvedValue([
      buildProjectRow({ id: 0n, active: true, mode: 0, bountyPool: 5_000_000_000_000_000_000n }),
      buildProjectRow({ id: 1n, active: false, mode: 1, bountyPool: 6_000_000_000_000_000_000n }),
      buildProjectRow({ id: 2n, active: true, mode: 1, bountyPool: 7_000_000_000_000_000_000n }),
    ])

    renderWithRouter(<Landing />)

    await waitFor(() => {
      expect(screen.getByText('PROJECT_#0')).toBeInTheDocument()
      expect(screen.getByText('PROJECT_#2')).toBeInTheDocument()
    })

    expect(screen.queryByText('PROJECT_#1')).not.toBeInTheDocument()
    expect(screen.queryByText('DummyVault')).not.toBeInTheDocument()
  })

  it('keeps featured project content visible instead of relying on viewport animation state', async () => {
    mockPrimaryReadContract.mockResolvedValue(1n)
    mockPrimaryMulticall.mockResolvedValue([
      buildProjectRow({ id: 0n, active: true, mode: 0, bountyPool: 5_000_000_000_000_000_000n }),
    ])
    mockSecondaryReadContract.mockResolvedValue(1n)
    mockSecondaryMulticall.mockResolvedValue([
      buildProjectRow({ id: 0n, active: true, mode: 0, bountyPool: 5_000_000_000_000_000_000n }),
    ])

    renderWithRouter(<Landing />)

    await waitFor(() => {
      expect(screen.getByText('PROJECT_#0')).toBeVisible()
    })
  })

  it('falls back to a secondary RPC when the primary client stalls', async () => {
    mockPrimaryReadContract.mockImplementation(() => new Promise(() => {}))
    mockPrimaryMulticall.mockImplementation(() => new Promise(() => {}))
    mockSecondaryReadContract.mockResolvedValue(1n)
    mockSecondaryMulticall.mockResolvedValue([
      buildProjectRow({ id: 0n, active: true, mode: 0, bountyPool: 5_000_000_000_000_000_000n }),
    ])

    renderWithRouter(<Landing />)

    await waitFor(() => {
      expect(screen.getByText('PROJECT_#0')).toBeVisible()
    })
  })
})
