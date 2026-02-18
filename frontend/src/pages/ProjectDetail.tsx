import { useState, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { formatEther, createPublicClient, http, parseAbiItem, type Address } from 'viem'
import { BOUNTY_HUB_ADDRESS, BOUNTY_HUB_V2_ABI, CHAIN } from '../config'
import { StatCard } from '../components/shared/StatCard'
import { CountdownTimer } from '../components/shared/CountdownTimer'
import { SeverityBadge } from '../components/shared/SeverityBadge'
import { STATUS_LABELS, type Project, type Submission, type ProjectRules } from '../types'

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
      const logs = await publicClient.getLogs({
        address: BOUNTY_HUB_ADDRESS,
        event: parseAbiItem('event PoCCommitted(uint256 indexed submissionId, uint256 indexed projectId, address indexed auditor, bytes32 commitHash)'),
        args: { projectId },
        fromBlock: 'earliest',
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
    if (!project) return { text: 'UNKNOWN', color: 'var(--color-text-dim)' }
    const now = BigInt(Math.floor(Date.now() / 1000))
    if (project.commitDeadline === 0n || now < project.commitDeadline) {
      return { text: 'COMMIT OPEN', color: 'var(--color-primary)' }
    }
    if (project.revealDeadline === 0n || now < project.revealDeadline) {
      return { text: 'REVEAL PHASE', color: 'var(--color-secondary)' }
    }
    return { text: 'CLOSED', color: 'var(--color-error)' }
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

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', paddingTop: '80px' }}>
        <div className="container">
          <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--color-text-dim)' }}>
            <div className="spinner" style={{ width: '32px', height: '32px', margin: '0 auto 1rem' }} />
            <p style={{ fontFamily: 'var(--font-mono)' }}>&gt; Loading project data...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error || !project) {
    return (
      <div style={{ minHeight: '100vh', paddingTop: '80px' }}>
        <div className="container">
          <div style={{ 
            padding: '2rem', 
            border: '1px solid var(--color-error)', 
            color: 'var(--color-error)',
            background: 'rgba(255, 0, 60, 0.1)',
            textAlign: 'center'
          }}>
            <p style={{ fontFamily: 'var(--font-mono)' }}>
              &gt; ERROR: {error || 'Project not found'}
            </p>
            <Link 
              to="/explorer" 
              style={{ 
                color: 'var(--color-primary)', 
                marginTop: '1rem', 
                display: 'inline-block',
                fontFamily: 'var(--font-mono)'
              }}
            >
              [&lt; Back to Explorer]
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const deadlineStatus = getDeadlineStatus()

  return (
    <div style={{ height: 'calc(100vh - 70px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div className="container" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{ marginBottom: '1rem', flexShrink: 0 }}>
          <Link 
            to="/explorer" 
            style={{ 
              color: 'var(--color-text-dim)', 
              fontSize: '0.75rem',
              fontFamily: 'var(--font-mono)',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              marginBottom: '0.5rem'
            }}
          >
            <span>&larr;</span> BACK_TO_EXPLORER
          </Link>
          
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '1rem', marginBottom: '0.25rem' }}>
            <h1 style={{ 
              fontSize: '1.5rem', 
              fontFamily: 'var(--font-display)',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color: 'var(--color-primary)'
            }}>
              PROJECT_#{project.id.toString()}
            </h1>
            <span style={{ 
              padding: '0.25rem 0.75rem',
              background: project.mode === 0 ? 'var(--color-primary)' : 'var(--color-secondary)',
              color: 'var(--color-bg)',
              fontSize: '0.7rem',
              fontWeight: 'bold',
              fontFamily: 'var(--font-display)',
              letterSpacing: '0.1em'
            }}>
              {project.mode === 0 ? 'UNIQUE' : 'MULTI'}
            </span>
          </div>
          
          <div style={{ 
            height: '2px', 
            background: 'linear-gradient(90deg, var(--color-primary), transparent)',
            width: '200px'
          }} />
          
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '1.5rem',
            marginTop: '0.5rem',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.9rem'
          }}>
            <span style={{ color: deadlineStatus.color, fontWeight: 'bold' }}>
              [{deadlineStatus.text}]
            </span>
            <span style={{ color: 'var(--color-text-dim)' }}>
              TARGET: <span style={{ color: 'var(--color-secondary)' }}>{formatAddress(project.targetContract)}</span>
            </span>
          </div>
        </header>

        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
          gap: '1.5rem',
          marginBottom: '3rem'
        }}>
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

        <section style={{ marginBottom: '3rem' }}>
          <h2 style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1.2rem',
            color: 'var(--color-text)',
            marginBottom: '1.5rem',
            letterSpacing: '0.05em'
          }}>
            DEADLINES
          </h2>
          
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', 
            gap: '1.5rem'
          }}>
            <div style={{
              background: 'linear-gradient(135deg, rgba(17, 17, 17, 0.9), rgba(10, 10, 10, 0.95))',
              border: '1px solid var(--color-bg-light)',
              borderRadius: '4px',
              padding: '1.5rem'
            }}>
              <div style={{ 
                color: 'var(--color-text-dim)', 
                fontFamily: 'var(--font-mono)',
                fontSize: '0.8rem',
                marginBottom: '0.5rem'
              }}>
                COMMIT DEADLINE
              </div>
              <div style={{ marginBottom: '1rem', fontFamily: 'var(--font-mono)', fontSize: '0.9rem' }}>
                {formatTimestamp(project.commitDeadline)}
              </div>
              <CountdownTimer deadline={project.commitDeadline} />
            </div>
            
            <div style={{
              background: 'linear-gradient(135deg, rgba(17, 17, 17, 0.9), rgba(10, 10, 10, 0.95))',
              border: '1px solid var(--color-bg-light)',
              borderRadius: '4px',
              padding: '1.5rem'
            }}>
              <div style={{ 
                color: 'var(--color-text-dim)', 
                fontFamily: 'var(--font-mono)',
                fontSize: '0.8rem',
                marginBottom: '0.5rem'
              }}>
                REVEAL DEADLINE
              </div>
              <div style={{ marginBottom: '1rem', fontFamily: 'var(--font-mono)', fontSize: '0.9rem' }}>
                {formatTimestamp(project.revealDeadline)}
              </div>
              <CountdownTimer deadline={project.revealDeadline} />
            </div>
          </div>
        </section>

        {rules && (
          <section style={{ marginBottom: '3rem' }}>
            <h2 style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.2rem',
              color: 'var(--color-text)',
              marginBottom: '1.5rem',
              letterSpacing: '0.05em'
            }}>
              RULES &amp; THRESHOLDS
            </h2>
            
            <div style={{
              background: 'linear-gradient(135deg, rgba(17, 17, 17, 0.9), rgba(10, 10, 10, 0.95))',
              border: '1px solid var(--color-bg-light)',
              borderRadius: '4px',
              padding: '1.5rem'
            }}>
              <div style={{ marginBottom: '2rem' }}>
                <h3 style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.9rem',
                  color: 'var(--color-secondary)',
                  marginBottom: '1rem'
                }}>
                  // EXECUTION_RULES
                </h3>
                
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
                  gap: '1rem',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.85rem'
                }}>
                  <div>
                    <span style={{ color: 'var(--color-text-dim)' }}>MAX_ATTACKER_SEED: </span>
                    <span>{formatEther(rules.maxAttackerSeedWei)} ETH</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--color-text-dim)' }}>MAX_TIME_WARP: </span>
                    <span>{rules.maxWarpSeconds.toString()}s</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--color-text-dim)' }}>IMPERSONATION: </span>
                    <span style={{ color: rules.allowImpersonation ? 'var(--color-primary)' : 'var(--color-error)' }}>
                      {rules.allowImpersonation ? 'ALLOWED' : 'DISABLED'}
                    </span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--color-text-dim)' }}>DISPUTE_WINDOW: </span>
                    <span>{project.disputeWindow.toString()}s</span>
                  </div>
                </div>
              </div>
              
              <div>
                <h3 style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.9rem',
                  color: 'var(--color-secondary)',
                  marginBottom: '1rem'
                }}>
                  // SEVERITY_THRESHOLDS
                </h3>
                
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(4, 1fr)', 
                  gap: '1rem'
                }}>
                  <div style={{
                    padding: '1rem',
                    background: 'rgba(255, 0, 60, 0.1)',
                    borderLeft: '3px solid #ff003c'
                  }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.75rem', color: '#ff003c', marginBottom: '0.5rem' }}>
                      CRITICAL
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
                      &gt; {formatEther(rules.thresholds.criticalDrainWei)} ETH
                    </div>
                  </div>
                  
                  <div style={{
                    padding: '1rem',
                    background: 'rgba(255, 136, 0, 0.1)',
                    borderLeft: '3px solid #ff8800'
                  }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.75rem', color: '#ff8800', marginBottom: '0.5rem' }}>
                      HIGH
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
                      &gt; {formatEther(rules.thresholds.highDrainWei)} ETH
                    </div>
                  </div>
                  
                  <div style={{
                    padding: '1rem',
                    background: 'rgba(255, 255, 0, 0.1)',
                    borderLeft: '3px solid #ffff00'
                  }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.75rem', color: '#ffff00', marginBottom: '0.5rem' }}>
                      MEDIUM
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
                      &gt; {formatEther(rules.thresholds.mediumDrainWei)} ETH
                    </div>
                  </div>
                  
                  <div style={{
                    padding: '1rem',
                    background: 'rgba(136, 255, 136, 0.1)',
                    borderLeft: '3px solid #88ff88'
                  }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.75rem', color: '#88ff88', marginBottom: '0.5rem' }}>
                      LOW
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
                      &gt; {formatEther(rules.thresholds.lowDrainWei)} ETH
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {project.active && (
          <section style={{ marginBottom: '3rem' }}>
            <Link 
              to={`/?project=${project.id.toString()}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '1rem 2rem',
                background: 'linear-gradient(135deg, var(--color-primary), #00cc7d)',
                color: 'var(--color-bg)',
                fontFamily: 'var(--font-display)',
                fontSize: '1rem',
                fontWeight: 'bold',
                letterSpacing: '0.1em',
                textDecoration: 'none',
                transition: 'all 0.2s',
                boxShadow: '0 0 20px rgba(0, 255, 157, 0.3)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = '0 0 30px rgba(0, 255, 157, 0.5)'
                e.currentTarget.style.transform = 'translateY(-2px)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = '0 0 20px rgba(0, 255, 157, 0.3)'
                e.currentTarget.style.transform = 'translateY(0)'
              }}
            >
              <span>SUBMIT_POC</span>
              <span>&rarr;</span>
            </Link>
          </section>
        )}

        <section style={{ marginBottom: '3rem' }}>
          <h2 style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1.2rem',
            color: 'var(--color-text)',
            marginBottom: '1.5rem',
            letterSpacing: '0.05em'
          }}>
            SUBMISSIONS [{submissions.length}]
          </h2>
          
          {submissions.length === 0 ? (
            <div style={{
              padding: '3rem',
              border: '1px dashed var(--color-text-dim)',
              textAlign: 'center',
              color: 'var(--color-text-dim)',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.9rem'
            }}>
              <p>&gt; No submissions yet</p>
              <p style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>
                Be the first to submit a PoC for this project
              </p>
            </div>
          ) : (
            <div style={{
              overflowX: 'auto',
              border: '1px solid var(--color-bg-light)',
              background: 'linear-gradient(135deg, rgba(17, 17, 17, 0.9), rgba(10, 10, 10, 0.95))'
            }}>
              <table style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.85rem'
              }}>
                <thead>
                  <tr style={{ 
                    borderBottom: '1px solid var(--color-bg-light)',
                    textAlign: 'left'
                  }}>
                    <th style={{ padding: '1rem', color: 'var(--color-text-dim)', fontWeight: 'normal' }}>ID</th>
                    <th style={{ padding: '1rem', color: 'var(--color-text-dim)', fontWeight: 'normal' }}>AUDITOR</th>
                    <th style={{ padding: '1rem', color: 'var(--color-text-dim)', fontWeight: 'normal' }}>STATUS</th>
                    <th style={{ padding: '1rem', color: 'var(--color-text-dim)', fontWeight: 'normal' }}>SEVERITY</th>
                    <th style={{ padding: '1rem', color: 'var(--color-text-dim)', fontWeight: 'normal' }}>DRAIN</th>
                    <th style={{ padding: '1rem', color: 'var(--color-text-dim)', fontWeight: 'normal' }}>PAYOUT</th>
                    <th style={{ padding: '1rem', color: 'var(--color-text-dim)', fontWeight: 'normal' }}>COMMITTED</th>
                  </tr>
                </thead>
                <tbody>
                  {submissions.map((sub) => (
                    <tr 
                      key={sub.id.toString()}
                      style={{ 
                        borderBottom: '1px solid var(--color-bg-light)',
                        transition: 'background 0.2s'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(0, 255, 157, 0.05)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent'
                      }}
                    >
                      <td style={{ padding: '1rem', color: 'var(--color-text-dim)' }}>
                        #{sub.id.toString()}
                      </td>
                      <td style={{ padding: '1rem' }}>
                        <span style={{ color: 'var(--color-secondary)' }}>
                          {formatAddress(sub.auditor)}
                        </span>
                      </td>
                      <td style={{ padding: '1rem' }}>
                        <span style={{
                          padding: '0.25rem 0.5rem',
                          background: sub.status <= 1 ? 'rgba(0, 255, 157, 0.1)' 
                            : sub.status === 5 ? 'rgba(255, 0, 60, 0.1)'
                            : sub.status === 3 ? 'rgba(255, 136, 0, 0.1)'
                            : 'rgba(0, 240, 255, 0.1)',
                          color: sub.status <= 1 ? 'var(--color-primary)'
                            : sub.status === 5 ? 'var(--color-error)'
                            : sub.status === 3 ? '#ff8800'
                            : 'var(--color-secondary)',
                          fontSize: '0.75rem',
                          fontWeight: 'bold'
                        }}>
                          {STATUS_LABELS[sub.status]}
                        </span>
                      </td>
                      <td style={{ padding: '1rem' }}>
                        <SeverityBadge severity={sub.severity} />
                      </td>
                      <td style={{ padding: '1rem' }}>
                        {sub.drainAmountWei > 0n ? (
                          <span style={{ color: 'var(--color-text)' }}>
                            {formatEther(sub.drainAmountWei)} ETH
                          </span>
                        ) : (
                          <span style={{ color: 'var(--color-text-dim)' }}>-</span>
                        )}
                      </td>
                      <td style={{ padding: '1rem' }}>
                        {sub.payoutAmount > 0n ? (
                          <span style={{ color: 'var(--color-primary)', fontWeight: 'bold' }}>
                            {formatEther(sub.payoutAmount)} ETH
                          </span>
                        ) : (
                          <span style={{ color: 'var(--color-text-dim)' }}>-</span>
                        )}
                      </td>
                      <td style={{ padding: '1rem', color: 'var(--color-text-dim)' }}>
                        {formatTimestamp(sub.commitTimestamp)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section style={{
          padding: '1.5rem',
          background: 'rgba(17, 17, 17, 0.5)',
          border: '1px solid var(--color-bg-light)',
          borderRadius: '4px',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.85rem'
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
            <div>
              <span style={{ color: 'var(--color-text-dim)' }}>OWNER: </span>
              <span style={{ color: 'var(--color-secondary)' }}>{project.owner}</span>
            </div>
            <div>
              <span style={{ color: 'var(--color-text-dim)' }}>TARGET_CONTRACT: </span>
              <span style={{ color: 'var(--color-secondary)' }}>{project.targetContract}</span>
            </div>
            <div>
              <span style={{ color: 'var(--color-text-dim)' }}>RULES_HASH: </span>
              <span>{project.rulesHash.slice(0, 10)}...{project.rulesHash.slice(-8)}</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

export default ProjectDetail
