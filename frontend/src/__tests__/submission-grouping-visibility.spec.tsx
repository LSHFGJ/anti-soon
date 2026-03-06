import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { Dashboard } from '../pages/Dashboard'
import { ProjectDetail } from '../pages/ProjectDetail'
import { SubmissionDetail } from '../pages/SubmissionDetail'
import { useWallet } from '../hooks/useWallet'
import * as fallback from '../lib/previewFallback'

vi.mock('../hooks/useWallet', () => ({
  useWallet: vi.fn(),
}))

vi.mock('../lib/publicClient', () => ({
  publicClient: {
    multicall: vi.fn().mockRejectedValue(new Error('rpc unavailable')),
    readContract: vi.fn().mockRejectedValue(new Error('rpc unavailable')),
    getLogs: vi.fn().mockRejectedValue(new Error('rpc unavailable')),
  }
}))

vi.mock('../lib/projectReads', () => ({
  readProjectById: vi.fn().mockRejectedValue(new Error('rpc unavailable')),
}))

describe('Submission Grouping & Jury Visibility Alignment', () => {
  const MOCK_ADDRESS = '0x1234567890123456789012345678901234567890'

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useWallet).mockReturnValue({
      address: MOCK_ADDRESS,
      isConnected: true,
      isConnecting: false,
      connect: vi.fn(),
    } as any)
  })

  it('Dashboard renders grouping and jury metadata gracefully', async () => {
    vi.spyOn(fallback, 'shouldUsePreviewFallback').mockReturnValue(true)
    vi.spyOn(fallback, 'buildPreviewSubmission').mockImplementation((id) => {
      const sub: any = {
        id,
        auditor: MOCK_ADDRESS,
        projectId: 1n,
        commitTimestamp: 1000n,
        revealTimestamp: 2000n,
        status: 2,
        drainAmountWei: 100n,
        severity: 3,
        payoutAmount: 0n,
        disputeDeadline: 0n,
      }
      if (id === 1001n) {
        sub.grouping = { cohort: 'HIGH', groupId: 'g123', groupRank: 1, groupSize: 3 }
        sub.jury = { action: 'UPHOLD_AI_RESULT', rationale: 'Looks good' }
      }
      return sub
    })

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    )

    expect(await screen.findByText(/\[HIGH-1\/3\]/)).toBeInTheDocument()
    expect(screen.getByText(/⚖️ UPHOLD AI/)).toBeInTheDocument()
  })

  it('ProjectDetail renders grouping and jury metadata gracefully', async () => {
    vi.spyOn(fallback, 'shouldUsePreviewFallback').mockReturnValue(true)
    vi.spyOn(fallback, 'buildPreviewProject').mockReturnValue({ 
      id: 1n, 
      mode: 1, 
      owner: MOCK_ADDRESS,
      bountyPool: 1000n,
      maxPayoutPerBug: 100n,
      commitDeadline: 10000000000n,
      revealDeadline: 20000000000n,
      isActive: true,
      vnetStatus: 0,
      vnetRpcUrl: '',
      targetContracts: [],
      ipfsHash: '',
      rulesHash: '0x1234567890123456789012345678901234567890',
      disputeWindow: 100n,
      baseSnapshotId: ''
    } as any)
    vi.spyOn(fallback, 'buildPreviewProjectRules').mockReturnValue({
      commitWindow: 100n,
      revealWindow: 100n,
      disputeWindow: 100n,
      thresholds: {
        criticalDrainWei: 100n,
        highDrainWei: 100n,
        mediumDrainWei: 100n,
        lowDrainWei: 100n,
      },
      criticalPayoutWei: 100n,
      highPayoutWei: 100n,
      medPayoutWei: 100n,
      maxAttackerSeedWei: 100n,
      maxWarpSeconds: 3600n,
      allowImpersonation: false
    } as any)
    vi.spyOn(fallback, 'buildPreviewSubmission').mockImplementation((id) => {
      const sub: any = {
        id,
        auditor: MOCK_ADDRESS,
        projectId: 1n,
        status: 2,
        severity: 3,
        commitTimestamp: 1000n,
        drainAmountWei: 100n,
        payoutAmount: 0n,
        disputeDeadline: 0n,
        revealTimestamp: 2000n,
        challengeBond: 0n,
        challenger: MOCK_ADDRESS
      }
      if (id === 3001n) {
        sub.grouping = { cohort: 'HIGH', groupId: 'g123', groupRank: 1, groupSize: 3 }
        sub.jury = { action: 'UPHOLD_AI_RESULT', rationale: 'Looks good' }
      }
      return sub
    })

    render(
      <MemoryRouter initialEntries={['/project/1']}>
        <Routes>
          <Route path="/project/:id" element={<ProjectDetail />} />
        </Routes>
      </MemoryRouter>
    )

    expect(await screen.findByText(/\[HIGH-1\/3\]/)).toBeInTheDocument()
    expect(screen.getByText(/⚖️ UPHOLD AI/)).toBeInTheDocument()
  })

  it('SubmissionDetail renders grouping and jury metadata gracefully', async () => {
    vi.spyOn(fallback, 'shouldUsePreviewFallback').mockReturnValue(true)
    vi.spyOn(fallback, 'buildPreviewProject').mockReturnValue({ 
      id: 1n, 
      mode: 1, 
      owner: MOCK_ADDRESS,
      bountyPool: 1000n,
      maxPayoutPerBug: 100n,
      commitDeadline: 10000000000n,
      revealDeadline: 20000000000n,
      isActive: true,
      vnetStatus: 0,
      vnetRpcUrl: '',
      targetContracts: [],
      ipfsHash: '',
      rulesHash: '0x1234567890123456789012345678901234567890',
      disputeWindow: 100n,
      baseSnapshotId: ''
    } as any)
    vi.spyOn(fallback, 'buildPreviewProjectRules').mockReturnValue({
      commitWindow: 100n,
      revealWindow: 100n,
      disputeWindow: 100n,
      thresholds: {
        criticalDrainWei: 100n,
        highDrainWei: 100n,
        mediumDrainWei: 100n,
        lowDrainWei: 100n,
      },
      criticalPayoutWei: 100n,
      highPayoutWei: 100n,
      medPayoutWei: 100n,
      maxAttackerSeedWei: 100n,
      maxWarpSeconds: 3600n,
      allowImpersonation: false
    } as any)
    vi.spyOn(fallback, 'buildPreviewSubmission').mockImplementation((id) => {
      const sub: any = {
        id,
        auditor: MOCK_ADDRESS,
        projectId: 1n,
        status: 2,
        severity: 3,
        commitTimestamp: 1000n,
        revealTimestamp: 2000n,
        disputeDeadline: 0n,
        challenger: MOCK_ADDRESS,
        challengeBond: 0n,
        drainAmountWei: 100n,
        payoutAmount: 0n,
      }
      if (id === 1001n) {
        sub.grouping = { cohort: 'HIGH', groupId: 'g123', groupRank: 1, groupSize: 3 }
        sub.jury = { action: 'UPHOLD_AI_RESULT', rationale: 'Looks good' }
      }
      return sub
    })

    render(
      <MemoryRouter initialEntries={['/submission/1001']}>
        <Routes>
          <Route path="/submission/:id" element={<SubmissionDetail />} />
        </Routes>
      </MemoryRouter>
    )

    expect(await screen.findByText('GROUPING_METADATA')).toBeInTheDocument()
    expect(screen.getByText('g123')).toBeInTheDocument()
    expect(screen.getByText('1 of 3')).toBeInTheDocument()
    
    expect(screen.getByText('JURY_OUTPUT')).toBeInTheDocument()
    expect(screen.getByText('UPHOLD_AI_RESULT')).toBeInTheDocument()
    expect(screen.getByText('Looks good')).toBeInTheDocument()
  })
})
