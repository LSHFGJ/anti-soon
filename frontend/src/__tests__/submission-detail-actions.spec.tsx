import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import type { Address } from 'viem'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockProject } from '../test/utils'

const { mockUseWallet, mockReadContract, mockWaitForReceipt, mockReadProjectById, mockWriteContract, mockReadStoredPoCPreview, mockReadSubmissionCommitTxHash, mockResolveSapphireTxHash } = vi.hoisted(() => ({
  mockUseWallet: vi.fn(),
  mockReadContract: vi.fn(),
  mockWaitForReceipt: vi.fn(),
  mockReadProjectById: vi.fn(),
  mockWriteContract: vi.fn(),
  mockReadStoredPoCPreview: vi.fn(),
  mockReadSubmissionCommitTxHash: vi.fn(),
  mockResolveSapphireTxHash: vi.fn(),
}))

vi.mock('../hooks/useWallet', () => ({
  useWallet: (...args: unknown[]) => mockUseWallet(...args),
}))

vi.mock('../lib/publicClient', () => ({
  publicClient: {
    readContract: (...args: unknown[]) => mockReadContract(...args),
    waitForTransactionReceipt: (...args: unknown[]) => mockWaitForReceipt(...args),
  },
  readContractWithRpcFallback: (...args: unknown[]) => mockReadContract(...args),
}))

vi.mock('../lib/projectReads', () => ({
  readProjectById: (...args: unknown[]) => mockReadProjectById(...args),
}))

vi.mock('../lib/oasisUpload', async () => {
  const actual = await vi.importActual<typeof import('../lib/oasisUpload')>('../lib/oasisUpload')
  return {
    ...actual,
    readStoredPoCPreview: (...args: unknown[]) => mockReadStoredPoCPreview(...args),
    resolveSapphireTxHash: (...args: unknown[]) => mockResolveSapphireTxHash(...args),
  }
})

vi.mock('../lib/submissionArtifacts', () => ({
  readSubmissionCommitTxHash: (...args: unknown[]) => mockReadSubmissionCommitTxHash(...args),
}))

import { SubmissionDetail } from '../pages/SubmissionDetail'

const NOW_SECONDS = 1_900_000_000n
const MIN_CHALLENGE_BOND_WEI = 10_000_000_000_000_000n
const AUDITOR = '0x1111111111111111111111111111111111111111' as Address
const NON_OWNER = '0x3333333333333333333333333333333333333333' as Address
const OWNER = '0x2222222222222222222222222222222222222222' as Address
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address
const MOCK_TX_HASH = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as `0x${string}`
let dateNowSpy: ReturnType<typeof vi.spyOn>

function makeSubmissionTuple(overrides: {
  status?: number
  disputeDeadline?: bigint
  challenged?: boolean
  challengeBond?: bigint
  challenger?: Address
  projectId?: bigint
} = {}) {
  return [
    AUDITOR,
    overrides.projectId ?? 1n,
    '0x1111111111111111111111111111111111111111111111111111111111111111' as `0x${string}`,
    'oasis://mock/cipher',
    '0x0000000000000000000000000000000000000000000000000000000000000001' as `0x${string}`,
    NOW_SECONDS - 300n,
    NOW_SECONDS - 200n,
    overrides.status ?? 2,
    1_000_000_000_000_000n,
    3,
    2_000_000_000_000_000n,
    overrides.disputeDeadline ?? NOW_SECONDS + 600n,
    overrides.challenged ?? false,
    overrides.challenger ?? ZERO_ADDRESS,
    overrides.challengeBond ?? 0n,
  ] as const
}

function renderSubmissionDetail(path = '/submission/1') {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/submission/:id" element={<SubmissionDetail />} />
      </Routes>
    </MemoryRouter>,
  )
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })

  return { promise, resolve, reject }
}

function renderRoutableSubmissionDetail(path = '/submission/1') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Link to="/submission/2">Go to submission 2</Link>
      <Routes>
        <Route path="/submission/:id" element={<SubmissionDetail />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('SubmissionDetail lifecycle action alignment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(Number(NOW_SECONDS) * 1000)

    mockWriteContract.mockResolvedValue(MOCK_TX_HASH)
    mockWaitForReceipt.mockResolvedValue({ status: 'success' })
    mockReadStoredPoCPreview.mockResolvedValue({
      poc: { step: 'flashLoan()' },
      payloadJson: '{"poc":{"step":"flashLoan()"}}',
      source: 'sapphire',
    })
    mockReadSubmissionCommitTxHash.mockResolvedValue(
      '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    )
    mockResolveSapphireTxHash.mockResolvedValue(
      '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    )
    mockReadProjectById.mockResolvedValue(
      createMockProject({
        id: 1n,
        owner: OWNER,
        maxPayoutPerBug: 5_000_000_000_000_000_000n,
      }),
    )
  })

  afterEach(() => {
    dateNowSpy.mockRestore()
  })

  it('disables automatic sepolia switching in submission detail wallet hook', async () => {
    mockUseWallet.mockReturnValue({
      address: NON_OWNER,
      walletClient: { writeContract: mockWriteContract },
      isConnected: true,
    })
    mockReadContract.mockResolvedValue(makeSubmissionTuple())

    renderSubmissionDetail()

    await waitFor(() => {
      expect(mockUseWallet).toHaveBeenCalledWith({ autoSwitchToSepolia: false })
    })
  })

  it('shows finalize action for disputed submissions after dispute timeout', async () => {
    mockUseWallet.mockReturnValue({
      address: NON_OWNER,
      walletClient: { writeContract: mockWriteContract },
      isConnected: true,
    })
    mockReadContract.mockResolvedValue(
      makeSubmissionTuple({
        status: 3,
        challenged: true,
        challengeBond: MIN_CHALLENGE_BOND_WEI,
        challenger: NON_OWNER,
        disputeDeadline: NOW_SECONDS - 1n,
      }),
    )

    renderSubmissionDetail()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '[ FINALIZE PAYOUT ]' })).toBeVisible()
    })
    expect(screen.queryByText('> Awaiting resolution from project owner')).toBeNull()
  })

  it('keeps challenge available at exact dispute deadline boundary', async () => {
    mockUseWallet.mockReturnValue({
      address: NON_OWNER,
      walletClient: { writeContract: mockWriteContract },
      isConnected: true,
    })
    mockReadContract.mockResolvedValue(
      makeSubmissionTuple({
        status: 2,
        challenged: false,
        disputeDeadline: NOW_SECONDS,
      }),
    )

    renderSubmissionDetail()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '[ CHALLENGE RESULT ]' })).toBeVisible()
    })
  })

  it('uses on-chain minimum challenge bond value when challenging', async () => {
    mockUseWallet.mockReturnValue({
      address: NON_OWNER,
      walletClient: { writeContract: mockWriteContract },
      isConnected: true,
    })
    mockReadContract.mockResolvedValue(
      makeSubmissionTuple({
        status: 2,
        challenged: false,
        disputeDeadline: NOW_SECONDS + 10n,
      }),
    )

    renderSubmissionDetail()
    const user = userEvent.setup()

    const challengeButton = await screen.findByRole('button', { name: '[ CHALLENGE RESULT ]' })
    await user.click(challengeButton)

    await waitFor(() => {
      expect(mockWriteContract).toHaveBeenCalled()
    })

    expect(mockWriteContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: 'challenge',
        value: MIN_CHALLENGE_BOND_WEI,
      }),
    )
  })

  it('keeps owner resolve actions available at exact dispute deadline boundary', async () => {
    mockUseWallet.mockReturnValue({
      address: OWNER,
      walletClient: { writeContract: mockWriteContract },
      isConnected: true,
    })
    mockReadContract.mockResolvedValue(
      makeSubmissionTuple({
        status: 3,
        challenged: true,
        challengeBond: MIN_CHALLENGE_BOND_WEI,
        challenger: NON_OWNER,
        disputeDeadline: NOW_SECONDS,
      }),
    )

    renderSubmissionDetail()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'ACCEPT (Uphold)' })).toBeVisible()
      expect(screen.getByRole('button', { name: 'REJECT (Overturn)' })).toBeVisible()
    })
  })

  it('ignores stale submission responses after route changes', async () => {
    const submissionOneDeferred = deferred<ReturnType<typeof makeSubmissionTuple>>()
    const projectOneDeferred = deferred<ReturnType<typeof createMockProject>>()

    mockUseWallet.mockReturnValue({
      address: NON_OWNER,
      walletClient: { writeContract: mockWriteContract },
      isConnected: true,
    })

    mockReadContract.mockImplementation(({ args }: { args?: [bigint] }) => {
      if (args?.[0] === 1n) {
        return submissionOneDeferred.promise
      }

      return Promise.resolve(makeSubmissionTuple({ projectId: 2n }))
    })

    mockReadProjectById.mockImplementation((projectId: bigint) => {
      if (projectId === 1n) {
        return projectOneDeferred.promise
      }

      return Promise.resolve(createMockProject({ id: 2n, owner: OWNER }))
    })

    const user = userEvent.setup()
    renderRoutableSubmissionDetail('/submission/1')

    await user.click(screen.getByRole('link', { name: 'Go to submission 2' }))

    await waitFor(() => {
      expect(screen.getByText('#2')).toBeVisible()
    })

    submissionOneDeferred.resolve(makeSubmissionTuple({ projectId: 1n }))
    projectOneDeferred.resolve(createMockProject({ id: 1n, owner: OWNER }))

    await waitFor(() => {
      expect(screen.getByText('#2')).toBeVisible()
      expect(screen.queryByText('#1')).toBeNull()
    })
  })

  it('shows both Sapphire and Sepolia transaction hashes from chain-derived artifacts', async () => {
    mockUseWallet.mockReturnValue({
      address: AUDITOR,
      walletClient: { writeContract: mockWriteContract },
      isConnected: true,
    })
    mockReadContract.mockResolvedValue(makeSubmissionTuple())

    renderSubmissionDetail()

    await waitFor(() => {
      expect(screen.getByText('SAPPHIRE_TX')).toBeVisible()
      expect(screen.getByText('SEPOLIA_COMMIT_TX')).toBeVisible()
    })

    expect(screen.queryByText('COMMIT_HASH')).not.toBeInTheDocument()
    expect(screen.queryByText('CIPHER_URI')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' })).toHaveAttribute(
      'href',
      expect.stringContaining('explorer.oasis.io/testnet/sapphire/tx/0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'),
    )
  })

  it('shows a hard error instead of local补全 when chain read fails', async () => {
    mockUseWallet.mockReturnValue({
      address: AUDITOR,
      walletClient: { writeContract: mockWriteContract },
      isConnected: true,
    })
    mockReadContract.mockRejectedValue(new Error('rpc down'))

    renderSubmissionDetail()

    await waitFor(() => {
      expect(screen.getByText(/Failed to load submission from blockchain/i)).toBeVisible()
    })
  })
})
