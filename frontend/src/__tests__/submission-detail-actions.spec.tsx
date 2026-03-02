import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { Address } from 'viem'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockProject } from '../test/utils'

const { mockUseWallet, mockReadContract, mockWaitForReceipt, mockReadProjectById, mockWriteContract } = vi.hoisted(() => ({
  mockUseWallet: vi.fn(),
  mockReadContract: vi.fn(),
  mockWaitForReceipt: vi.fn(),
  mockReadProjectById: vi.fn(),
  mockWriteContract: vi.fn(),
}))

vi.mock('../hooks/useWallet', () => ({
  useWallet: (...args: unknown[]) => mockUseWallet(...args),
}))

vi.mock('../lib/publicClient', () => ({
  publicClient: {
    readContract: (...args: unknown[]) => mockReadContract(...args),
    waitForTransactionReceipt: (...args: unknown[]) => mockWaitForReceipt(...args),
  },
}))

vi.mock('../lib/projectReads', () => ({
  readProjectById: (...args: unknown[]) => mockReadProjectById(...args),
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

describe('SubmissionDetail lifecycle action alignment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(Number(NOW_SECONDS) * 1000)

    mockWriteContract.mockResolvedValue(MOCK_TX_HASH)
    mockWaitForReceipt.mockResolvedValue({ status: 'success' })
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
})
