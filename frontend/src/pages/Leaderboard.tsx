import { useState, useEffect, useCallback } from 'react'
import { formatEther, createPublicClient, http, parseAbiItem, type Address } from 'viem'
import { BOUNTY_HUB_ADDRESS, BOUNTY_HUB_V2_ABI, CHAIN } from '../config'
import { useWallet } from '../hooks/useWallet'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'

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
  transport: http('https://1rpc.io/sepolia')
})

const SEVERITY_HIGH = 3
const SEVERITY_CRITICAL = 4

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <span className="text-xl" style={{ color: 'var(--color-gold)' }}>
        🥇
      </span>
    )
  }
  if (rank === 2) {
    return (
      <span className="text-xl" style={{ color: 'var(--color-silver)' }}>
        🥈
      </span>
    )
  }
  if (rank === 3) {
    return (
      <span className="text-xl" style={{ color: 'var(--color-bronze)' }}>
        🥉
      </span>
    )
  }
  return (
    <span className="text-[var(--color-text-dim)] font-mono">
      #{rank}
    </span>
  )
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

  const isCurrentUser = (address: Address) => 
    connectedAddress && connectedAddress.toLowerCase() === address.toLowerCase()

  return (
    <div className="h-[calc(100vh-142px)] flex flex-col overflow-hidden">
      <div className="container flex-1 flex flex-col overflow-hidden">
        <header className="mb-6 flex-shrink-0">
          <div className="flex items-baseline gap-4 mb-1">
            <h1 
              className="text-2xl uppercase tracking-widest"
              style={{ 
                fontFamily: 'var(--font-display)',
                color: 'var(--color-primary)'
              }}
            >
              LEADERBOARD
            </h1>
            <span 
              className="text-xs font-mono"
              style={{ color: 'var(--color-text-dim)' }}
            >
              [{leaderboard.length} HUNTERS]
            </span>
          </div>
          <div 
            className="h-0.5 w-36"
            style={{ background: 'linear-gradient(90deg, var(--color-primary), transparent)' }}
          />
          <p 
            className="mt-2 text-xs font-mono"
            style={{ color: 'var(--color-text-dim)' }}
          >
            &gt; Top vulnerability hunters ranked by total earnings
          </p>
        </header>

        {isLoading && (
          <div className="flex-1 flex items-center justify-center text-center p-8" style={{ color: 'var(--color-text-dim)' }}>
            <div>
              <div className="spinner w-8 h-8 mx-auto mb-4" />
              <p>Aggregating bounty data...</p>
            </div>
          </div>
        )}

        {error && (
          <div 
            className="p-4 mb-4 flex-shrink-0 border"
            style={{ 
              borderColor: 'var(--color-error)',
              color: 'var(--color-error)',
              background: 'rgba(255, 0, 60, 0.1)'
            }}
          >
            {error}
          </div>
        )}

        {!isLoading && !error && leaderboard.length === 0 && (
          <div 
            className="text-center p-16 mt-8 border border-dashed"
            style={{ 
              color: 'var(--color-text-dim)',
              borderColor: 'var(--color-text-dim)'
            }}
          >
            <p className="font-mono">&gt; No bounty payouts recorded yet</p>
            <p className="text-sm mt-2">
              Leaderboard will populate as PoCs are verified and paid
            </p>
          </div>
        )}

        {!isLoading && !error && leaderboard.length > 0 && (
          <div 
            className="overflow-hidden border rounded-sm"
            style={{ 
              background: 'linear-gradient(135deg, rgba(17, 17, 17, 0.9), rgba(10, 10, 10, 0.95))',
              borderColor: 'var(--color-bg-light)'
            }}
          >
            <Table>
              <TableHeader>
                <TableRow 
                  className="border-b hover:bg-transparent"
                  style={{ borderColor: 'var(--color-bg-light)' }}
                >
                  <TableHead 
                    className="w-20 text-xs font-mono uppercase tracking-wider"
                    style={{ color: 'var(--color-text-dim)' }}
                  >
                    Rank
                  </TableHead>
                  <TableHead 
                    className="text-xs font-mono uppercase tracking-wider"
                    style={{ color: 'var(--color-text-dim)' }}
                  >
                    Auditor
                  </TableHead>
                  <TableHead 
                    className="text-center text-xs font-mono uppercase tracking-wider"
                    style={{ color: 'var(--color-text-dim)' }}
                  >
                    Valid
                  </TableHead>
                  <TableHead 
                    className="text-center text-xs font-mono uppercase tracking-wider"
                    style={{ color: 'var(--color-text-dim)' }}
                  >
                    High
                  </TableHead>
                  <TableHead 
                    className="text-center text-xs font-mono uppercase tracking-wider"
                    style={{ color: 'var(--color-text-dim)' }}
                  >
                    Critical
                  </TableHead>
                  <TableHead 
                    className="text-right text-xs font-mono uppercase tracking-wider"
                    style={{ color: 'var(--color-text-dim)' }}
                  >
                    Earnings
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leaderboard.map((entry) => {
                  const isYou = isCurrentUser(entry.address)
                  
                  return (
                    <TableRow
                      key={entry.address}
                      className={`
                        border-b transition-colors
                        ${isYou ? 'bg-[rgba(0,240,255,0.08)]' : ''}
                        hover:bg-[rgba(255,255,255,0.02)]
                      `}
                      style={{ 
                        borderColor: 'var(--color-bg-light)',
                        borderLeftWidth: isYou ? '3px' : undefined,
                        borderLeftColor: isYou ? 'var(--color-secondary)' : undefined,
                        borderLeftStyle: isYou ? 'solid' : undefined
                      }}
                    >
                      <TableCell className="font-medium">
                        <RankBadge rank={entry.rank} />
                      </TableCell>

                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span 
                            className="font-mono text-sm"
                            style={{ 
                              color: isYou ? 'var(--color-secondary)' : 'var(--color-text)' 
                            }}
                          >
                            {truncateAddress(entry.address)}
                          </span>
                          {isYou && (
                            <Badge 
                              variant="info"
                              className="text-[10px] px-1.5 py-0"
                            >
                              YOU
                            </Badge>
                          )}
                        </div>
                      </TableCell>

                      <TableCell className="text-center">
                        <span 
                          className="font-bold font-mono"
                          style={{ color: 'var(--color-primary)' }}
                        >
                          {entry.validCount}
                        </span>
                      </TableCell>

                      <TableCell className="text-center">
                        {entry.highCount > 0 ? (
                          <Badge variant="high" className="font-mono">
                            {entry.highCount}
                          </Badge>
                        ) : (
                          <span style={{ color: 'var(--color-text-dim)' }}>0</span>
                        )}
                      </TableCell>

                      <TableCell className="text-center">
                        {entry.criticalCount > 0 ? (
                          <Badge variant="critical" className="font-mono">
                            {entry.criticalCount}
                          </Badge>
                        ) : (
                          <span style={{ color: 'var(--color-text-dim)' }}>0</span>
                        )}
                      </TableCell>

                      <TableCell className="text-right">
                        <span 
                          className="font-bold font-mono"
                          style={{ color: 'var(--color-primary)' }}
                        >
                          {formatEther(entry.totalEarned)} ETH
                        </span>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {!isLoading && !error && leaderboard.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
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
              <div 
                className="stat-value"
                style={{ color: 'var(--color-error)' }}
              >
                {leaderboard.reduce((sum, e) => sum + e.criticalCount, 0)}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">High Severity</div>
              <div 
                className="stat-value"
                style={{ color: '#ff8800' }}
              >
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
