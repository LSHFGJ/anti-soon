import { useState, useEffect, useCallback } from 'react'
import { formatEther, createPublicClient, http, parseAbiItem, type Address } from 'viem'
import { BOUNTY_HUB_ADDRESS, BOUNTY_HUB_V2_ABI, CHAIN } from '../config'
import { useWallet } from '../hooks/useWallet'

interface LeaderboardEntry {
  rank: number
  address: Address
  validCount: number
  totalEarned: bigint
  highCount: number
  criticalCount: number
}

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

const SEVERITY_HIGH = 3
const SEVERITY_CRITICAL = 4

const RANK_BADGES: Record<number, string> = {
  1: '🥇',
  2: '🥈', 
  3: '🥉'
}

export function Leaderboard() {
  const { address: connectedAddress } = useWallet()
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchLeaderboard = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)

      const latestBlock = await publicClient.getBlockNumber()
      const fromBlock = latestBlock > 10000n ? latestBlock - 10000n : 0n

      const payoutLogs = await publicClient.getLogs({
        address: BOUNTY_HUB_ADDRESS,
        event: parseAbiItem('event BountyPaid(uint256 indexed submissionId, address indexed auditor, uint256 amount)'),
        fromBlock,
        toBlock: 'latest'
      })

      if (payoutLogs.length === 0) {
        setLeaderboard([])
        return
      }

      const submissionIds = [...new Set(payoutLogs.map(log => log.args.submissionId!))]
      
      const submissionPromises = submissionIds.map(id =>
        publicClient.readContract({
          address: BOUNTY_HUB_ADDRESS,
          abi: BOUNTY_HUB_V2_ABI,
          functionName: 'submissions',
          args: [id]
        })
      )

      const submissions = await Promise.all(submissionPromises) as SubmissionTuple[]
      
      const severityMap = new Map<bigint, number>()
      submissions.forEach((sub, index) => {
        severityMap.set(submissionIds[index], sub[10])
      })

      const auditorStats = new Map<Address, { validCount: number; totalEarned: bigint; highCount: number; criticalCount: number }>()

      payoutLogs.forEach(log => {
        const auditor = log.args.auditor!
        const amount = log.args.amount!
        const submissionId = log.args.submissionId!
        const severity = severityMap.get(submissionId) || 0

        const existing = auditorStats.get(auditor) || { 
          validCount: 0, 
          totalEarned: 0n, 
          highCount: 0, 
          criticalCount: 0 
        }

        auditorStats.set(auditor, {
          validCount: existing.validCount + 1,
          totalEarned: existing.totalEarned + amount,
          highCount: existing.highCount + (severity === SEVERITY_HIGH ? 1 : 0),
          criticalCount: existing.criticalCount + (severity === SEVERITY_CRITICAL ? 1 : 0)
        })
      })

      const sortedLeaderboard: LeaderboardEntry[] = Array.from(auditorStats.entries())
        .map(([address, stats]) => ({
          address,
          rank: 0,
          ...stats
        }))
        .sort((a, b) => (b.totalEarned > a.totalEarned ? 1 : b.totalEarned < a.totalEarned ? -1 : 0))
        .map((entry, index) => ({ ...entry, rank: index + 1 }))

      setLeaderboard(sortedLeaderboard)
    } catch (err) {
      console.error('Failed to fetch leaderboard:', err)
      setError('Failed to load leaderboard data')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchLeaderboard()
  }, [fetchLeaderboard])

  const truncateAddress = (addr: Address) => 
    `${addr.slice(0, 6)}...${addr.slice(-4)}`

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
              LEADERBOARD
            </h1>
            <span style={{ 
              color: 'var(--color-text-dim)', 
              fontSize: '0.8rem',
              fontFamily: 'var(--font-mono)'
            }}>
              [{leaderboard.length} HUNTERS]
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
            &gt; Top vulnerability hunters ranked by total earnings
          </p>
        </header>

        {isLoading && (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-dim)', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="spinner" style={{ width: '32px', height: '32px', margin: '0 auto 1rem' }} />
            <p>Aggregating bounty data...</p>
          </div>
        )}

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

        {!isLoading && !error && leaderboard.length === 0 && (
          <div style={{ 
            textAlign: 'center', 
            padding: '4rem',
            color: 'var(--color-text-dim)',
            border: '1px dashed var(--color-text-dim)',
            marginTop: '2rem'
          }}>
            <p style={{ fontFamily: 'var(--font-mono)' }}>
              &gt; No bounty payouts recorded yet
            </p>
            <p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>
              Leaderboard will populate as PoCs are verified and paid
            </p>
          </div>
        )}

        {!isLoading && !error && leaderboard.length > 0 && (
          <div style={{ 
            background: 'linear-gradient(135deg, rgba(17, 17, 17, 0.9), rgba(10, 10, 10, 0.95))',
            border: '1px solid var(--color-bg-light)',
            overflow: 'hidden'
          }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: '80px' }}>RANK</th>
                  <th>AUDITOR</th>
                  <th style={{ textAlign: 'center' }}>VALID</th>
                  <th style={{ textAlign: 'center' }}>HIGH</th>
                  <th style={{ textAlign: 'center' }}>CRITICAL</th>
                  <th style={{ textAlign: 'right' }}>EARNINGS</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((entry) => {
                  const isCurrentUser = connectedAddress && 
                    connectedAddress.toLowerCase() === entry.address.toLowerCase()
                  
                  return (
                    <tr 
                      key={entry.address}
                      className={isCurrentUser ? 'highlight' : ''}
                      style={{
                        background: isCurrentUser ? 'rgba(0, 240, 255, 0.08)' : undefined,
                        borderLeft: isCurrentUser ? '3px solid var(--color-secondary)' : undefined
                      }}
                    >
                      <td style={{ 
                        fontSize: '1.2rem',
                        fontWeight: entry.rank <= 3 ? 'bold' : 'normal',
                        color: entry.rank === 1 ? 'var(--color-gold)' 
                             : entry.rank === 2 ? 'var(--color-silver)' 
                             : entry.rank === 3 ? 'var(--color-bronze)' 
                             : 'var(--color-text-dim)'
                      }}>
                        {RANK_BADGES[entry.rank] || `#${entry.rank}`}
                      </td>
                      <td style={{ 
                        fontFamily: 'var(--font-mono)',
                        color: isCurrentUser ? 'var(--color-secondary)' : 'var(--color-text)'
                      }}>
                        {truncateAddress(entry.address)}
                        {isCurrentUser && (
                          <span style={{
                            marginLeft: '0.5rem',
                            fontSize: '0.7rem',
                            color: 'var(--color-secondary)',
                            border: '1px solid var(--color-secondary)',
                            padding: '0.1rem 0.4rem'
                          }}>
                            YOU
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span style={{
                          color: 'var(--color-primary)',
                          fontWeight: 'bold'
                        }}>
                          {entry.validCount}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {entry.highCount > 0 ? (
                          <span className="severity-badge high">{entry.highCount}</span>
                        ) : (
                          <span style={{ color: 'var(--color-text-dim)' }}>0</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {entry.criticalCount > 0 ? (
                          <span className="severity-badge critical">{entry.criticalCount}</span>
                        ) : (
                          <span style={{ color: 'var(--color-text-dim)' }}>0</span>
                        )}
                      </td>
                      <td style={{ 
                        textAlign: 'right',
                        color: 'var(--color-primary)',
                        fontWeight: 'bold',
                        fontFamily: 'var(--font-mono)'
                      }}>
                        {formatEther(entry.totalEarned)} ETH
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {!isLoading && !error && leaderboard.length > 0 && (
          <div style={{ 
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1rem',
            marginTop: '2rem'
          }}>
            <div className="stat-card">
              <div className="stat-label">Total Hunters</div>
              <div className="stat-value">{leaderboard.length}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Total Payouts</div>
              <div className="stat-value">
                {formatEther(leaderboard.reduce((sum, e) => sum + e.totalEarned, 0n)).slice(0, 8)}
              </div>
              <div className="stat-sub">ETH</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Critical Bugs</div>
              <div className="stat-value" style={{ color: 'var(--color-error)' }}>
                {leaderboard.reduce((sum, e) => sum + e.criticalCount, 0)}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">High Severity</div>
              <div className="stat-value" style={{ color: '#ff8800' }}>
                {leaderboard.reduce((sum, e) => sum + e.highCount, 0)}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default Leaderboard
