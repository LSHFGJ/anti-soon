import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { formatEther, type Address } from 'viem'
import { createPublicClient, http } from 'viem'
import { BOUNTY_HUB_ADDRESS, BOUNTY_HUB_V2_ABI, CHAIN } from '../config'
import { Timeline, getSubmissionTimeline } from '../components/shared/Timeline'
import { SeverityBadge } from '../components/shared/SeverityBadge'
import { useWallet } from '../hooks/useWallet'
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

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', paddingTop: '120px' }}>
        <div className="container">
          <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--color-text-dim)' }}>
            <div className="spinner" style={{ width: '40px', height: '40px', margin: '0 auto 1rem' }} />
            <p style={{ fontFamily: 'var(--font-mono)' }}>&gt; Loading submission data...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error || !submission) {
    return (
      <div style={{ minHeight: '100vh', paddingTop: '120px' }}>
        <div className="container">
          <div style={{
            padding: '2rem',
            border: '1px solid var(--color-error)',
            color: 'var(--color-error)',
            background: 'rgba(255, 0, 60, 0.1)',
            textAlign: 'center'
          }}>
            <p style={{ fontFamily: 'var(--font-mono)', marginBottom: '1rem' }}>
              &gt; ERROR: {error || 'Submission not found'}
            </p>
            <Link
              to="/explorer"
              style={{
                color: 'var(--color-primary)',
                fontFamily: 'var(--font-mono)',
                textDecoration: 'none',
                border: '1px solid var(--color-primary)',
                padding: '0.5rem 1rem',
                display: 'inline-block'
              }}
            >
              [ BACK TO EXPLORER ]
            </Link>
          </div>
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
    <div style={{ height: 'calc(100vh - 70px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div className="container" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
        <header style={{ marginBottom: '1rem', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '1rem', marginBottom: '0.25rem' }}>
            <h1 style={{ fontSize: '1.5rem', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-primary)' }}>SUBMISSION_#{id}</h1>
            <span style={{
              padding: '0.25rem 0.75rem',
              background: submission.status <= 1 ? 'rgba(0, 255, 157, 0.1)'
                : submission.status === 5 ? 'rgba(255, 0, 60, 0.1)'
                : submission.challenged ? 'rgba(255, 0, 60, 0.1)'
                : 'rgba(0, 240, 255, 0.1)',
              color: submission.status <= 1 ? 'var(--color-primary)'
                : submission.status === 5 ? 'var(--color-error)'
                : submission.challenged ? 'var(--color-error)'
                : 'var(--color-secondary)',
              fontSize: '0.75rem',
              fontWeight: 'bold',
              fontFamily: 'var(--font-mono)',
              letterSpacing: '0.05em'
            }}>
              [{STATUS_LABELS[submission.status]}]
            </span>
          </div>
          <div style={{ height: '2px', background: 'linear-gradient(90deg, var(--color-primary), transparent)', width: '150px' }} />
          <p style={{ color: 'var(--color-text-dim)', marginTop: '0.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
            &gt; View submission details and dispute status
          </p>
        </header>

        <section style={{ marginBottom: '1.5rem', flexShrink: 0 }}>
          <h2 style={{
            fontFamily: 'var(--font-display)',
            fontSize: '0.9rem',
            color: 'var(--color-text)',
            marginBottom: '1rem',
            letterSpacing: '0.05em'
          }}>
            SUBMISSION_PROGRESS
          </h2>
          <Timeline steps={timelineSteps} />
        </section>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <section style={{
              background: 'linear-gradient(135deg, rgba(17, 17, 17, 0.9), rgba(10, 10, 10, 0.95))',
              border: '1px solid var(--color-bg-light)',
              padding: '1rem'
            }}>
              <h3 style={{
                fontFamily: 'var(--font-display)',
                fontSize: '0.9rem',
                color: 'var(--color-secondary)',
                marginBottom: '1rem',
                letterSpacing: '0.05em'
              }}>
                POC_METADATA
              </h3>
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.85rem'
              }}>
                <div>
                  <label style={{ color: 'var(--color-text-dim)', display: 'block', marginBottom: '0.25rem' }}>
                    COMMIT_HASH
                  </label>
                  <span style={{ color: 'var(--color-secondary)', wordBreak: 'break-all' }}>
                    {submission.commitHash}
                  </span>
                </div>
                <div>
                  <label style={{ color: 'var(--color-text-dim)', display: 'block', marginBottom: '0.25rem' }}>
                    AUDITOR
                  </label>
                  <span style={{ color: 'var(--color-text)' }}>
                    {submission.auditor}
                  </span>
                </div>
                <div>
                  <label style={{ color: 'var(--color-text-dim)', display: 'block', marginBottom: '0.25rem' }}>
                    PROJECT_ID
                  </label>
                  <Link
                    to="/explorer"
                    style={{ color: 'var(--color-primary)', textDecoration: 'none' }}
                  >
                    #{submission.projectId.toString()}
                  </Link>
                </div>
                {project && (
                  <div>
                    <label style={{ color: 'var(--color-text-dim)', display: 'block', marginBottom: '0.25rem' }}>
                      TARGET_CONTRACT
                    </label>
                    <span style={{ color: 'var(--color-secondary)', fontSize: '0.8rem' }}>
                      {project.targetContract}
                    </span>
                  </div>
                )}
              </div>
            </section>

            <section style={{
              background: 'linear-gradient(135deg, rgba(17, 17, 17, 0.9), rgba(10, 10, 10, 0.95))',
              border: '1px solid var(--color-bg-light)',
              padding: '1.5rem'
            }}>
              <h3 style={{
                fontFamily: 'var(--font-display)',
                fontSize: '0.9rem',
                color: 'var(--color-secondary)',
                marginBottom: '1rem',
                letterSpacing: '0.05em'
              }}>
                TIMESTAMPS
              </h3>
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.85rem'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--color-text-dim)' }}>COMMITTED</span>
                  <span style={{ color: 'var(--color-text)' }}>
                    {formatTimestamp(submission.commitTimestamp)}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--color-text-dim)' }}>REVEALED</span>
                  <span style={{ color: submission.revealTimestamp > 0n ? 'var(--color-text)' : 'var(--color-text-dim)' }}>
                    {formatTimestamp(submission.revealTimestamp)}
                  </span>
                </div>
                {submission.disputeDeadline > 0n && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--color-text-dim)' }}>DISPUTE_DEADLINE</span>
                    <span style={{ color: 'var(--color-text)' }}>
                      {formatTimestamp(submission.disputeDeadline)}
                    </span>
                  </div>
                )}
              </div>
            </section>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <section style={{
              background: 'linear-gradient(135deg, rgba(17, 17, 17, 0.9), rgba(10, 10, 10, 0.95))',
              border: submission.status >= 2 ? '1px solid var(--color-primary)' : '1px solid var(--color-bg-light)',
              padding: '1.5rem'
            }}>
              <h3 style={{
                fontFamily: 'var(--font-display)',
                fontSize: '0.9rem',
                color: 'var(--color-primary)',
                marginBottom: '1rem',
                letterSpacing: '0.05em'
              }}>
                VERIFICATION_RESULT
              </h3>

              {submission.status < 2 ? (
                <div style={{
                  textAlign: 'center',
                  padding: '2rem',
                  color: 'var(--color-text-dim)',
                  fontFamily: 'var(--font-mono)'
                }}>
                  <p>&gt; Pending verification...</p>
                  <p style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>
                    Results will appear after CRE workflow execution
                  </p>
                </div>
              ) : (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1.25rem',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.85rem'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--color-text-dim)' }}>SEVERITY</span>
                    <SeverityBadge severity={submission.severity} />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--color-text-dim)' }}>DRAIN_AMOUNT</span>
                    <span style={{ color: 'var(--color-secondary)' }}>
                      {formatEther(submission.drainAmountWei)} ETH
                    </span>
                  </div>

                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    paddingTop: '1rem',
                    borderTop: '1px solid var(--color-bg-light)'
                  }}>
                    <span style={{ color: 'var(--color-text-dim)' }}>PAYOUT</span>
                    <span style={{
                      color: submission.payoutAmount > 0n ? 'var(--color-primary)' : 'var(--color-text-dim)',
                      fontWeight: submission.payoutAmount > 0n ? 'bold' : 'normal',
                      fontSize: submission.payoutAmount > 0n ? '1rem' : '0.85rem'
                    }}>
                      {submission.payoutAmount > 0n ? `${formatEther(submission.payoutAmount)} ETH` : 'N/A'}
                    </span>
                  </div>

                  <div style={{
                    marginTop: '0.5rem',
                    padding: '0.75rem',
                    background: submission.status === 5
                      ? 'rgba(255, 0, 60, 0.1)'
                      : submission.challenged
                        ? 'rgba(255, 0, 60, 0.1)'
                        : 'rgba(0, 255, 157, 0.1)',
                    border: `1px solid ${submission.status === 5
                      ? 'var(--color-error)'
                      : submission.challenged
                        ? 'var(--color-error)'
                        : 'var(--color-primary)'}`,
                    textAlign: 'center'
                  }}>
                    <span style={{
                      color: submission.status === 5
                        ? 'var(--color-error)'
                        : submission.challenged
                          ? 'var(--color-error)'
                          : 'var(--color-primary)',
                      fontWeight: 'bold',
                      letterSpacing: '0.05em'
                    }}>
                      {submission.status === 5 ? '[ INVALID ]' : submission.challenged ? '[ DISPUTED ]' : '[ VALID ]'}
                    </span>
                  </div>
                </div>
              )}
            </section>

            <section className={`dispute-panel ${submission.challenged ? 'challenged' : ''}`}>
              <h3 style={{
                fontFamily: 'var(--font-display)',
                fontSize: '0.9rem',
                color: submission.challenged ? 'var(--color-error)' : 'var(--color-text)',
                marginBottom: '1rem',
                letterSpacing: '0.05em'
              }}>
                {submission.challenged ? 'ACTIVE_DISPUTE' : 'DISPUTE_PANEL'}
              </h3>

              {submission.status === 4 ? (
                <div style={{
                  textAlign: 'center',
                  padding: '1rem',
                  color: 'var(--color-text-dim)',
                  fontFamily: 'var(--font-mono)'
                }}>
                  <p style={{ color: 'var(--color-primary)' }}>[ FINALIZED ]</p>
                  <p style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>
                    No further actions available
                  </p>
                </div>
              ) : submission.challenged ? (
                <>
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.85rem',
                    marginBottom: '1rem'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--color-text-dim)' }}>CHALLENGER</span>
                      <span style={{ color: 'var(--color-error)' }}>
                        {submission.challenger.slice(0, 8)}...{submission.challenger.slice(-6)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--color-text-dim)' }}>BOND_AMOUNT</span>
                      <span style={{ color: 'var(--color-secondary)' }}>
                        {formatEther(submission.challengeBond)} ETH
                      </span>
                    </div>
                  </div>

                  {canResolve ? (
                    <>
                      <p style={{
                        color: 'var(--color-text-dim)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.8rem',
                        marginBottom: '1rem'
                      }}>
                        &gt; As project owner, you can resolve this dispute:
                      </p>
                      <div className="dispute-actions">
                        <button
                          className="btn-accept"
                          onClick={() => handleResolve(false)}
                          disabled={actionLoading !== null}
                        >
                          {actionLoading === 'accept' ? (
                            <><span className="spinner" style={{ width: '12px', height: '12px', marginRight: '0.5rem' }} /> ACCEPTING...</>
                          ) : 'ACCEPT (Uphold Result)'}
                        </button>
                        <button
                          className="btn-reject"
                          onClick={() => handleResolve(true)}
                          disabled={actionLoading !== null}
                        >
                          {actionLoading === 'reject' ? (
                            <><span className="spinner" style={{ width: '12px', height: '12px', marginRight: '0.5rem' }} /> REJECTING...</>
                          ) : 'REJECT (Overturn)'}
                        </button>
                      </div>
                    </>
                  ) : (
                    <p style={{
                      color: 'var(--color-text-dim)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.8rem'
                    }}>
                      &gt; Awaiting resolution from project owner
                    </p>
                  )}
                </>
              ) : canChallenge ? (
                <>
                  <p style={{
                    color: 'var(--color-text-dim)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.8rem',
                    marginBottom: '1rem'
                  }}>
                    &gt; Challenge this verification result if you believe it's incorrect.
                    Requires a bond of {project ? formatEther(project.maxPayoutPerBug / 10n) : '0'} ETH.
                  </p>
                  <button
                    className="btn-challenge"
                    onClick={handleChallenge}
                    disabled={actionLoading !== null}
                  >
                    {actionLoading === 'challenge' ? (
                      <><span className="spinner" style={{ width: '12px', height: '12px', marginRight: '0.5rem' }} /> CHALLENGING...</>
                    ) : '[ CHALLENGE RESULT ]'}
                  </button>
                </>
              ) : canFinalize && isProjectOwner ? (
                <>
                  <p style={{
                    color: 'var(--color-text-dim)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.8rem',
                    marginBottom: '1rem'
                  }}>
                    &gt; Dispute window has passed. Finalize to release payout.
                  </p>
                  <button
                    className="btn-accept"
                    onClick={handleFinalize}
                    disabled={actionLoading !== null}
                  >
                    {actionLoading === 'finalize' ? (
                      <><span className="spinner" style={{ width: '12px', height: '12px', marginRight: '0.5rem' }} /> FINALIZING...</>
                    ) : '[ FINALIZE PAYOUT ]'}
                  </button>
                </>
              ) : (
                <p style={{
                  color: 'var(--color-text-dim)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.8rem'
                }}>
                  &gt; No dispute actions available
                  {!isConnected && ' (Connect wallet to challenge)'}
                </p>
              )}
            </section>
          </div>
        </div>

        <div style={{ marginTop: '3rem', textAlign: 'center' }}>
          <Link
            to="/explorer"
            style={{
              color: 'var(--color-primary)',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.85rem',
              textDecoration: 'none',
              border: '1px solid var(--color-primary)',
              padding: '0.75rem 1.5rem',
              display: 'inline-block',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--color-primary)'
              e.currentTarget.style.color = 'var(--color-bg)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = 'var(--color-primary)'
            }}
          >
            [ BACK TO EXPLORER ]
          </Link>
        </div>
      </div>
    </div>
  )
}

export default SubmissionDetail
