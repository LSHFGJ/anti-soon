import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { formatEther } from 'viem'
import { readAllProjectIds } from '../lib/projectIndex'
import { readProjectsByIds } from '../lib/projectReads'
import type { Project } from '../types'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PageHeader, StatusBanner, NeonPanel } from '@/components/shared/ui-primitives'
import { buildPreviewProject, formatPreviewFallbackMessage, shouldUsePreviewFallback } from '@/lib/previewFallback'

type StatusFilter = 'all' | 'active' | 'inactive'
type ModeFilter = 'all' | 'unique' | 'multi'

function ProjectCardSkeleton() {
  return (
    <NeonPanel className="overflow-hidden" contentClassName="p-0">
      <div className="p-6 pb-2">
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-32 bg-neutral-800" />
          <Skeleton className="h-5 w-16 bg-neutral-800" />
        </div>
      </div>
      <div className="p-6 pt-2 space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex justify-between items-center">
            <Skeleton className="h-4 w-20 bg-neutral-800" />
            <Skeleton className="h-4 w-24 bg-neutral-800" />
          </div>
        ))}
      </div>
    </NeonPanel>
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

      const projectIds = await readAllProjectIds()
      if (projectIds.length === 0) {
        setProjects([])
        return
      }

      const fetchedProjects: Project[] = await readProjectsByIds(projectIds)

      setProjects(fetchedProjects)
    } catch (err) {
      console.error('Failed to fetch projects:', err)
      if (shouldUsePreviewFallback()) {
        setProjects([buildPreviewProject(0n), buildPreviewProject(1n), buildPreviewProject(2n)])
        setError(formatPreviewFallbackMessage('Failed to load projects from blockchain'))
        return
      }

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
    <div className="min-h-[calc(100vh-142px)] flex flex-col py-6">
      <div className="container flex-1 flex flex-col min-h-0">
        <PageHeader 
          title="EXPLORER" 
          subtitle="> Browse bounty projects" 
          suffix={<span className="text-[var(--color-text-dim)] text-xs font-mono">[{filteredProjects.length} {statusFilter.toUpperCase()}]</span>} 
        />

        <div className="flex gap-4 mb-6 flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-[var(--color-text-dim)] text-xs font-mono uppercase">
              Status:
            </span>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
              <SelectTrigger className="w-32 h-9 bg-neutral-900/80 border-neutral-800 text-[var(--color-text)] font-mono text-xs hover:border-[var(--color-primary-dim)] transition-colors ring-0 shadow-none focus:ring-0 focus:shadow-none focus-visible:ring-0 focus-visible:outline-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[var(--color-bg-panel)] backdrop-blur-md border-neutral-800">
                <SelectItem value="active" className="text-[var(--color-text)] text-xs font-mono outline-none ring-0 shadow-none focus:bg-[var(--color-primary-dim)] focus:text-[var(--color-primary)] focus:ring-0 focus-visible:ring-0 data-[state=checked]:bg-transparent">Active</SelectItem>
                <SelectItem value="all" className="text-[var(--color-text)] text-xs font-mono outline-none ring-0 shadow-none focus:bg-[var(--color-primary-dim)] focus:text-[var(--color-primary)] focus:ring-0 focus-visible:ring-0 data-[state=checked]:bg-transparent">All</SelectItem>
                <SelectItem value="inactive" className="text-[var(--color-text)] text-xs font-mono outline-none ring-0 shadow-none focus:bg-[var(--color-primary-dim)] focus:text-[var(--color-primary)] focus:ring-0 focus-visible:ring-0 data-[state=checked]:bg-transparent">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[var(--color-text-dim)] text-xs font-mono uppercase">
              Mode:
            </span>
            <Select value={modeFilter} onValueChange={(v) => setModeFilter(v as ModeFilter)}>
              <SelectTrigger className="w-32 h-9 bg-neutral-900/80 border-neutral-800 text-[var(--color-text)] font-mono text-xs hover:border-[var(--color-primary-dim)] transition-colors ring-0 shadow-none focus:ring-0 focus:shadow-none focus-visible:ring-0 focus-visible:outline-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[var(--color-bg-panel)] backdrop-blur-md border-neutral-800">
                <SelectItem value="all" className="text-[var(--color-text)] text-xs font-mono outline-none ring-0 shadow-none focus:bg-[var(--color-primary-dim)] focus:text-[var(--color-primary)] focus:ring-0 focus-visible:ring-0 data-[state=checked]:bg-transparent">All</SelectItem>
                <SelectItem value="unique" className="text-[var(--color-text)] text-xs font-mono outline-none ring-0 shadow-none focus:bg-[var(--color-primary-dim)] focus:text-[var(--color-primary)] focus:ring-0 focus-visible:ring-0 data-[state=checked]:bg-transparent">Unique</SelectItem>
                <SelectItem value="multi" className="text-[var(--color-text)] text-xs font-mono outline-none ring-0 shadow-none focus:bg-[var(--color-primary-dim)] focus:text-[var(--color-primary)] focus:ring-0 focus-visible:ring-0 data-[state=checked]:bg-transparent">Multi</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {error && (
          <StatusBanner
            variant={error.includes('Preview mode active') ? 'warning' : 'error'}
            className="mb-4"
            message={error}
          />
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
                    <NeonPanel className="hover:border-[var(--color-primary-dim)] hover:shadow-[0_10px_30px_-10px_var(--color-primary-dim)] h-full relative group" contentClassName="p-0">
                <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[var(--color-primary-dim)] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 ease-linear" />
                      <div className="p-6 pb-2">
                        <div className="flex items-center justify-between">
                  <h3 className="text-base font-mono tracking-wide text-[var(--color-text)] group-hover:text-[var(--color-primary)] transition-colors duration-200 ease-linear">
                            PROJECT_#{project.id.toString()}
                          </h3>
                          <Badge variant={project.mode === 0 ? 'unique' : 'multi'} className="text-[0.65rem] px-2 py-0.5">
                            {project.mode === 0 ? 'UNIQUE' : 'MULTI'}
                          </Badge>
                        </div>
                      </div>
                      <div className="p-6 pt-2 space-y-2 font-mono text-xs">
                        <div className="flex justify-between">
                          <span className="text-[var(--color-text-dim)]">BOUNTY</span>
                          <span className="text-[var(--color-primary)] font-bold text-shadow-[0_0_10px_var(--color-primary-dim)]">
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

                        <div className="flex justify-between pt-2 border-t border-white/5">
                          <span className="text-[var(--color-text-dim)]">STATUS</span>
                          <Badge variant={deadlineStatus} className="text-[0.65rem] px-2 py-0.5">
                            {deadlineStatus.toUpperCase()}
                          </Badge>
                        </div>
                      </div>
                    </NeonPanel>
                  </Link>
                )
              })}
            </div>

            {filteredProjects.length === 0 && (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-[var(--color-text-dim)] border border-dashed border-[var(--color-text-dim)]">
                <p className="font-mono">
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
