import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { formatEther, createPublicClient, http, parseAbiItem } from 'viem'
import type { Address } from 'viem'
import { BOUNTY_HUB_ADDRESS, BOUNTY_HUB_V2_ABI, CHAIN } from '../config'
import { Card, CardContent } from '../components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table'
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
  transport: http('https://1rpc.io/sepolia')
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

      const latestBlock = await publicClient.getBlockNumber()
      const fromBlock = latestBlock > 10000n ? latestBlock - 10000n : 0n

      const logs = await publicClient.getLogs({
        address: BOUNTY_HUB_ADDRESS,
        event: parseAbiItem('event PoCCommitted(uint256 indexed submissionId, uint256 indexed projectId, address indexed auditor, bytes32 commitHash)'),
        args: { auditor: userAddress },
        fromBlock,
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
      <div className="min-h-[calc(100vh-142px)] flex items-center justify-center">
        <Card className="w-full max-w-md border-[var(--color-bg-light)] bg-gradient-to-br from-[rgba(17,17,17,0.9)] to-[rgba(10,10,10,0.95)] relative overflow-hidden">
          <div className="absolute inset-0 bg-[repeating-linear-gradient(0deg,transparent,transparent_2px,rgba(0,255,157,0.03)_2px,rgba(0,255,157,0.03)_4px)] pointer-events-none" />
          
          <CardContent className="p-8 text-center relative z-10">
            <div className="w-20 h-20 mx-auto mb-6 border-2 border-[var(--color-primary)] rounded-full flex items-center justify-center bg-[rgba(0,255,157,0.05)] shadow-[0_0_30px_rgba(0,255,157,0.2)]">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            </div>

            <h1 className="font-[var(--font-display)] text-2xl mb-4 tracking-[0.1em] text-[var(--color-text)]">
              AUDITOR DASHBOARD
            </h1>

            <p className="text-[var(--color-text-dim)] font-[var(--font-mono)] text-sm mb-8 leading-relaxed">
              Connect your wallet to view your submissions,<br/>
              track earnings, and manage pending payouts.
            </p>

            <button
              onClick={connect}
              disabled={isConnecting}
              className="bg-gradient-to-br from-[var(--color-primary)] to-[#00cc99] text-[var(--color-bg)] border-none px-12 py-4 font-[var(--font-display)] text-sm tracking-[0.1em] cursor-pointer shadow-[0_0_20px_rgba(0,255,157,0.3)] hover:shadow-[0_0_30px_rgba(0,255,157,0.5)] hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-70 disabled:cursor-wait"
            >
              {isConnecting ? 'CONNECTING...' : 'CONNECT WALLET'}
            </button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="h-[calc(100vh-142px)] flex flex-col overflow-hidden">
      <div className="container flex-1 flex flex-col overflow-hidden">
        <header className="mb-6 flex-shrink-0">
          <div className="flex items-baseline gap-4 mb-1">
            <h1 className="text-2xl font-[var(--font-display)] uppercase tracking-[0.1em] text-[var(--color-primary)]">
              DASHBOARD
            </h1>
            <span className="text-[var(--color-text-dim)] text-xs font-[var(--font-mono)]">
              [{address?.slice(0, 6)}...{address?.slice(-4)}]
            </span>
          </div>
          <div className="h-0.5 bg-gradient-to-r from-[var(--color-primary)] to-transparent w-40" />
          <p className="text-[var(--color-text-dim)] mt-2 font-[var(--font-mono)] text-xs">
            &gt; Your audit performance and submission history
          </p>
        </header>

        {error && (
          <Card className="mb-4 flex-shrink-0 border-[var(--color-error)] bg-[rgba(255,0,60,0.1)]">
            <CardContent className="p-4 text-[var(--color-error)] font-[var(--font-mono)]">
              {error}
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 flex-shrink-0">
          <Card className="border-[var(--color-bg-light)] bg-gradient-to-br from-[rgba(17,17,17,0.9)] to-[rgba(10,10,10,0.95)] hover:border-[var(--color-primary)] hover:shadow-[0_0_20px_rgba(0,255,157,0.1)] transition-all duration-200">
            <CardContent className="p-6 text-center">
              <div className="text-xs font-[var(--font-mono)] text-[var(--color-text-dim)] mb-2 uppercase tracking-[0.1em]">
                TOTAL EARNED
              </div>
              <div className="text-2xl font-[var(--font-display)] font-bold text-[var(--color-primary)]">
                {formatEther(totalEarned)} ETH
              </div>
            </CardContent>
          </Card>

          <Card className="border-[var(--color-bg-light)] bg-gradient-to-br from-[rgba(17,17,17,0.9)] to-[rgba(10,10,10,0.95)] hover:border-[var(--color-primary)] hover:shadow-[0_0_20px_rgba(0,255,157,0.1)] transition-all duration-200">
            <CardContent className="p-6 text-center">
              <div className="text-xs font-[var(--font-mono)] text-[var(--color-text-dim)] mb-2 uppercase tracking-[0.1em]">
                SUBMISSIONS
              </div>
              <div className="text-2xl font-[var(--font-display)] font-bold text-[var(--color-text)]">
                {totalCount}
              </div>
            </CardContent>
          </Card>

          <Card className="border-[var(--color-bg-light)] bg-gradient-to-br from-[rgba(17,17,17,0.9)] to-[rgba(10,10,10,0.95)] hover:border-[var(--color-primary)] hover:shadow-[0_0_20px_rgba(0,255,157,0.1)] transition-all duration-200">
            <CardContent className="p-6 text-center">
              <div className="text-xs font-[var(--font-mono)] text-[var(--color-text-dim)] mb-2 uppercase tracking-[0.1em]">
                VALID
              </div>
              <div className="text-2xl font-[var(--font-display)] font-bold text-[var(--color-secondary)]">
                {validCount}
              </div>
              {totalCount > 0 && (
                <div className="text-xs font-[var(--font-mono)] text-[var(--color-text-dim)] mt-1">
                  {Math.round((validCount / totalCount) * 100)}% rate
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-[var(--color-bg-light)] bg-gradient-to-br from-[rgba(17,17,17,0.9)] to-[rgba(10,10,10,0.95)] hover:border-[var(--color-warning)] hover:shadow-[0_0_20px_rgba(255,170,0,0.1)] transition-all duration-200">
            <CardContent className="p-6 text-center">
              <div className="text-xs font-[var(--font-mono)] text-[var(--color-text-dim)] mb-2 uppercase tracking-[0.1em]">
                PENDING
              </div>
              <div className="text-2xl font-[var(--font-display)] font-bold text-[var(--color-warning)]">
                {pendingCount}
              </div>
              <div className="text-xs font-[var(--font-mono)] text-[var(--color-text-dim)] mt-1">
                awaiting finalization
              </div>
            </CardContent>
          </Card>
        </div>

        {pendingPayouts.length > 0 && (
          <section className="mb-8 flex-shrink-0">
            <h2 className="font-[var(--font-display)] text-lg text-[var(--color-warning)] mb-4 tracking-[0.05em] flex items-center gap-2">
              <span className="w-2 h-2 bg-[var(--color-warning)] rounded-full animate-pulse" />
              PENDING PAYOUTS [{pendingPayouts.length}]
            </h2>
            <Card className="border-[var(--color-warning)] bg-gradient-to-br from-[rgba(17,17,17,0.9)] to-[rgba(10,10,10,0.95)] shadow-[0_0_30px_rgba(255,170,0,0.15)] overflow-hidden">
              <CardContent className="p-0">
                <Table>
                  <TableBody>
                    {pendingPayouts.map((sub) => (
                      <TableRow 
                        key={sub.id.toString()}
                        className="border-[var(--color-bg-light)] hover:bg-[rgba(255,170,0,0.05)] font-[var(--font-mono)] text-sm"
                      >
                        <TableCell className="py-4 px-6">
                          <span className="text-[var(--color-text-dim)]">PROJECT #{sub.projectId.toString()}</span>
                          <span className="mx-2 text-[var(--color-text-dim)]">|</span>
                          <SeverityBadge severity={sub.severity} />
                        </TableCell>
                        <TableCell className="py-4 px-6 text-right">
                          <span className="text-[var(--color-warning)] font-bold text-base">
                            {formatEther(sub.payoutAmount)} ETH
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </section>
        )}

        <section className="flex-1 overflow-hidden flex flex-col min-h-0">
          <h2 className="font-[var(--font-display)] text-lg text-[var(--color-text)] mb-4 tracking-[0.05em] flex-shrink-0">
            RECENT SUBMISSIONS [{submissions.length}]
          </h2>

          {isLoading && (
            <Card className="border-[var(--color-bg-light)] flex-1 flex items-center justify-center">
              <CardContent className="text-center p-8">
                <div className="w-8 h-8 border-2 border-[var(--color-bg)] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p className="text-[var(--color-text-dim)] font-[var(--font-mono)]">Loading submissions...</p>
              </CardContent>
            </Card>
          )}

          {!isLoading && submissions.length === 0 && (
            <Card className="border-dashed border-[var(--color-text-dim)] bg-[rgba(0,0,0,0.2)] flex-1 flex items-center justify-center">
              <CardContent className="text-center p-8">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="mx-auto mb-4 opacity-50">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="12" y1="18" x2="12" y2="12"/>
                  <line x1="9" y1="15" x2="15" y2="15"/>
                </svg>
                <p className="font-[var(--font-mono)] mb-2 text-[var(--color-text-dim)]">
                  &gt; No submissions found
                </p>
                <p className="text-sm text-[var(--color-text-dim)]">
                  Submit your first PoC to start earning bounties
                </p>
                <Link 
                  to="/builder"
                  className="inline-block mt-6 text-[var(--color-primary)] font-[var(--font-mono)] no-underline py-3 px-6 border border-[var(--color-primary)] transition-all duration-200 hover:bg-[var(--color-primary)] hover:text-[var(--color-bg)]"
                >
                  SUBMIT POC →
                </Link>
              </CardContent>
            </Card>
          )}

          {!isLoading && submissions.length > 0 && (
            <Card className="border-[var(--color-bg-light)] bg-gradient-to-br from-[rgba(17,17,17,0.9)] to-[rgba(10,10,10,0.95)] flex-1 overflow-hidden flex flex-col">
              <CardContent className="p-0 flex-1 overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-[var(--color-bg-light)] bg-[var(--color-bg-light)] hover:bg-[var(--color-bg-light)]">
                      <TableHead className="font-[var(--font-mono)] text-xs text-[var(--color-text-dim)] tracking-[0.05em] uppercase w-20">ID</TableHead>
                      <TableHead className="font-[var(--font-mono)] text-xs text-[var(--color-text-dim)] tracking-[0.05em] uppercase">PROJECT</TableHead>
                      <TableHead className="font-[var(--font-mono)] text-xs text-[var(--color-text-dim)] tracking-[0.05em] uppercase w-28">SEVERITY</TableHead>
                      <TableHead className="font-[var(--font-mono)] text-xs text-[var(--color-text-dim)] tracking-[0.05em] uppercase w-28">STATUS</TableHead>
                      <TableHead className="font-[var(--font-mono)] text-xs text-[var(--color-text-dim)] tracking-[0.05em] uppercase w-36">PAYOUT</TableHead>
                      <TableHead className="font-[var(--font-mono)] text-xs text-[var(--color-text-dim)] tracking-[0.05em] uppercase w-28">DATE</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {submissions.map((sub) => (
                      <TableRow 
                        key={sub.id.toString()}
                        className={`border-[var(--color-bg-light)] font-[var(--font-mono)] text-sm hover:bg-[rgba(0,255,157,0.03)] transition-colors ${
                          sub.status === STATUS_VERIFIED && sub.payoutAmount > 0n 
                            ? 'border-l-2 border-l-[var(--color-warning)] bg-[rgba(255,170,0,0.03)]' 
                            : ''
                        }`}
                      >
                        <TableCell className="text-[var(--color-text-dim)]">
                          #{sub.id.toString()}
                        </TableCell>
                        <TableCell>
                          <Link 
                            to={`/project/${sub.projectId.toString()}`}
                            className="text-[var(--color-secondary)] no-underline hover:underline"
                          >
                            PROJECT #{sub.projectId.toString()}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <SeverityBadge severity={sub.severity} />
                        </TableCell>
                        <TableCell>
                          <span 
                            className="px-2 py-1 text-xs font-bold"
                            style={{ 
                              background: `${getStatusColor(sub.status)}15`,
                              color: getStatusColor(sub.status)
                            }}
                          >
                            {STATUS_LABELS[sub.status]}
                          </span>
                        </TableCell>
                        <TableCell className={sub.payoutAmount > 0n ? 'text-[var(--color-primary)] font-bold' : 'text-[var(--color-text-dim)] font-normal'}>
                          {sub.payoutAmount > 0n ? `${formatEther(sub.payoutAmount)} ETH` : '-'}
                        </TableCell>
                        <TableCell className="text-[var(--color-text-dim)] text-xs">
                          {formatTimestamp(sub.commitTimestamp)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </section>
      </div>
    </div>
  )
}

export default Dashboard
