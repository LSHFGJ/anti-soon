import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { formatEther, type Address } from 'viem'
import { BOUNTY_HUB_ADDRESS, BOUNTY_HUB_V2_ABI, CHAIN } from '../config'
import { createPublicClient, http } from 'viem'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface Project {
  id: bigint
  owner: Address
  bountyPool: bigint
  maxPayoutPerBug: bigint
  targetContract: Address
  forkBlock: bigint
  active: boolean
  mode: number
  commitDeadline: bigint
  revealDeadline: bigint
  disputeWindow: bigint
  rulesHash: `0x${string}`
}

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
  rulesHash: `0x${string}`,
  projectPublicKey: `0x${string}`
]

const publicClient = createPublicClient({
  chain: CHAIN,
  transport: http()
})

type StatusFilter = 'all' | 'active' | 'inactive'
type ModeFilter = 'all' | 'unique' | 'multi'

function ProjectCardSkeleton() {
  return (
    <Card className="bg-gradient-to-br from-[rgba(17,17,17,0.9)] to-[rgba(10,10,10,0.95)] border-[var(--color-bg-light)] overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-5 w-16" />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex justify-between items-center">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

export function Explorer() {
  const [projects, setProjects] = useState<Project[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active')
  const [modeFilter, setModeFilter] = useState<ModeFilter>('all')

  const fetchProjects = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      
      const nextId = await publicClient.readContract({
        address: BOUNTY_HUB_ADDRESS,
        abi: BOUNTY_HUB_V2_ABI,
        functionName: 'nextProjectId'
      }) as bigint

      const projectPromises = []
      for (let i = 0n; i < nextId; i++) {
        projectPromises.push(
          publicClient.readContract({
            address: BOUNTY_HUB_ADDRESS,
            abi: BOUNTY_HUB_V2_ABI,
            functionName: 'projects',
            args: [i]
          })
        )
      }

      const results = await Promise.all(projectPromises) as ProjectTuple[]
      const fetchedProjects: Project[] = results.map((data, index) => ({
        id: BigInt(index),
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
      }))

      setProjects(fetchedProjects)
    } catch (err) {
      console.error('Failed to fetch projects:', err)
      setError('Failed to load projects from blockchain')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchProjects()
  }, [fetchProjects])

  const getDeadlineStatus = (project: Project): 'open' | 'reveal' | 'closed' => {
    const now = BigInt(Math.floor(Date.now() / 1000))
    if (project.commitDeadline === 0n || now < project.commitDeadline) {
      return 'open'
    }
    if (project.revealDeadline === 0n || now < project.revealDeadline) {
      return 'reveal'
    }
    return 'closed'
  }

  const filteredProjects = projects.filter((project) => {
    if (statusFilter === 'active' && !project.active) return false
    if (statusFilter === 'inactive' && project.active) return false
    if (modeFilter === 'unique' && project.mode !== 0) return false
    if (modeFilter === 'multi' && project.mode !== 1) return false
    
    return true
  })

  return (
    <div className="h-[calc(100vh-142px)] flex flex-col overflow-hidden">
      <div className="container flex-1 flex flex-col overflow-hidden">
        <header className="mb-6 flex-shrink-0">
          <div className="flex items-baseline gap-4 mb-1">
            <h1 className="text-2xl font-[var(--font-display)] uppercase tracking-widest text-[var(--color-primary)]">
              EXPLORER
            </h1>
            <span className="text-[var(--color-text-dim)] text-xs font-[var(--font-mono)]">
              [{filteredProjects.length} {statusFilter.toUpperCase()}]
            </span>
          </div>
          <div className="h-0.5 w-36 bg-gradient-to-r from-[var(--color-primary)] to-transparent" />
          <p className="text-[var(--color-text-dim)] mt-2 font-[var(--font-mono)] text-xs">
            &gt; Browse bounty projects
          </p>
        </header>

        <div className="flex gap-4 mb-6 flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-[var(--color-text-dim)] text-xs font-[var(--font-mono)] uppercase">
              Status:
            </span>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
              <SelectTrigger className="w-32 h-9 bg-[var(--color-bg-light)] border-[var(--color-bg-light)] text-[var(--color-text)] font-[var(--font-mono)] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[var(--color-bg-light)] border-[var(--color-bg-light)]">
                <SelectItem value="active" className="text-[var(--color-text)] text-xs font-[var(--font-mono)]">Active</SelectItem>
                <SelectItem value="all" className="text-[var(--color-text)] text-xs font-[var(--font-mono)]">All</SelectItem>
                <SelectItem value="inactive" className="text-[var(--color-text)] text-xs font-[var(--font-mono)]">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[var(--color-text-dim)] text-xs font-[var(--font-mono)] uppercase">
              Mode:
            </span>
            <Select value={modeFilter} onValueChange={(v) => setModeFilter(v as ModeFilter)}>
              <SelectTrigger className="w-32 h-9 bg-[var(--color-bg-light)] border-[var(--color-bg-light)] text-[var(--color-text)] font-[var(--font-mono)] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[var(--color-bg-light)] border-[var(--color-bg-light)]">
                <SelectItem value="all" className="text-[var(--color-text)] text-xs font-[var(--font-mono)]">All</SelectItem>
                <SelectItem value="unique" className="text-[var(--color-text)] text-xs font-[var(--font-mono)]">Unique</SelectItem>
                <SelectItem value="multi" className="text-[var(--color-text)] text-xs font-[var(--font-mono)]">Multi</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {error && (
          <div className="p-4 border border-[var(--color-error)] text-[var(--color-error)] bg-[rgba(255,0,60,0.1)] mb-4 flex-shrink-0">
            {error}
          </div>
        )}

        {isLoading && (
          <div className="flex-1 overflow-y-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 content-start">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <ProjectCardSkeleton key={i} />
              ))}
            </div>
          </div>
        )}

        {!isLoading && (
          <div className="flex-1 overflow-y-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 content-start">
              {filteredProjects.map((project) => {
                const deadlineStatus = getDeadlineStatus(project)
                return (
                  <Link
                    key={project.id.toString()}
                    to={`/project/${project.id.toString()}`}
                    className="block group"
                  >
                    <Card className="bg-gradient-to-br from-[rgba(17,17,17,0.9)] to-[rgba(10,10,10,0.95)] border-[var(--color-bg-light)] hover:border-[var(--color-primary)] hover:shadow-[0_0_20px_rgba(0,255,157,0.1)] transition-all duration-200 overflow-hidden h-full">
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base font-[var(--font-display)] tracking-wide text-[var(--color-text)]">
                            PROJECT_#{project.id.toString()}
                          </CardTitle>
                          <Badge variant={project.mode === 0 ? 'unique' : 'multi'} className="text-[0.65rem] px-2 py-0.5">
                            {project.mode === 0 ? 'UNIQUE' : 'MULTI'}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-2 font-[var(--font-mono)] text-xs">
                        <div className="flex justify-between">
                          <span className="text-[var(--color-text-dim)]">BOUNTY</span>
                          <span className="text-[var(--color-primary)] font-bold">
                            {formatEther(project.bountyPool)} ETH
                          </span>
                        </div>
                        
                        <div className="flex justify-between">
                          <span className="text-[var(--color-text-dim)]">MAX_PAYOUT</span>
                          <span className="text-[var(--color-text)]">{formatEther(project.maxPayoutPerBug)} ETH</span>
                        </div>

                        <div className="flex justify-between">
                          <span className="text-[var(--color-text-dim)]">TARGET</span>
                          <span className="text-[var(--color-secondary)]">
                            {project.targetContract.slice(0, 6)}...{project.targetContract.slice(-4)}
                          </span>
                        </div>

                        <div className="flex justify-between">
                          <span className="text-[var(--color-text-dim)]">FORK_BLOCK</span>
                          <span className="text-[var(--color-text)]">{project.forkBlock.toString()}</span>
                        </div>

                        <div className="flex justify-between pt-2 border-t border-[var(--color-bg-light)]">
                          <span className="text-[var(--color-text-dim)]">STATUS</span>
                          <Badge variant={deadlineStatus} className="text-[0.65rem] px-2 py-0.5">
                            {deadlineStatus.toUpperCase()}
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                )
              })}
            </div>

            {filteredProjects.length === 0 && (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-[var(--color-text-dim)] border border-dashed border-[var(--color-text-dim)]">
                <p className="font-[var(--font-mono)]">
                  &gt; No projects found
                </p>
                <p className="text-xs mt-2">
                  {statusFilter === 'active' 
                    ? 'Active projects will appear here once registered on-chain'
                    : 'Try changing the filter criteria'}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default Explorer
