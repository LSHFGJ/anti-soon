import { useState, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { formatEther, createPublicClient, http, parseAbiItem, type Address } from 'viem'
import { BOUNTY_HUB_ADDRESS, BOUNTY_HUB_V2_ABI, CHAIN } from '../config'
import { StatCard } from '../components/shared/StatCard'
import { CountdownTimer } from '../components/shared/CountdownTimer'
import { SeverityBadge } from '../components/shared/SeverityBadge'
import { STATUS_LABELS, type Project, type Submission, type ProjectRules } from '../types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

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

type RulesTuple = readonly [
  maxAttackerSeedWei: bigint,
  maxWarpSeconds: bigint,
  allowImpersonation: boolean,
  thresholds: {
    criticalDrainWei: bigint
    highDrainWei: bigint
    mediumDrainWei: bigint
    lowDrainWei: bigint
  }
]

const publicClient = createPublicClient({
  chain: CHAIN,
  transport: http()
})

function ProjectDetailSkeleton() {
  return (
    <div className="py-8">
      <div className="container max-w-6xl mx-auto px-4">
        <Skeleton className="h-4 w-32 mb-4" />
        <div className="flex items-center gap-4 mb-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-6 w-20" />
        </div>
        <Skeleton className="h-1 w-48 mb-8" />
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="bg-[#111]/80 border-[#1a1a1a]">
              <CardContent className="p-4">
                <Skeleton className="h-4 w-20 mb-2" />
                <Skeleton className="h-6 w-28" />
              </CardContent>
            </Card>
          ))}
        </div>
        
        <Card className="bg-[#111]/80 border-[#1a1a1a] mb-8">
          <CardHeader>
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-6">
              {[1, 2].map((i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-8 w-full" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-[#111]/80 border-[#1a1a1a]">
          <CardHeader>
            <Skeleton className="h-6 w-40" />
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-6 w-20" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export function ProjectDetail() {
  const { id } = useParams<{ id: string }>()
  const projectId = BigInt(id ?? '0')
  
  const [project, setProject] = useState<Project | null>(null)
  const [rules, setRules] = useState<ProjectRules | null>(null)
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchProject = useCallback(async () => {
    if (!id) return
    
    try {
      setIsLoading(true)
      setError(null)
      
      const data = await publicClient.readContract({
        address: BOUNTY_HUB_ADDRESS,
        abi: BOUNTY_HUB_V2_ABI,
        functionName: 'projects',
        args: [projectId]
      }) as ProjectTuple

      const fetchedProject: Project = {
        id: projectId,
        owner: data[0],
        bountyPool: data[1],
        maxPayoutPerBug: data[2],
        targetContract: data[3],
        forkBlock: data[4],
        active: data[5],
        mode: data[6],
        commitDeadline: data[7],
        revealDeadline: data[8],
        disputeWindow: data[9],
        rulesHash: data[10]
      }
      
      setProject(fetchedProject)
      
      const rulesData = await publicClient.readContract({
        address: BOUNTY_HUB_ADDRESS,
        abi: BOUNTY_HUB_V2_ABI,
        functionName: 'projectRules',
        args: [projectId]
      }) as RulesTuple
      
      setRules({
        maxAttackerSeedWei: rulesData[0],
        maxWarpSeconds: rulesData[1],
        allowImpersonation: rulesData[2],
        thresholds: rulesData[3]
      })
      
    } catch (err) {
      console.error('Failed to fetch project:', err)
      setError('Failed to load project from blockchain')
    } finally {
      setIsLoading(false)
    }
  }, [id, projectId])

  const fetchSubmissions = useCallback(async () => {
    try {
      const latestBlock = await publicClient.getBlockNumber()
      const fromBlock = latestBlock > 10000n ? latestBlock - 10000n : 0n

      const logs = await publicClient.getLogs({
        address: BOUNTY_HUB_ADDRESS,
        event: parseAbiItem('event PoCCommitted(uint256 indexed submissionId, uint256 indexed projectId, address indexed auditor, bytes32 commitHash)'),
        args: { projectId },
        fromBlock,
        toBlock: 'latest'
      })

      const submissionIds = logs.map(log => log.args.submissionId!).filter((v, i, a) => a.indexOf(v) === i)
      
      if (submissionIds.length === 0) {
        setSubmissions([])
        return
      }

      const submissionPromises = submissionIds.map(subId =>
        publicClient.readContract({
          address: BOUNTY_HUB_ADDRESS,
          abi: BOUNTY_HUB_V2_ABI,
          functionName: 'submissions',
          args: [subId]
        })
      )

      const results = await Promise.all(submissionPromises) as SubmissionTuple[]
      const fetchedSubmissions: Submission[] = results.map((data, index) => ({
        id: submissionIds[index],
        auditor: data[0],
        projectId: data[1],
        commitHash: data[2],
        cipherURI: data[3],
        decryptionKey: data[4],
        salt: data[5],
        commitTimestamp: data[6],
        revealTimestamp: data[7],
        status: data[8],
        drainAmountWei: data[9],
        severity: data[10],
        payoutAmount: data[11],
        disputeDeadline: data[12],
        challenged: data[13],
        challenger: data[14],
        challengeBond: data[15]
      }))

      setSubmissions(fetchedSubmissions)
    } catch (err) {
      console.error('Failed to fetch submissions:', err)
      setSubmissions([])
    }
  }, [projectId])

  useEffect(() => {
    fetchProject()
  }, [fetchProject])

  useEffect(() => {
    if (project) {
      fetchSubmissions()
    }
  }, [project, fetchSubmissions])

  const getDeadlineStatus = () => {
    if (!project) return { text: 'UNKNOWN', variant: 'outline' as const }
    const now = BigInt(Math.floor(Date.now() / 1000))
    if (project.commitDeadline === 0n || now < project.commitDeadline) {
      return { text: 'COMMIT OPEN', variant: 'success' as const }
    }
    if (project.revealDeadline === 0n || now < project.revealDeadline) {
      return { text: 'REVEAL PHASE', variant: 'info' as const }
    }
    return { text: 'CLOSED', variant: 'error' as const }
  }

  const formatTimestamp = (timestamp: bigint) => {
    if (timestamp === 0n) return 'N/A'
    return new Date(Number(timestamp) * 1000).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatAddress = (addr: Address) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`
  }

  const getStatusVariant = (status: number): "success" | "error" | "warning" | "info" | "outline" => {
    if (status <= 1) return 'success'
    if (status === 5) return 'error'
    if (status === 3) return 'warning'
    return 'info'
  }

  if (isLoading) {
    return <ProjectDetailSkeleton />
  }

  if (error || !project) {
    return (
      <div className="py-8">
        <div className="container max-w-6xl mx-auto px-4">
          <Card className="bg-[#ff003c]/10 border-[#ff003c]/50 text-[#ff003c]">
            <CardContent className="p-8 text-center">
              <p className="font-mono text-lg mb-4">
                ERROR: {error || 'Project not found'}
              </p>
              <Link 
                to="/explorer" 
                className="text-[#00ff9d] hover:text-[#00ff9d]/80 font-mono transition-colors"
              >
                [← Back to Explorer]
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  const deadlineStatus = getDeadlineStatus()

  return (
    <div className="py-8">
      <div className="container max-w-6xl mx-auto px-4">
        <header className="mb-8">
          <Link 
            to="/explorer" 
            className="inline-flex items-center gap-2 text-[#888] hover:text-[#00ff9d] font-mono text-xs uppercase tracking-wider transition-colors mb-4"
          >
            <span>←</span> Back to Explorer
          </Link>
          
          <div className="flex items-center gap-4 mb-2">
            <h1 className="text-2xl font-display font-bold uppercase tracking-widest text-[#00ff9d]">
              PROJECT #{project.id.toString()}
            </h1>
            <Badge variant={project.mode === 0 ? 'unique' : 'multi'}>
              {project.mode === 0 ? 'UNIQUE' : 'MULTI'}
            </Badge>
          </div>
          
          <div className="h-[2px] w-48 bg-gradient-to-r from-[#00ff9d] to-transparent mb-4" />
          
          <div className="flex items-center gap-6 font-mono text-sm">
            <Badge variant={deadlineStatus.variant}>
              {deadlineStatus.text}
            </Badge>
            <span className="text-[#888]">
              TARGET: <span className="text-[#00f0ff]">{formatAddress(project.targetContract)}</span>
            </span>
          </div>
        </header>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatCard 
            label="BOUNTY POOL" 
            value={`${formatEther(project.bountyPool)} ETH`}
            color="var(--color-primary)"
          />
          <StatCard 
            label="MAX PAYOUT" 
            value={`${formatEther(project.maxPayoutPerBug)} ETH`}
            color="var(--color-text)"
          />
          <StatCard 
            label="FORK BLOCK" 
            value={project.forkBlock.toString()}
            color="var(--color-secondary)"
          />
          <StatCard 
            label="SUBMISSIONS" 
            value={submissions.length.toString()}
            color="var(--color-text)"
          />
        </div>

        <Card className="bg-[#111]/80 border-[#1a1a1a] backdrop-blur-sm mb-8">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-display tracking-wide">
              DEADLINES
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <p className="text-[#888] font-mono text-xs uppercase">Commit Deadline</p>
                <p className="font-mono text-sm">{formatTimestamp(project.commitDeadline)}</p>
                <CountdownTimer deadline={project.commitDeadline} />
              </div>
              <div className="space-y-2">
                <p className="text-[#888] font-mono text-xs uppercase">Reveal Deadline</p>
                <p className="font-mono text-sm">{formatTimestamp(project.revealDeadline)}</p>
                <CountdownTimer deadline={project.revealDeadline} />
              </div>
            </div>
          </CardContent>
        </Card>

        {rules && (
          <Card className="bg-[#111]/80 border-[#1a1a1a] backdrop-blur-sm mb-8">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-display tracking-wide">
                RULES & THRESHOLDS
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <p className="text-[#00f0ff] font-mono text-xs mb-3">// EXECUTION_RULES</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 font-mono text-sm">
                  <div>
                    <span className="text-[#888]">MAX_ATTACKER_SEED: </span>
                    <span>{formatEther(rules.maxAttackerSeedWei)} ETH</span>
                  </div>
                  <div>
                    <span className="text-[#888]">MAX_TIME_WARP: </span>
                    <span>{rules.maxWarpSeconds.toString()}s</span>
                  </div>
                  <div>
                    <span className="text-[#888]">IMPERSONATION: </span>
                    <Badge variant={rules.allowImpersonation ? 'success' : 'error'}>
                      {rules.allowImpersonation ? 'ALLOWED' : 'DISABLED'}
                    </Badge>
                  </div>
                  <div>
                    <span className="text-[#888]">DISPUTE_WINDOW: </span>
                    <span>{project.disputeWindow.toString()}s</span>
                  </div>
                </div>
              </div>
              
              <div>
                <p className="text-[#00f0ff] font-mono text-xs mb-3">// SEVERITY_THRESHOLDS</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card className="bg-[#ff003c]/10 border-l-[#ff003c] border-l-2 border-t-0 border-r-0 border-b-0 rounded-none">
                    <CardContent className="p-3">
                      <p className="font-display text-xs text-[#ff003c] mb-1">CRITICAL</p>
                      <p className="font-mono text-sm">&gt; {formatEther(rules.thresholds.criticalDrainWei)} ETH</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-[#ff8800]/10 border-l-[#ff8800] border-l-2 border-t-0 border-r-0 border-b-0 rounded-none">
                    <CardContent className="p-3">
                      <p className="font-display text-xs text-[#ff8800] mb-1">HIGH</p>
                      <p className="font-mono text-sm">&gt; {formatEther(rules.thresholds.highDrainWei)} ETH</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-[#ffff00]/10 border-l-[#ffff00] border-l-2 border-t-0 border-r-0 border-b-0 rounded-none">
                    <CardContent className="p-3">
                      <p className="font-display text-xs text-[#ffff00] mb-1">MEDIUM</p>
                      <p className="font-mono text-sm">&gt; {formatEther(rules.thresholds.mediumDrainWei)} ETH</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-[#88ff88]/10 border-l-[#88ff88] border-l-2 border-t-0 border-r-0 border-b-0 rounded-none">
                    <CardContent className="p-3">
                      <p className="font-display text-xs text-[#88ff88] mb-1">LOW</p>
                      <p className="font-mono text-sm">&gt; {formatEther(rules.thresholds.lowDrainWei)} ETH</p>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {project.active && (
          <div className="mb-8">
            <Link 
              to={`/?project=${project.id.toString()}`}
              className="inline-flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-[#00ff9d] to-[#00cc7d] text-[#0a0a0a] font-display font-bold uppercase tracking-widest text-sm transition-all hover:shadow-[0_0_30px_rgba(0,255,157,0.5)] hover:-translate-y-0.5"
            >
              <span>SUBMIT POC</span>
              <span>→</span>
            </Link>
          </div>
        )}

        <Card className="bg-[#111]/80 border-[#1a1a1a] backdrop-blur-sm mb-8">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-display tracking-wide">
              SUBMISSIONS [{submissions.length}]
            </CardTitle>
          </CardHeader>
          <CardContent>
            {submissions.length === 0 ? (
              <div className="py-12 border border-dashed border-[#333] text-center">
                <p className="font-mono text-[#888] text-sm mb-2">&gt; No submissions yet</p>
                <p className="font-mono text-[#666] text-xs">
                  Be the first to submit a PoC for this project
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto -mx-6">
                <table className="w-full font-mono text-sm">
                  <thead>
                    <tr className="border-b border-[#1a1a1a] text-left">
                      <th className="px-6 py-3 text-[#888] font-normal">ID</th>
                      <th className="px-6 py-3 text-[#888] font-normal">AUDITOR</th>
                      <th className="px-6 py-3 text-[#888] font-normal">STATUS</th>
                      <th className="px-6 py-3 text-[#888] font-normal">SEVERITY</th>
                      <th className="px-6 py-3 text-[#888] font-normal">DRAIN</th>
                      <th className="px-6 py-3 text-[#888] font-normal">PAYOUT</th>
                      <th className="px-6 py-3 text-[#888] font-normal">COMMITTED</th>
                    </tr>
                  </thead>
                  <tbody>
                    {submissions.map((sub) => (
                      <tr 
                        key={sub.id.toString()}
                        className="border-b border-[#1a1a1a] hover:bg-[#00ff9d]/5 transition-colors"
                      >
                        <td className="px-6 py-3 text-[#888]">
                          #{sub.id.toString()}
                        </td>
                        <td className="px-6 py-3 text-[#00f0ff]">
                          {formatAddress(sub.auditor)}
                        </td>
                        <td className="px-6 py-3">
                          <Badge variant={getStatusVariant(sub.status)}>
                            {STATUS_LABELS[sub.status]}
                          </Badge>
                        </td>
                        <td className="px-6 py-3">
                          <SeverityBadge severity={sub.severity} />
                        </td>
                        <td className="px-6 py-3">
                          {sub.drainAmountWei > 0n ? (
                            <span>{formatEther(sub.drainAmountWei)} ETH</span>
                          ) : (
                            <span className="text-[#888]">-</span>
                          )}
                        </td>
                        <td className="px-6 py-3">
                          {sub.payoutAmount > 0n ? (
                            <span className="text-[#00ff9d] font-bold">
                              {formatEther(sub.payoutAmount)} ETH
                            </span>
                          ) : (
                            <span className="text-[#888]">-</span>
                          )}
                        </td>
                        <td className="px-6 py-3 text-[#888]">
                          {formatTimestamp(sub.commitTimestamp)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-[#111]/50 border-[#1a1a1a]">
          <CardContent className="p-4">
            <div className="grid md:grid-cols-3 gap-4 font-mono text-sm">
              <div>
                <span className="text-[#888]">OWNER: </span>
                <span className="text-[#00f0ff] break-all">{project.owner}</span>
              </div>
              <div>
                <span className="text-[#888]">TARGET_CONTRACT: </span>
                <span className="text-[#00f0ff] break-all">{project.targetContract}</span>
              </div>
              <div>
                <span className="text-[#888]">RULES_HASH: </span>
                <span className="break-all">{project.rulesHash.slice(0, 10)}...{project.rulesHash.slice(-8)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default ProjectDetail
