import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { formatEther, createPublicClient, http, parseAbiItem } from 'viem'
import type { Address } from 'viem'
import { BOUNTY_HUB_ADDRESS, BOUNTY_HUB_V2_ABI, CHAIN } from '../config'
import { StatCard } from '../components/shared/StatCard'
import { SeverityBadge } from '../components/shared/SeverityBadge'
import { useWallet } from '../hooks/useWallet'
import { STATUS_LABELS } from '../types'
import type { Submission } from '../types'

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

const publicClient = createPublicClient({
  chain: CHAIN,
  transport: http()
})

export function Dashboard() {
  const { address, isConnected, isConnecting, connect } = useWallet()
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const STATUS_FINALIZED = 4
  const STATUS_VERIFIED = 2

  const totalEarned = submissions
    .filter(s => s.status === STATUS_FINALIZED)
    .reduce((sum, s) => sum + s.payoutAmount, 0n)
  
  const totalCount = submissions.length
  const validCount = submissions.filter(s => s.severity > 0 && s.status >= STATUS_VERIFIED).length
  const pendingCount = submissions.filter(s => s.status === STATUS_VERIFIED).length

  const pendingPayouts = submissions.filter(s => s.status === STATUS_VERIFIED && s.payoutAmount > 0n)

  const fetchUserSubmissions = useCallback(async (userAddress: Address) => {
    try {
      setIsLoading(true)
      setError(null)

      const logs = await publicClient.getLogs({
        address: BOUNTY_HUB_ADDRESS,
        event: parseAbiItem('event PoCCommitted(uint256 indexed submissionId, uint256 indexed projectId, address indexed auditor, bytes32 commitHash)'),
        args: { auditor: userAddress },
        fromBlock: 'earliest',
        toBlock: 'latest'
      })

      const submissionIds = logs.map(log => log.args.submissionId!).filter((v, i, a) => a.indexOf(v) === i)

      if (submissionIds.length === 0) {
        setSubmissions([])
        return
      }

      const submissionPromises = submissionIds.map(id =>
        publicClient.readContract({
          address: BOUNTY_HUB_ADDRESS,
          abi: BOUNTY_HUB_V2_ABI,
          functionName: 'submissions',
          args: [id]
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
      setError('Failed to load your submissions from blockchain')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isConnected && address) {
      fetchUserSubmissions(address)
    }
  }, [isConnected, address, fetchUserSubmissions])

  const formatTimestamp = (timestamp: bigint) => {
    if (timestamp === 0n) return 'N/A'
    return new Date(Number(timestamp) * 1000).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getStatusColor = (status: number) => {
    if (status <= 1) return 'var(--color-primary)'
    if (status === 5) return 'var(--color-error)'
    return 'var(--color-secondary)'
  }

  if (!isConnected) {
    return (
      <div style={{ 
        minHeight: '100vh', 
        paddingTop: '80px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div className="container">
          <div style={{
            maxWidth: '500px',
            margin: '0 auto',
            textAlign: 'center',
            padding: '4rem 2rem',
            background: 'linear-gradient(135deg, rgba(17, 17, 17, 0.9), rgba(10, 10, 10, 0.95))',
            border: '1px solid var(--color-bg-light)',
            borderRadius: '4px',
            position: 'relative',
            overflow: 'hidden'
          }}>
            <div style={{
              position: 'absolute',
              inset: 0,
              background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0, 255, 157, 0.03) 2px, rgba(0, 255, 157, 0.03) 4px)',
              pointerEvents: 'none'
            }} />
            
            <div style={{
              width: '80px',
              height: '80px',
              margin: '0 auto 2rem',
              border: '2px solid var(--color-primary)',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(0, 255, 157, 0.05)',
              boxShadow: '0 0 30px rgba(0, 255, 157, 0.2)'
            }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            </div>

            <h1 style={{
              fontFamily: 'var(--font-display)',
              fontSize: '2rem',
              marginBottom: '1rem',
              letterSpacing: '0.1em',
              color: 'var(--color-text)'
            }}>
              AUDITOR DASHBOARD
            </h1>

            <p style={{
              color: 'var(--color-text-dim)',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.9rem',
              marginBottom: '2rem',
              lineHeight: 1.6
            }}>
              Connect your wallet to view your submissions,<br/>
              track earnings, and manage pending payouts.
            </p>

            <button
              onClick={connect}
              disabled={isConnecting}
              style={{
                background: 'linear-gradient(135deg, var(--color-primary), #00cc99)',
                color: 'var(--color-bg)',
                border: 'none',
                padding: '1rem 3rem',
                fontFamily: 'var(--font-display)',
                fontSize: '1rem',
                letterSpacing: '0.1em',
                cursor: isConnecting ? 'wait' : 'pointer',
                opacity: isConnecting ? 0.7 : 1,
                transition: 'all 0.2s',
                boxShadow: '0 0 20px rgba(0, 255, 157, 0.3)'
              }}
              onMouseEnter={(e) => {
                if (!isConnecting) {
                  e.currentTarget.style.boxShadow = '0 0 30px rgba(0, 255, 157, 0.5)'
                  e.currentTarget.style.transform = 'translateY(-2px)'
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = '0 0 20px rgba(0, 255, 157, 0.3)'
                e.currentTarget.style.transform = 'translateY(0)'
              }}
            >
              {isConnecting ? 'CONNECTING...' : 'CONNECT WALLET'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ height: 'calc(100vh - 70px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div className="container" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{ marginBottom: '1.5rem', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '1rem', marginBottom: '0.25rem' }}>
            <h1 style={{ 
              fontSize: '2rem', 
              fontFamily: 'var(--font-display)',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color: 'var(--color-primary)'
            }}>
              DASHBOARD
            </h1>
            <span style={{ 
              color: 'var(--color-text-dim)', 
              fontSize: '0.8rem',
              fontFamily: 'var(--font-mono)'
            }}>
              [{address?.slice(0, 6)}...{address?.slice(-4)}]
            </span>
          </div>
          <div style={{ 
            height: '2px', 
            background: 'linear-gradient(90deg, var(--color-primary), transparent)',
            width: '150px'
          }} />
          <p style={{ 
            color: 'var(--color-text-dim)', 
            marginTop: '0.5rem',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.8rem'
          }}>
            &gt; Your audit performance and submission history
          </p>
        </header>

        {error && (
          <div style={{ 
            padding: '1rem', 
            border: '1px solid var(--color-error)', 
            color: 'var(--color-error)',
            background: 'rgba(255, 0, 60, 0.1)',
            marginBottom: '1rem',
            flexShrink: 0
          }}>
            {error}
          </div>
        )}

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '1rem',
          marginBottom: '1.5rem',
          flexShrink: 0
        }}>
          <StatCard 
            label="TOTAL EARNED" 
            value={`${formatEther(totalEarned)} ETH`}
            color="var(--color-primary)"
          />
          <StatCard 
            label="SUBMISSIONS" 
            value={totalCount}
            color="var(--color-text)"
          />
          <StatCard 
            label="VALID" 
            value={validCount}
            subValue={totalCount > 0 ? `${Math.round((validCount / totalCount) * 100)}% rate` : undefined}
            color="var(--color-secondary)"
          />
          <StatCard 
            label="PENDING" 
            value={pendingCount}
            subValue="awaiting finalization"
            color="var(--color-warning)"
          />
        </div>

        {pendingPayouts.length > 0 && (
          <section style={{ marginBottom: '3rem' }}>
            <h2 style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.2rem',
              color: 'var(--color-warning)',
              marginBottom: '1rem',
              letterSpacing: '0.05em',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <span style={{ 
                width: '8px', 
                height: '8px', 
                background: 'var(--color-warning)',
                borderRadius: '50%',
                animation: 'pulse 2s infinite'
              }} />
              PENDING PAYOUTS [{pendingPayouts.length}]
            </h2>
            <div style={{
              background: 'linear-gradient(135deg, rgba(17, 17, 17, 0.9), rgba(10, 10, 10, 0.95))',
              border: '1px solid var(--color-warning)',
              borderRadius: '4px',
              overflow: 'hidden'
            }}>
              {pendingPayouts.map((sub, index) => (
                <div
                    key={sub.id.toString()}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '1rem 1.5rem',
                      borderBottom: index < pendingPayouts.length - 1 ? '1px solid var(--color-bg-light)' : 'none',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.85rem'
                    }}
                  >
                    <div>
                      <span style={{ color: 'var(--color-text-dim)' }}>PROJECT #{sub.projectId.toString()}</span>
                      <span style={{ margin: '0 0.5rem', color: 'var(--color-text-dim)' }}>|</span>
                      <SeverityBadge severity={sub.severity} />
                    </div>
                    <div style={{ 
                      color: 'var(--color-warning)', 
                      fontWeight: 'bold',
                      fontSize: '1rem'
                    }}>
                      {formatEther(sub.payoutAmount)} ETH
                    </div>
                  </div>
                ))}
            </div>
          </section>
        )}

        <section>
          <h2 style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1.2rem',
            color: 'var(--color-text)',
            marginBottom: '1rem',
            letterSpacing: '0.05em'
          }}>
            RECENT SUBMISSIONS [{submissions.length}]
          </h2>

          {isLoading && (
            <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--color-text-dim)' }}>
              <div className="spinner" style={{ width: '32px', height: '32px', margin: '0 auto 1rem' }} />
              <p>Loading submissions...</p>
            </div>
          )}

          {!isLoading && submissions.length === 0 && (
            <div style={{ 
              textAlign: 'center', 
              padding: '4rem',
              color: 'var(--color-text-dim)',
              border: '1px dashed var(--color-text-dim)',
              background: 'rgba(0, 0, 0, 0.2)'
            }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" style={{ margin: '0 auto 1rem', opacity: 0.5 }}>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="12" y1="18" x2="12" y2="12"/>
                <line x1="9" y1="15" x2="15" y2="15"/>
              </svg>
              <p style={{ fontFamily: 'var(--font-mono)', marginBottom: '0.5rem' }}>
                &gt; No submissions found
              </p>
              <p style={{ fontSize: '0.85rem' }}>
                Submit your first PoC to start earning bounties
              </p>
              <Link 
                to="/submit" 
                style={{
                  display: 'inline-block',
                  marginTop: '1.5rem',
                  color: 'var(--color-primary)',
                  fontFamily: 'var(--font-mono)',
                  textDecoration: 'none',
                  padding: '0.75rem 1.5rem',
                  border: '1px solid var(--color-primary)',
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
                SUBMIT POC →
              </Link>
            </div>
          )}

          {!isLoading && submissions.length > 0 && (
            <div style={{
              background: 'linear-gradient(135deg, rgba(17, 17, 17, 0.9), rgba(10, 10, 10, 0.95))',
              border: '1px solid var(--color-bg-light)',
              borderRadius: '4px',
              overflow: 'hidden'
            }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '80px 1fr 120px 120px 140px 100px',
                gap: '1rem',
                padding: '1rem 1.5rem',
                background: 'var(--color-bg-light)',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.75rem',
                color: 'var(--color-text-dim)',
                letterSpacing: '0.05em'
              }}>
                <div>ID</div>
                <div>PROJECT</div>
                <div>SEVERITY</div>
                <div>STATUS</div>
                <div>PAYOUT</div>
                <div>DATE</div>
              </div>

              {submissions.map((sub) => (
                <div
                  key={sub.id.toString()}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '80px 1fr 120px 120px 140px 100px',
                    gap: '1rem',
                    padding: '1rem 1.5rem',
                    borderBottom: '1px solid var(--color-bg-light)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.85rem',
                    alignItems: 'center',
                    transition: 'background 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(0, 255, 157, 0.03)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent'
                  }}
                >
                  <div style={{ color: 'var(--color-text-dim)' }}>
                    #{sub.id.toString()}
                  </div>
                  <div>
                    <Link 
                      to={`/project/${sub.projectId.toString()}`}
                      style={{
                        color: 'var(--color-secondary)',
                        textDecoration: 'none'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
                      onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}
                    >
                      PROJECT #{sub.projectId.toString()}
                    </Link>
                  </div>
                  <div>
                    <SeverityBadge severity={sub.severity} />
                  </div>
                  <div>
                    <span style={{
                      padding: '0.25rem 0.5rem',
                      background: `${getStatusColor(sub.status)}15`,
                      color: getStatusColor(sub.status),
                      fontSize: '0.7rem',
                      fontWeight: 'bold'
                    }}>
                      {STATUS_LABELS[sub.status]}
                    </span>
                  </div>
                  <div style={{ 
                    color: sub.payoutAmount > 0n ? 'var(--color-primary)' : 'var(--color-text-dim)',
                    fontWeight: sub.payoutAmount > 0n ? 'bold' : 'normal'
                  }}>
                    {sub.payoutAmount > 0n ? `${formatEther(sub.payoutAmount)} ETH` : '-'}
                  </div>
                  <div style={{ color: 'var(--color-text-dim)', fontSize: '0.8rem' }}>
                    {formatTimestamp(sub.commitTimestamp)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  )
}

export default Dashboard
