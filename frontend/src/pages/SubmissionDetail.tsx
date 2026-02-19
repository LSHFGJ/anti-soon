import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { formatEther, type Address } from 'viem'
import { createPublicClient, http } from 'viem'
import { BOUNTY_HUB_ADDRESS, BOUNTY_HUB_V2_ABI, CHAIN } from '../config'
import { Timeline, getSubmissionTimeline } from '../components/shared/Timeline'
import { SeverityBadge } from '../components/shared/SeverityBadge'
import { useWallet } from '../hooks/useWallet'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { Submission, Project } from '../types'

type SubmissionTuple = readonly [
  auditor: Address,
  projectId: bigint,
  commitHash: `0x${string}`,
  cipherURI: string,
  decryptionKey: `0x${string}`,
  salt: `0x${string}`,
  commitTimestamp: bigint,
  revealTimestamp: bigint,
  status: number,
  drainAmountWei: bigint,
  severity: number,
  payoutAmount: bigint,
  disputeDeadline: bigint,
  challenged: boolean,
  challenger: Address,
  challengeBond: bigint
]

type ProjectTuple = readonly [
  owner: Address,
  bountyPool: bigint,
  maxPayoutPerBug: bigint,
  targetContract: Address,
  forkBlock: bigint,
  active: boolean,
  mode: number,
  commitDeadline: bigint,
  revealDeadline: bigint,
  disputeWindow: bigint,
  rulesHash: `0x${string}`
]

const publicClient = createPublicClient({
  chain: CHAIN,
  transport: http()
})

const STATUS_LABELS = ['Committed', 'Revealed', 'Verified', 'Disputed', 'Finalized', 'Invalid']

export function SubmissionDetail() {
  const { id } = useParams<{ id: string }>()
  const { address, walletClient, isConnected } = useWallet()
  const [submission, setSubmission] = useState<Submission | null>(null)
  const [project, setProject] = useState<Project | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return

    const fetchData = async () => {
      try {
        setIsLoading(true)
        setError(null)

        const submissionId = BigInt(id)

        const subData = await publicClient.readContract({
          address: BOUNTY_HUB_ADDRESS,
          abi: BOUNTY_HUB_V2_ABI,
          functionName: 'submissions',
          args: [submissionId]
        }) as SubmissionTuple

        const fetchedSubmission: Submission = {
          id: submissionId,
          auditor: subData[0],
          projectId: subData[1],
          commitHash: subData[2],
          cipherURI: subData[3],
          decryptionKey: subData[4],
          salt: subData[5],
          commitTimestamp: subData[6],
          revealTimestamp: subData[7],
          status: subData[8],
          drainAmountWei: subData[9],
          severity: subData[10],
          payoutAmount: subData[11],
          disputeDeadline: subData[12],
          challenged: subData[13],
          challenger: subData[14],
          challengeBond: subData[15]
        }
        setSubmission(fetchedSubmission)

        const projData = await publicClient.readContract({
          address: BOUNTY_HUB_ADDRESS,
          abi: BOUNTY_HUB_V2_ABI,
          functionName: 'projects',
          args: [fetchedSubmission.projectId]
        }) as ProjectTuple

        const fetchedProject: Project = {
          id: fetchedSubmission.projectId,
          owner: projData[0],
          bountyPool: projData[1],
          maxPayoutPerBug: projData[2],
          targetContract: projData[3],
          forkBlock: projData[4],
          active: projData[5],
          mode: projData[6],
          commitDeadline: projData[7],
          revealDeadline: projData[8],
          disputeWindow: projData[9],
          rulesHash: projData[10]
        }
        setProject(fetchedProject)
      } catch (err) {
        console.error('Failed to fetch submission:', err)
        setError('Failed to load submission from blockchain')
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [id])

  const formatTimestamp = (timestamp: bigint) => {
    if (timestamp === 0n) return 'Pending...'
    return new Date(Number(timestamp) * 1000).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const handleChallenge = async () => {
    if (!walletClient || !submission || !address) return

    try {
      setActionLoading('challenge')

      const challengeBond = project?.maxPayoutPerBug ? project.maxPayoutPerBug / 10n : 0n

      const hash = await walletClient.writeContract({
        address: BOUNTY_HUB_ADDRESS,
        abi: BOUNTY_HUB_V2_ABI,
        functionName: 'challenge',
        chain: CHAIN,
        account: address,
        args: [submission.id],
        value: challengeBond
      })

      await publicClient.waitForTransactionReceipt({ hash })

      setSubmission({
        ...submission,
        challenged: true,
        challenger: address,
        challengeBond
      })
    } catch (err) {
      console.error('Challenge failed:', err)
      setError('Failed to submit challenge')
    } finally {
      setActionLoading(null)
    }
  }

  const handleResolve = async (overturn: boolean) => {
    if (!walletClient || !submission) return

    try {
      setActionLoading(overturn ? 'reject' : 'accept')

      const hash = await walletClient.writeContract({
        address: BOUNTY_HUB_ADDRESS,
        abi: BOUNTY_HUB_V2_ABI,
        functionName: 'resolveDispute',
        chain: CHAIN,
        account: address,
        args: [submission.id, overturn]
      })

      await publicClient.waitForTransactionReceipt({ hash })

      setSubmission({
        ...submission,
        status: overturn ? 5 : 4,
        challenged: false
      })
    } catch (err) {
      console.error('Resolve failed:', err)
      setError('Failed to resolve dispute')
    } finally {
      setActionLoading(null)
    }
  }

  const handleFinalize = async () => {
    if (!walletClient || !submission) return

    try {
      setActionLoading('finalize')

      const hash = await walletClient.writeContract({
        address: BOUNTY_HUB_ADDRESS,
        abi: BOUNTY_HUB_V2_ABI,
        functionName: 'finalize',
        chain: CHAIN,
        account: address,
        args: [submission.id]
      })

      await publicClient.waitForTransactionReceipt({ hash })

      setSubmission({
        ...submission,
        status: 4
      })
    } catch (err) {
      console.error('Finalize failed:', err)
      setError('Failed to finalize submission')
    } finally {
      setActionLoading(null)
    }
  }

  const isProjectOwner = project && address && project.owner.toLowerCase() === address.toLowerCase()
  const canChallenge = submission && submission.status === 2 && !submission.challenged && isConnected
  const canResolve = submission && submission.challenged && isProjectOwner && submission.status === 3
  const canFinalize = submission && (submission.status === 2 || submission.status === 3) && !submission.challenged

  const getStatusBadgeVariant = (): 'success' | 'error' | 'warning' | 'info' => {
    if (submission?.status === 5) return 'error'
    if (submission?.challenged) return 'error'
    if (submission?.status === 4) return 'success'
    if (submission?.status === 2) return 'success'
    if (submission?.status === 1) return 'info'
    return 'warning'
  }

  if (isLoading) {
    return (
      <div className="min-h-[calc(100vh-142px)] flex items-center justify-center">
        <div className="container">
          <div className="text-center p-8 text-[var(--color-text-dim)]">
            <div className="spinner w-10 h-10 mx-auto mb-4 border-[var(--color-primary)] border-t-transparent" />
            <p className="font-mono">&gt; Loading submission data...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error || !submission) {
    return (
      <div className="min-h-[calc(100vh-142px)] flex items-center justify-center pt-[50px]">
        <div className="container">
          <Card className="border-[var(--color-error)] bg-[rgba(255,0,60,0.05)] max-w-md mx-auto">
            <CardContent className="p-6 text-center">
              <p className="font-mono text-[var(--color-error)] mb-4">
                &gt; ERROR: {error || 'Submission not found'}
              </p>
              <Link to="/explorer">
                <Button variant="outline" className="border-[var(--color-primary)] text-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-[var(--color-bg)]">
                  [ BACK TO EXPLORER ]
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  const timelineSteps = getSubmissionTimeline(
    submission.status,
    submission.commitTimestamp,
    submission.revealTimestamp,
    submission.challenged
  )

  return (
    <div className="h-[calc(100vh-142px)] flex flex-col overflow-hidden">
      <div className="container flex-1 flex flex-col overflow-auto py-6">
        <header className="mb-6 flex-shrink-0">
          <div className="flex items-baseline gap-4 mb-2">
            <h1 className="text-2xl font-[var(--font-display)] uppercase tracking-wider text-[var(--color-primary)]">
              SUBMISSION_#{id}
            </h1>
            <Badge variant={getStatusBadgeVariant()}>
              [{STATUS_LABELS[submission.status]}]
            </Badge>
          </div>
          <div className="h-0.5 bg-gradient-to-r from-[var(--color-primary)] to-transparent w-40" />
          <p className="text-[var(--color-text-dim)] mt-2 font-mono text-sm">
            &gt; View submission details and dispute status
          </p>
        </header>

        <section className="mb-6 flex-shrink-0">
          <h2 className="font-[var(--font-display)] text-sm text-[var(--color-text)] mb-4 tracking-wider">
            SUBMISSION_PROGRESS
          </h2>
          <Timeline steps={timelineSteps} />
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1">
          <div className="flex flex-col gap-6">
            <Card className="bg-gradient-to-br from-[rgba(17,17,17,0.9)] to-[rgba(10,10,10,0.95)] border-[var(--color-bg-light)]">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-[var(--font-display)] text-[var(--color-secondary)] tracking-wider">
                  POC_METADATA
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 font-mono text-sm">
                <div>
                  <label className="text-[var(--color-text-dim)] block mb-1 text-xs uppercase tracking-wider">
                    COMMIT_HASH
                  </label>
                  <span className="text-[var(--color-secondary)] break-all">
                    {submission.commitHash}
                  </span>
                </div>
                <div>
                  <label className="text-[var(--color-text-dim)] block mb-1 text-xs uppercase tracking-wider">
                    AUDITOR
                  </label>
                  <span className="text-[var(--color-text)]">
                    {submission.auditor}
                  </span>
                </div>
                <div>
                  <label className="text-[var(--color-text-dim)] block mb-1 text-xs uppercase tracking-wider">
                    PROJECT_ID
                  </label>
                  <Link to="/explorer" className="text-[var(--color-primary)] hover:underline">
                    #{submission.projectId.toString()}
                  </Link>
                </div>
                {project && (
                  <div>
                    <label className="text-[var(--color-text-dim)] block mb-1 text-xs uppercase tracking-wider">
                      TARGET_CONTRACT
                    </label>
                    <span className="text-[var(--color-secondary)] text-xs">
                      {project.targetContract}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-[rgba(17,17,17,0.9)] to-[rgba(10,10,10,0.95)] border-[var(--color-bg-light)]">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-[var(--font-display)] text-[var(--color-secondary)] tracking-wider">
                  TIMESTAMPS
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 font-mono text-sm">
                <div className="flex justify-between">
                  <span className="text-[var(--color-text-dim)]">COMMITTED</span>
                  <span className="text-[var(--color-text)]">
                    {formatTimestamp(submission.commitTimestamp)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--color-text-dim)]">REVEALED</span>
                  <span className={submission.revealTimestamp > 0n ? 'text-[var(--color-text)]' : 'text-[var(--color-text-dim)]'}>
                    {formatTimestamp(submission.revealTimestamp)}
                  </span>
                </div>
                {submission.disputeDeadline > 0n && (
                  <div className="flex justify-between">
                    <span className="text-[var(--color-text-dim)]">DISPUTE_DEADLINE</span>
                    <span className="text-[var(--color-text)]">
                      {formatTimestamp(submission.disputeDeadline)}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-col gap-6">
            <Card className={`bg-gradient-to-br from-[rgba(17,17,17,0.9)] to-[rgba(10,10,10,0.95)] ${submission.status >= 2 ? 'border-[var(--color-primary)]' : 'border-[var(--color-bg-light)]'}`}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-[var(--font-display)] text-[var(--color-primary)] tracking-wider">
                  VERIFICATION_RESULT
                </CardTitle>
              </CardHeader>
              <CardContent>
                {submission.status < 2 ? (
                  <div className="text-center py-8 text-[var(--color-text-dim)] font-mono">
                    <p>&gt; Pending verification...</p>
                    <p className="text-xs mt-2">
                      Results will appear after CRE workflow execution
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4 font-mono text-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-[var(--color-text-dim)]">SEVERITY</span>
                      <SeverityBadge severity={submission.severity} />
                    </div>

                    <div className="flex justify-between">
                      <span className="text-[var(--color-text-dim)]">DRAIN_AMOUNT</span>
                      <span className="text-[var(--color-secondary)]">
                        {formatEther(submission.drainAmountWei)} ETH
                      </span>
                    </div>

                    <div className="flex justify-between pt-4 border-t border-[var(--color-bg-light)]">
                      <span className="text-[var(--color-text-dim)]">PAYOUT</span>
                      <span className={`${submission.payoutAmount > 0n ? 'text-[var(--color-primary)] font-bold text-base' : 'text-[var(--color-text-dim)]'}`}>
                        {submission.payoutAmount > 0n ? `${formatEther(submission.payoutAmount)} ETH` : 'N/A'}
                      </span>
                    </div>

                    <div className={`mt-4 p-3 text-center border ${
                      submission.status === 5 
                        ? 'bg-[rgba(255,0,60,0.1)] border-[var(--color-error)]'
                        : submission.challenged 
                          ? 'bg-[rgba(255,0,60,0.1)] border-[var(--color-error)]'
                          : 'bg-[rgba(0,255,157,0.1)] border-[var(--color-primary)]'
                    }`}>
                      <span className={`font-bold tracking-wider ${
                        submission.status === 5 
                          ? 'text-[var(--color-error)]'
                          : submission.challenged 
                            ? 'text-[var(--color-error)]'
                            : 'text-[var(--color-primary)]'
                      }`}>
                        {submission.status === 5 ? '[ INVALID ]' : submission.challenged ? '[ DISPUTED ]' : '[ VALID ]'}
                      </span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className={`bg-gradient-to-br from-[rgba(17,17,17,0.9)] to-[rgba(10,10,10,0.95)] ${submission.challenged ? 'border-[var(--color-error)] bg-[rgba(255,0,60,0.03)]' : 'border-[var(--color-bg-light)]'}`}>
              <CardHeader className="pb-2">
                <CardTitle className={`text-sm font-[var(--font-display)] tracking-wider ${submission.challenged ? 'text-[var(--color-error)]' : 'text-[var(--color-text)]'}`}>
                  {submission.challenged ? 'ACTIVE_DISPUTE' : 'DISPUTE_PANEL'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {submission.status === 4 ? (
                  <div className="text-center py-4 text-[var(--color-text-dim)] font-mono">
                    <p className="text-[var(--color-primary)]">[ FINALIZED ]</p>
                    <p className="text-xs mt-2">No further actions available</p>
                  </div>
                ) : submission.challenged ? (
                  <>
                    <div className="space-y-3 font-mono text-sm mb-4">
                      <div className="flex justify-between">
                        <span className="text-[var(--color-text-dim)]">CHALLENGER</span>
                        <span className="text-[var(--color-error)]">
                          {submission.challenger.slice(0, 8)}...{submission.challenger.slice(-6)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[var(--color-text-dim)]">BOND_AMOUNT</span>
                        <span className="text-[var(--color-secondary)]">
                          {formatEther(submission.challengeBond)} ETH
                        </span>
                      </div>
                    </div>

                    {canResolve ? (
                      <>
                        <p className="text-[var(--color-text-dim)] font-mono text-xs mb-4">
                          &gt; As project owner, you can resolve this dispute:
                        </p>
                        <div className="flex gap-3">
                          <Button 
                            onClick={() => handleResolve(false)}
                            disabled={actionLoading !== null}
                            className="flex-1 bg-transparent border border-[var(--color-primary)] text-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-[var(--color-bg)] font-mono"
                          >
                            {actionLoading === 'accept' ? (
                              <><span className="spinner w-3 h-3 mr-2 border-[var(--color-bg)] border-t-transparent" /> ACCEPTING...</>
                            ) : 'ACCEPT (Uphold)'}
                          </Button>
                          <Button 
                            onClick={() => handleResolve(true)}
                            disabled={actionLoading !== null}
                            className="flex-1 bg-transparent border border-[var(--color-error)] text-[var(--color-error)] hover:bg-[var(--color-error)] hover:text-[var(--color-bg)] font-mono"
                          >
                            {actionLoading === 'reject' ? (
                              <><span className="spinner w-3 h-3 mr-2 border-[var(--color-bg)] border-t-transparent" /> REJECTING...</>
                            ) : 'REJECT (Overturn)'}
                          </Button>
                        </div>
                      </>
                    ) : (
                      <p className="text-[var(--color-text-dim)] font-mono text-xs">
                        &gt; Awaiting resolution from project owner
                      </p>
                    )}
                  </>
                ) : canChallenge ? (
                  <>
                    <p className="text-[var(--color-text-dim)] font-mono text-xs mb-4">
                      &gt; Challenge this verification result if you believe it's incorrect.
                      Requires a bond of {project ? formatEther(project.maxPayoutPerBug / 10n) : '0'} ETH.
                    </p>
                    <Button 
                      onClick={handleChallenge}
                      disabled={actionLoading !== null}
                      className="w-full bg-transparent border border-[var(--color-error)] text-[var(--color-error)] hover:bg-[var(--color-error)] hover:text-[var(--color-bg)] font-mono"
                    >
                      {actionLoading === 'challenge' ? (
                        <><span className="spinner w-3 h-3 mr-2 border-[var(--color-bg)] border-t-transparent" /> CHALLENGING...</>
                      ) : '[ CHALLENGE RESULT ]'}
                    </Button>
                  </>
                ) : canFinalize && isProjectOwner ? (
                  <>
                    <p className="text-[var(--color-text-dim)] font-mono text-xs mb-4">
                      &gt; Dispute window has passed. Finalize to release payout.
                    </p>
                    <Button 
                      onClick={handleFinalize}
                      disabled={actionLoading !== null}
                      className="w-full bg-transparent border border-[var(--color-primary)] text-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-[var(--color-bg)] font-mono"
                    >
                      {actionLoading === 'finalize' ? (
                        <><span className="spinner w-3 h-3 mr-2 border-[var(--color-bg)] border-t-transparent" /> FINALIZING...</>
                      ) : '[ FINALIZE PAYOUT ]'}
                    </Button>
                  </>
                ) : (
                  <p className="text-[var(--color-text-dim)] font-mono text-xs">
                    &gt; No dispute actions available
                    {!isConnected && ' (Connect wallet to challenge)'}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="mt-8 text-center">
          <Link to="/explorer">
            <Button variant="outline" className="border-[var(--color-primary)] text-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-[var(--color-bg)] font-mono px-6 py-3">
              [ BACK TO EXPLORER ]
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}

export default SubmissionDetail
