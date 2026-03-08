import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { formatEther } from 'viem'
import { BOUNTY_HUB_ADDRESS, BOUNTY_HUB_V2_ABI, CHAIN } from '../config'
import { readProjectById } from '../lib/projectReads'
import { readContractWithRpcFallback } from '../lib/publicClient'
import { readStoredPoCPreview, resolveSapphireTxHash } from '../lib/oasisUpload'
import { readSubmissionCommitTxHash } from '../lib/submissionArtifacts'
import { Timeline } from '../components/shared/Timeline'
import { getSubmissionTimeline } from '../components/shared/submissionTimeline'
import { SeverityBadge } from '../components/shared/SeverityBadge'
import { getActualStatus } from '../lib/status'
import { MetaRow, NeonPanel, PageHeader, StatusBanner } from '../components/shared/ui-primitives'
import { useWallet } from '../hooks/useWallet'
import { publicClient } from '../lib/publicClient'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { explorerAddressUrl, explorerTxUrl } from '@/lib/explorerLinks'
import type { Project, ExtendedSubmission } from '../types'
import { VERDICT_SOURCE_LABELS, FINAL_VALIDITY_LABELS, STATUS_LABELS } from '../types'


const SUBMISSION_STATUS_VERIFIED = 2
const SUBMISSION_STATUS_DISPUTED = 3
const SUBMISSION_STATUS_FINALIZED = 4
const SUBMISSION_STATUS_INVALID = 5
const MIN_CHALLENGE_BOND_WEI = 10_000_000_000_000_000n

export function SubmissionDetail() {
  const { id } = useParams<{ id: string }>()
  const { address, walletClient, isConnected } = useWallet({ autoSwitchToSepolia: false })
  const [submission, setSubmission] = useState<ExtendedSubmission | null>(null)
  const [project, setProject] = useState<Project | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [previewContent, setPreviewContent] = useState<string | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const requestIdRef = useRef(0)

  const refreshSubmissionData = useCallback(async (submissionId: bigint, requestId?: number) => {
    const [subData, lifecycleData, juryData, groupingData] = await Promise.all([
      readContractWithRpcFallback({
        address: BOUNTY_HUB_ADDRESS,
        abi: BOUNTY_HUB_V2_ABI,
        functionName: 'submissions',
        args: [submissionId]
      }) as Promise<any>,
      readContractWithRpcFallback({
        address: BOUNTY_HUB_ADDRESS,
        abi: BOUNTY_HUB_V2_ABI,
        functionName: 'getSubmissionLifecycle',
        args: [submissionId]
      }).catch(() => null) as Promise<any>,
      readContractWithRpcFallback({
        address: BOUNTY_HUB_ADDRESS,
        abi: BOUNTY_HUB_V2_ABI,
        functionName: 'getSubmissionJuryMetadata',
        args: [submissionId]
      }).catch(() => null) as Promise<any>,
      readContractWithRpcFallback({
        address: BOUNTY_HUB_ADDRESS,
        abi: BOUNTY_HUB_V2_ABI,
        functionName: 'getSubmissionGroupingMetadata',
        args: [submissionId]
      }).catch(() => null) as Promise<any>
    ]);

    const fetchedSubmission: ExtendedSubmission = {
      id: submissionId,
      auditor: subData[0],
      projectId: subData[1],
      commitHash: subData[2],
      cipherURI: subData[3],
      salt: subData[4],
      commitTimestamp: subData[5],
      revealTimestamp: subData[6],
      status: subData[7],
      drainAmountWei: subData[8],
      severity: subData[9],
      payoutAmount: subData[10],
      disputeDeadline: subData[11],
      challenged: subData[12],
      challenger: subData[13],
      challengeBond: subData[14],
      lifecycle: lifecycleData ? {
        status: lifecycleData[0],
        juryDeadline: lifecycleData[1],
        adjudicationDeadline: lifecycleData[2],
        verdictSource: lifecycleData[3],
        finalValidity: lifecycleData[4],
        juryLedgerDigest: lifecycleData[5],
        ownerTestimonyDigest: lifecycleData[6]
      } : undefined,
      jury: juryData && juryData[0] ? { action: juryData[1], rationale: juryData[2] } : undefined,
      grouping: groupingData && groupingData[0] ? { cohort: groupingData[1], groupId: groupingData[2], groupRank: Number(groupingData[3]), groupSize: Number(groupingData[4]) } : undefined
    }

    if (requestId !== undefined && requestIdRef.current !== requestId) {
      return
    }

    const [fetchedProject, commitTxHash, sapphireTxHash] = await Promise.all([
      readProjectById(fetchedSubmission.projectId).catch((err) => {
        console.warn('Failed to fetch project:', err)
        return null
      }),
      readSubmissionCommitTxHash(submissionId).catch((err) => {
        console.warn('Failed to fetch commit tx hash:', err)
        return undefined
      }),
      resolveSapphireTxHash({
        cipherURI: fetchedSubmission.cipherURI,
        auditor: fetchedSubmission.auditor,
      }).catch((err) => {
        console.warn('Failed to resolve sapphire tx hash:', err)
        return undefined
      }),
    ])

    if (requestId !== undefined && requestIdRef.current !== requestId) {
      return
    }

    setSubmission({
      ...fetchedSubmission,
      commitTxHash,
      oasisTxHash: sapphireTxHash,
    })
    setProject(fetchedProject)
  }, [])

  const handlePreviewPoC = useCallback(async () => {
    if (!submission) return

    setPreviewLoading(true)
    setPreviewError(null)

    try {
      const preview = await readStoredPoCPreview({
        cipherURI: submission.cipherURI,
        fallbackAuditor: submission.auditor,
        ethereumProvider: walletClient,
      })
      setPreviewContent(JSON.stringify(preview.poc, null, 2))
    } catch (err) {
      setPreviewContent(null)
      setPreviewError(err instanceof Error ? err.message : String(err))
    } finally {
      setPreviewLoading(false)
    }
  }, [submission, walletClient])

  useEffect(() => {
    if (!id) return

    const fetchData = async () => {
      const submissionId = BigInt(id)
      const requestId = ++requestIdRef.current

      try {
        setIsLoading(true)
        setError(null)
        setSubmission(null)
        setProject(null)
        await refreshSubmissionData(submissionId, requestId)
      } catch (err) {
        console.error('Failed to fetch submission:', err)
        if (requestIdRef.current !== requestId) {
          return
        }

        setError('Failed to load submission from blockchain')
      } finally {
        if (requestIdRef.current === requestId) {
          setIsLoading(false)
        }
      }
    }

    void fetchData()
  }, [id, refreshSubmissionData])

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
      const now = BigInt(Math.floor(Date.now() / 1000))
      if (submission.disputeDeadline === 0n || now > submission.disputeDeadline) {
        setError('Dispute window has closed for this submission')
        return
      }

      const challengeBond = MIN_CHALLENGE_BOND_WEI

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
      await refreshSubmissionData(submission.id)
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
      await refreshSubmissionData(submission.id)
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
      await refreshSubmissionData(submission.id)
    } catch (err) {
      console.error('Finalize failed:', err)
      setError('Failed to finalize submission')
    } finally {
      setActionLoading(null)
    }
  }

  const now = BigInt(Math.floor(Date.now() / 1000))
  const challengeBond = MIN_CHALLENGE_BOND_WEI
  const actualStatus = submission ? getActualStatus(submission.status, submission.lifecycle?.status) : undefined;
  const hasActiveDispute = actualStatus === SUBMISSION_STATUS_DISPUTED
  const disputeWindowOpen = Boolean(submission && submission.disputeDeadline > 0n && submission.disputeDeadline >= now)
  const disputeWindowClosed = Boolean(submission && submission.disputeDeadline > 0n && now > submission.disputeDeadline)
  const isProjectOwner = Boolean(project && address && project.owner.toLowerCase() === address.toLowerCase())
  const canChallenge = Boolean(
    actualStatus === SUBMISSION_STATUS_VERIFIED &&
    !submission?.challenged &&
    disputeWindowOpen &&
    isConnected,
  )
  const canResolve = Boolean(
    hasActiveDispute &&
    submission?.challenged &&
    isProjectOwner &&
    disputeWindowOpen,
  )
  const canFinalize = Boolean(
    submission &&
    (actualStatus === SUBMISSION_STATUS_VERIFIED || actualStatus === SUBMISSION_STATUS_DISPUTED) &&
    disputeWindowClosed &&
    isConnected,
  )

  const getStatusBadgeVariant = (): 'success' | 'error' | 'warning' | 'info' => {
    if (actualStatus === SUBMISSION_STATUS_INVALID) return 'error'
    if (hasActiveDispute) return 'error'
    if (actualStatus === SUBMISSION_STATUS_FINALIZED) return 'success'
    if (actualStatus === SUBMISSION_STATUS_VERIFIED) return 'success'
    if (actualStatus === 1) return 'info'
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

  if (!submission) {
    return (
      <div className="min-h-[calc(100vh-142px)] flex flex-col py-6">
        <div className="container flex-1 flex flex-col min-h-0">
          <PageHeader
            title={`SUBMISSION_#${id ?? 'UNKNOWN'}`}
            subtitle="> View submission details and dispute status"
            suffix={<Badge variant="error">[ERROR]</Badge>}
          />

          <StatusBanner variant="error" className="max-w-md mx-auto w-full" message={`> ERROR: ${error || 'Submission not found'}`} />

          <div className="mt-8 text-center">
            <Link to="/explorer">
              <Button variant="outline" className="border-[var(--color-primary)] text-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-[var(--color-bg)]">
                [ BACK TO EXPLORER ]
              </Button>
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
    hasActiveDispute,
    submission.lifecycle?.status
  )

  return (
    <div className="min-h-[calc(100vh-142px)] flex flex-col py-6">
      <div className="container flex-1 flex flex-col min-h-0 overflow-y-auto">
        <PageHeader
          title={`SUBMISSION_#${id}`}
          subtitle="> View submission details and dispute status"
          suffix={<Badge variant={getStatusBadgeVariant()}>[{STATUS_LABELS[actualStatus as number]}]</Badge>}
        />

        {error && (
          <StatusBanner
            variant='error'
            className="mb-4"
            message={error}
          />
        )}

        <section className="mb-6 flex-shrink-0">
          <h2 className="font-mono text-sm text-[var(--color-text)] mb-4 tracking-wider">
            SUBMISSION_PROGRESS
          </h2>
          <Timeline steps={timelineSteps} />
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1">
          <div className="flex flex-col gap-6">
            <NeonPanel className="border-[var(--color-bg-light)]" contentClassName="space-y-4 font-mono text-sm p-4">
              <h2 className="text-sm font-mono text-[var(--color-secondary)] tracking-wider">
                POC_METADATA
              </h2>
              <div className="space-y-4">
                {submission.commitTxHash && (
                  <MetaRow
                    label="SEPOLIA_COMMIT_TX"
                    value={
                      <a
                        href={explorerTxUrl(submission.commitTxHash)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[var(--color-secondary)] break-all hover:underline"
                      >
                        {submission.commitTxHash}
                      </a>
                    }
                  />
                )}
                {submission.oasisTxHash && (
                  <MetaRow
                    label="SAPPHIRE_TX"
                    value={
                      <a
                        href={`https://explorer.oasis.io/testnet/sapphire/tx/${submission.oasisTxHash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[var(--color-secondary)] break-all hover:underline"
                      >
                        {submission.oasisTxHash}
                      </a>
                    }
                  />
                )}
                <MetaRow
                  label="AUDITOR"
                  value={
                    <a
                      href={explorerAddressUrl(submission.auditor)}
                      target="_blank"
                      rel="noreferrer"
                      className="break-all hover:underline"
                    >
                      {submission.auditor}
                    </a>
                  }
                />
                <MetaRow
                  label="PROJECT_ID"
                  value={<Link to="/explorer" className="text-[var(--color-primary)] hover:underline">#{submission.projectId.toString()}</Link>}
                />
                {project && (
                  <MetaRow
                    label="TARGET_CONTRACT"
                    value={
                      <a
                        href={explorerAddressUrl(project.targetContract)}
                        target="_blank"
                        rel="noreferrer"
                        className="break-all hover:underline"
                      >
                        {project.targetContract}
                      </a>
                    }
                    valueClassName="text-[var(--color-secondary)] text-xs"
                  />
                )}
              </div>
            </NeonPanel>

            <NeonPanel className="border-[var(--color-bg-light)]" contentClassName="space-y-3 font-mono text-sm p-4">
              <h2 className="text-sm font-mono text-[var(--color-secondary)] tracking-wider">
                TIMESTAMPS
              </h2>
              <div className="space-y-3">
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
              </div>
            </NeonPanel>

            <NeonPanel className="border-[var(--color-bg-light)]" contentClassName="space-y-3 font-mono text-sm p-4">
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-sm font-mono text-[var(--color-secondary)] tracking-wider">
                  POC_PREVIEW
                </h2>
                <Button type="button" variant="outline" onClick={handlePreviewPoC} disabled={previewLoading} className="font-mono btn-cyber">
                  {previewLoading ? '[ LOADING_POC... ]' : '[ VIEW_POC ]'}
                </Button>
              </div>
              {previewError ? (
                <StatusBanner variant="error" message={previewError} />
              ) : previewContent ? (
                <pre className="bg-neutral-900/80 p-3 border border-primary/20 rounded-md overflow-auto text-xs text-primary max-h-[240px] whitespace-pre-wrap">
                  {previewContent}
                </pre>
              ) : (
                <p className="text-[var(--color-text-dim)]">Load the Sapphire-stored PoC payload for this submission.</p>
              )}
            </NeonPanel>
          </div>

          <div className="flex flex-col gap-6">
            <NeonPanel tone={submission.status >= 2 ? 'primary' : 'default'} contentClassName="p-4">
              <h2 className="text-sm font-mono text-[var(--color-primary)] tracking-wider mb-3">
                VERIFICATION_RESULT
              </h2>
                {submission.status < 2 ? (
                  <StatusBanner
                    variant="info"
                    className="mt-4"
                    message={
                      <div className="text-center py-4 text-[var(--color-text-dim)] font-mono">
                        <p>&gt; Pending verification...</p>
                        <p className="text-xs mt-2">Results will appear after CRE workflow execution</p>
                      </div>
                    }
                  />
                ) : (
                  <div className="space-y-4 font-mono text-sm">
                    <MetaRow label="SEVERITY" value={<SeverityBadge severity={submission.severity} />} inline />

                    <MetaRow
                      label="DRAIN_AMOUNT"
                      value={`${formatEther(submission.drainAmountWei)} ETH`}
                      inline
                      valueClassName="text-[var(--color-secondary)]"
                    />

                    <div className="flex justify-between pt-4 border-t border-[var(--color-bg-light)]">
                      <span className="text-[var(--color-text-dim)]">PAYOUT</span>
                      <span className={`${submission.payoutAmount > 0n ? 'text-[var(--color-primary)] font-bold text-base' : 'text-[var(--color-text-dim)]'}`}>
                        {submission.payoutAmount > 0n ? `${formatEther(submission.payoutAmount)} ETH` : 'N/A'}
                      </span>
                    </div>

                    <StatusBanner
                      className="mt-4"
                      variant={actualStatus === SUBMISSION_STATUS_INVALID || hasActiveDispute ? 'error' : (actualStatus === 6 || actualStatus === 7) ? 'warning' : 'success'}
                      message={
                        <span className="font-bold tracking-wider">
                          {actualStatus === SUBMISSION_STATUS_INVALID ? '[ INVALID ]' : hasActiveDispute ? '[ DISPUTED ]' : (actualStatus === 6 || actualStatus === 7) ? '[ PENDING REVIEW ]' : '[ VALID ]'}
                        </span>
                      }
                    />

                                        {submission.lifecycle && (
                      <div className="pt-4 border-t border-[var(--color-bg-light)]">
                        <h3 className="text-xs font-mono text-[var(--color-secondary)] mb-3 tracking-wider">LIFECYCLE_METADATA</h3>
                        <div className="space-y-3">
                          <MetaRow label="STATUS" value={STATUS_LABELS[submission.lifecycle.status]} inline />
                          <MetaRow label="VERDICT_SOURCE" value={VERDICT_SOURCE_LABELS[submission.lifecycle.verdictSource]} inline />
                          <MetaRow label="FINAL_VALIDITY" value={FINAL_VALIDITY_LABELS[submission.lifecycle.finalValidity]} inline />
                          {submission.lifecycle.juryDeadline > 0n && (
                            <MetaRow label="JURY_DEADLINE" value={new Date(Number(submission.lifecycle.juryDeadline) * 1000).toLocaleString()} inline />
                          )}
                          {submission.lifecycle.adjudicationDeadline > 0n && (
                            <MetaRow label="ADJ_DEADLINE" value={new Date(Number(submission.lifecycle.adjudicationDeadline) * 1000).toLocaleString()} inline />
                          )}
                        </div>
                      </div>
                    )}
                    {submission.grouping && (
                      <div className="pt-4 border-t border-[var(--color-bg-light)]">
                        <h3 className="text-xs font-mono text-[var(--color-secondary)] mb-3 tracking-wider">GROUPING_METADATA</h3>
                        <div className="space-y-3">
                          <MetaRow label="COHORT" value={submission.grouping.cohort} inline />
                          <MetaRow label="GROUP_ID" value={submission.grouping.groupId} inline valueClassName="text-[0.65rem] break-all text-[var(--color-text-dim)]" />
                          <MetaRow label="RANK_IN_GROUP" value={`${submission.grouping.groupRank} of ${submission.grouping.groupSize}`} inline />
                        </div>
                      </div>
                    )}

                    {submission.jury && (
                      <div className="pt-4 border-t border-[var(--color-bg-light)]">
                        <h3 className="text-xs font-mono text-[var(--color-secondary)] mb-3 tracking-wider">JURY_OUTPUT</h3>
                        <div className="space-y-3">
                          <MetaRow label="ACTION" value={submission.jury.action} inline />
                          {submission.jury.rationale && (
                            <MetaRow label="RATIONALE" value={submission.jury.rationale} valueClassName="whitespace-normal mt-1 block text-[var(--color-text-dim)]" />
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
            </NeonPanel>

            <NeonPanel tone={hasActiveDispute ? 'error' : 'default'} contentClassName="p-4">
              <h2 className={`text-sm font-mono tracking-wider mb-3 ${hasActiveDispute ? 'text-[var(--color-error)]' : 'text-[var(--color-text)]'}`}>
                {hasActiveDispute ? 'ACTIVE_DISPUTE' : 'DISPUTE_PANEL'}
              </h2>
                {actualStatus === SUBMISSION_STATUS_FINALIZED ? (
                  <div className="text-center py-4 text-[var(--color-text-dim)] font-mono">
                    <p className="text-[var(--color-primary)]">[ FINALIZED ]</p>
                    <p className="text-xs mt-2">No further actions available</p>
                  </div>
                ) : hasActiveDispute ? (
                  <>
                    <div className="space-y-3 font-mono text-sm mb-4">
                      <div className="flex justify-between">
                        <span className="text-[var(--color-text-dim)]">CHALLENGER</span>
                        <span className="text-[var(--color-error)]">
                          <a
                            href={explorerAddressUrl(submission.challenger)}
                            target="_blank"
                            rel="noreferrer"
                            className="hover:underline"
                          >
                            {submission.challenger.slice(0, 8)}...{submission.challenger.slice(-6)}
                          </a>
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
                    ) : canFinalize ? (
                      <>
                        <p className="text-[var(--color-text-dim)] font-mono text-xs mb-4">
                          &gt; Dispute window has passed without resolution. Any connected address can finalize payout.
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
                        &gt; Awaiting resolution from project owner
                        {!isConnected && ' (Connect wallet to finalize if timeout is reached)'}
                      </p>
                    )}
                  </>
                ) : canChallenge ? (
                  <>
                    <p className="text-[var(--color-text-dim)] font-mono text-xs mb-4">
                      &gt; Challenge this verification result if you believe it's incorrect.
                      Requires a minimum bond of {formatEther(challengeBond)} ETH.
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
                ) : canFinalize ? (
                  <>
                    <p className="text-[var(--color-text-dim)] font-mono text-xs mb-4">
                      &gt; Dispute window has passed. Any connected address can finalize payout.
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
                    {!isConnected && ' (Connect wallet to interact)'}
                  </p>
                )}
            </NeonPanel>
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
