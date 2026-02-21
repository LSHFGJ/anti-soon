import { useState, useEffect, useCallback, useMemo } from 'react'
import { formatEther, parseAbiItem, type Address } from 'viem'
import { BOUNTY_HUB_ADDRESS, BOUNTY_HUB_V2_ABI } from '../config'
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
import { PageHeader, StatusBanner, NeonPanel } from '@/components/shared/ui-primitives'
import { StatCard } from '@/components/shared/StatCard'
import { aggregateLeaderboardEntries } from '../lib/dashboardLeaderboardCompute'
import { discoverDeploymentBlock, getLogsWithRangeFallback } from '../lib/chainLogs'
import { publicClient } from '../lib/publicClient'
import { formatPreviewFallbackMessage, shouldUsePreviewFallback } from '@/lib/previewFallback'

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

const SEVERITY_HIGH = 3
const SEVERITY_CRITICAL = 4

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <span className="text-xl text-[var(--color-gold)]">
        🥇
      </span>
    )
  }
  if (rank === 2) {
    return (
      <span className="text-xl text-[var(--color-silver)]">
        🥈
      </span>
    )
  }
  if (rank === 3) {
    return (
      <span className="text-xl text-[var(--color-bronze)]">
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

      const payoutLogs = await getLogsWithRangeFallback({
        fetchLogs: (range) => publicClient.getLogs({
          address: BOUNTY_HUB_ADDRESS,
          event: parseAbiItem('event BountyPaid(uint256 indexed submissionId, address indexed auditor, uint256 amount)'),
          ...(range ?? {}),
          toBlock: range?.toBlock ?? 'latest',
        }),
        getLatestBlock: () => publicClient.getBlockNumber(),
        getStartBlock: async (latestBlock) => discoverDeploymentBlock(publicClient, BOUNTY_HUB_ADDRESS, latestBlock),
      })

      if (payoutLogs.length === 0) {
        setLeaderboard([])
        return
      }

      const submissionIds = [
        ...new Set(
          payoutLogs
            .map((log) => log.args.submissionId)
            .filter((submissionId): submissionId is bigint => submissionId !== undefined)
        )
      ]
      
      const submissionContracts = submissionIds.map((id) => ({
        address: BOUNTY_HUB_ADDRESS,
        abi: BOUNTY_HUB_V2_ABI,
        functionName: 'submissions' as const,
        args: [id] as const
      }))

      const submissions = await publicClient.multicall({
        contracts: submissionContracts,
        allowFailure: false
      }) as SubmissionTuple[]
      
      const severityMap = new Map<bigint, number>()
      submissions.forEach((sub, index) => {
        severityMap.set(submissionIds[index], sub[10])
      })

      const payoutRows = payoutLogs
        .map((log) => {
          const auditor = log.args.auditor
          const amount = log.args.amount
          const submissionId = log.args.submissionId
          if (!auditor || amount === undefined || submissionId === undefined) {
            return null
          }

          return {
            auditor,
            amount,
            submissionId,
          }
        })
        .filter((row): row is { auditor: Address; amount: bigint; submissionId: bigint } => row !== null)

      const sortedLeaderboard = aggregateLeaderboardEntries(
        payoutRows,
        severityMap,
        SEVERITY_HIGH,
        SEVERITY_CRITICAL
      )

      setLeaderboard(sortedLeaderboard)
    } catch (err) {
      console.error('Failed to fetch leaderboard:', err)
      if (shouldUsePreviewFallback()) {
        setLeaderboard([
          {
            rank: 1,
            address: '0x3333333333333333333333333333333333333333' as Address,
            validCount: 6,
            totalEarned: 3_200_000_000_000_000_000n,
            highCount: 4,
            criticalCount: 2,
          },
          {
            rank: 2,
            address: '0x4444444444444444444444444444444444444444' as Address,
            validCount: 4,
            totalEarned: 1_900_000_000_000_000_000n,
            highCount: 3,
            criticalCount: 1,
          },
        ])
        setError(formatPreviewFallbackMessage('Failed to load leaderboard data'))
        return
      }

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

  const connectedAddressLower = useMemo(
    () => connectedAddress?.toLowerCase() ?? null,
    [connectedAddress]
  )

  const summaryStats = useMemo(() => {
    return leaderboard.reduce(
      (acc, entry) => {
        acc.totalEarned += entry.totalEarned
        acc.totalCritical += entry.criticalCount
        acc.totalHigh += entry.highCount
        return acc
      },
      { totalEarned: 0n, totalCritical: 0, totalHigh: 0 }
    )
  }, [leaderboard])

  const isCurrentUser = (address: Address) =>
    connectedAddressLower !== null && connectedAddressLower === address.toLowerCase()

  return (
    <div className="min-h-[calc(100vh-142px)] flex flex-col py-6">
      <div className="container flex-1 flex flex-col min-h-0">
        <PageHeader 
          title="LEADERBOARD" 
          subtitle="> Top vulnerability hunters ranked by total earnings" 
          suffix={<span className="text-xs font-mono text-[var(--color-text-dim)]">[{leaderboard.length} HUNTERS]</span>} 
        />

        {isLoading && (
          <div className="flex-1 flex items-center justify-center text-center p-8 text-[var(--color-text-dim)]">
            <div>
              <div className="spinner w-8 h-8 mx-auto mb-4" />
              <p>Aggregating bounty data...</p>
            </div>
          </div>
        )}

        {error && (
          <StatusBanner
            variant={error.includes('Preview mode active') ? 'warning' : 'error'}
            className="mb-4"
            message={error}
          />
        )}

        {!isLoading && !error && leaderboard.length === 0 && (
          <div className="text-center p-16 mt-8 border border-dashed border-[var(--color-text-dim)] text-[var(--color-text-dim)]">
            <p className="font-mono">&gt; No bounty payouts recorded yet</p>
            <p className="text-sm mt-2">
              Leaderboard will populate as PoCs are verified and paid
            </p>
          </div>
        )}

        {!isLoading && !error && leaderboard.length > 0 && (
          <NeonPanel className="overflow-hidden" contentClassName="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-white/5 hover:bg-transparent">
                  <TableHead className="w-20 text-xs font-mono uppercase tracking-wider text-[var(--color-text-dim)]">
                    Rank
                  </TableHead>
                  <TableHead className="text-xs font-mono uppercase tracking-wider text-[var(--color-text-dim)]">
                    Auditor
                  </TableHead>
                  <TableHead className="text-center text-xs font-mono uppercase tracking-wider text-[var(--color-text-dim)]">
                    Valid
                  </TableHead>
                  <TableHead className="text-center text-xs font-mono uppercase tracking-wider text-[var(--color-text-dim)]">
                    High
                  </TableHead>
                  <TableHead className="text-center text-xs font-mono uppercase tracking-wider text-[var(--color-text-dim)]">
                    Critical
                  </TableHead>
                  <TableHead className="text-right text-xs font-mono uppercase tracking-wider text-[var(--color-text-dim)]">
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
                        border-b border-white/5 transition-all duration-200 ease-linear
                        ${isYou ? 'bg-[var(--color-secondary-dim)] border-l-4 border-l-[var(--color-secondary)]' : ''}
                        hover:bg-neutral-800
                      `}
                    >
                      <TableCell className="font-medium">
                        <RankBadge rank={entry.rank} />
                      </TableCell>

                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span 
                            className={`font-mono text-sm ${isYou ? 'text-[var(--color-secondary)]' : 'text-[var(--color-text)]'}`}
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
                        <span className="font-bold font-mono text-[var(--color-primary)]">
                          {entry.validCount}
                        </span>
                      </TableCell>

                      <TableCell className="text-center">
                        {entry.highCount > 0 ? (
                          <Badge variant="high" className="font-mono">
                            {entry.highCount}
                          </Badge>
                        ) : (
                          <span className="text-[var(--color-text-dim)]">0</span>
                        )}
                      </TableCell>

                      <TableCell className="text-center">
                        {entry.criticalCount > 0 ? (
                          <Badge variant="critical" className="font-mono">
                            {entry.criticalCount}
                          </Badge>
                        ) : (
                          <span className="text-[var(--color-text-dim)]">0</span>
                        )}
                      </TableCell>

                      <TableCell className="text-right">
                        <span className="font-bold font-mono text-[var(--color-primary)]">
                          {formatEther(entry.totalEarned)} ETH
                        </span>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </NeonPanel>
        )}

        {!isLoading && !error && leaderboard.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
            <StatCard label="Total Hunters" value={leaderboard.length} />
            <StatCard label="Total Payouts" value={formatEther(summaryStats.totalEarned).slice(0, 8)} subValue="ETH" />
            <StatCard label="Critical Bugs" value={summaryStats.totalCritical} color="var(--color-error)" />
            <StatCard label="High Severity" value={summaryStats.totalHigh} color="var(--color-warning)" />
          </div>
        )}
      </div>
    </div>
  )
}

export default Leaderboard
