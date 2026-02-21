'use client'

import { motion } from 'motion/react'
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { Project } from '@/types'

const formatEth = (wei: bigint): string => {
  const eth = Number(wei) / 1e18
  if (eth >= 1000) return `${(eth / 1000).toFixed(1)}K`
  if (eth >= 1) return eth.toFixed(2)
  return eth.toFixed(4)
}

const formatDeadline = (timestamp: bigint): { text: string; urgent: boolean } => {
  const now = Math.floor(Date.now() / 1000)
  const diff = Number(timestamp) - now
  
  if (diff <= 0) return { text: 'EXPIRED', urgent: true }
  if (diff < 3600) {
    const mins = Math.floor(diff / 60)
    return { text: `${mins}m`, urgent: true }
  }
  if (diff < 86400) {
    const hrs = Math.floor(diff / 3600)
    const mins = Math.floor((diff % 3600) / 60)
    return { text: `${hrs}h ${mins}m`, urgent: diff < 7200 }
  }
  const days = Math.floor(diff / 86400)
  const hrs = Math.floor((diff % 86400) / 3600)
  return { text: `${days}d ${hrs}h`, urgent: false }
}

const getModeLabel = (mode: number): string => mode === 0 ? 'UNIQUE' : 'MULTI'

const getStatusInfo = (project: Project): { label: string; className: string; glow: string } => {
  const now = BigInt(Math.floor(Date.now() / 1000))
  
  if (!project.active) return { label: 'INACTIVE', className: 'status-inactive', glow: 'transparent' }
  if (now > project.revealDeadline) return { label: 'ENDED', className: 'status-ended', glow: 'var(--color-error)' }
  if (now > project.commitDeadline) return { label: 'REVEAL', className: 'status-reveal', glow: 'var(--color-secondary-glow)' }
  return { label: 'OPEN', className: 'status-open', glow: 'var(--color-primary-glow)' }
}

interface ProjectCardProps {
  project: Project
  onClick?: () => void
  className?: string
}

export const ProjectCard: React.FC<ProjectCardProps> = ({ 
  project, 
  onClick,
  className 
}) => {
  const deadline = formatDeadline(project.commitDeadline)
  const status = getStatusInfo(project)
  const mode = getModeLabel(project.mode)
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4 }}
      transition={{ 
        duration: 0.2,
        ease: 'linear'
      }}
      className="h-full"
    >
      <Card 
        className={cn(
          'relative overflow-hidden cursor-pointer h-full',
          'bg-[var(--color-bg-panel)] border-[var(--color-text-dim)]/20',
          'hover:border-[var(--color-primary)]/50',
          'transition-colors duration-200 ease-linear',
          className
        )}
        onClick={onClick}
      >
        <motion.div 
          className="absolute inset-0 bg-gradient-to-br from-[var(--color-primary)]/10 via-transparent to-[var(--color-secondary)]/5 opacity-0 pointer-events-none"
          initial={{ opacity: 0 }}
          whileHover={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        />
        
        <div 
          className="project-card-scanline absolute inset-0 pointer-events-none opacity-[0.03]"
        />

        <CardHeader className="pb-3 relative">
          <div className="flex items-start justify-between gap-2">
            <CardTitle 
              className="font-mono text-sm tracking-wider text-[var(--color-text)] truncate"
            >
              PROJECT_{project.id.toString().padStart(3, '0')}
            </CardTitle>
            
            <motion.span
              className={cn("shrink-0 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider border", status.className)}
              animate={status.label === 'OPEN' ? {
                boxShadow: [`0 0 0px transparent`, `0 0 8px ${status.glow}`, `0 0 0px transparent`]
              } : {}}
              transition={{ duration: 2, repeat: Infinity }}
            >
              {status.label}
            </motion.span>
          </div>
          
          <p 
            className="font-mono text-[10px] text-[var(--color-text-dim)] truncate"
          >
            {project.targetContract.slice(0, 6)}...{project.targetContract.slice(-4)}
          </p>
        </CardHeader>

        <CardContent className="py-4 relative">
          <div className="text-center mb-4">
            <motion.div 
              className="project-card-bounty-value text-3xl font-bold"
              whileHover={{ scale: 1.05 }}
              transition={{ duration: 0.2, ease: 'linear' }}
            >
              {formatEth(project.bountyPool)} ETH
            </motion.div>
            <p className="text-[10px] text-[var(--color-text-dim)] mt-1 font-mono uppercase tracking-wider">
              Bounty Pool
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-2 bg-[var(--color-bg)]/50 border border-[var(--color-text-dim)]/10">
              <div className="text-sm font-mono text-[var(--color-secondary)]">
                {formatEth(project.maxPayoutPerBug)}
              </div>
              <div className="text-[9px] text-[var(--color-text-dim)] uppercase tracking-wider">
                Max/PoC
              </div>
            </div>
            
            <div className="p-2 bg-[var(--color-bg)]/50 border border-[var(--color-text-dim)]/10">
              <div 
                className={cn("text-sm font-mono", deadline.urgent ? "text-error" : "text-[var(--color-text)]")}
              >
                {deadline.text}
              </div>
              <div className="text-[9px] text-[var(--color-text-dim)] uppercase tracking-wider">
                Deadline
              </div>
            </div>
            
            <div className="p-2 bg-[var(--color-bg)]/50 border border-[var(--color-text-dim)]/10">
              <div className="text-sm font-mono text-[var(--color-secondary)]">
                {mode}
              </div>
              <div className="text-[9px] text-[var(--color-text-dim)] uppercase tracking-wider">
                Mode
              </div>
            </div>
          </div>
        </CardContent>

        <CardFooter className="pt-0 relative">
          <div 
            className="project-card-footer-line absolute bottom-0 left-0 right-0 h-px"
          />
          
          <div className="flex items-center justify-between w-full text-[10px] text-[var(--color-text-dim)] font-mono">
            <span>FORK: #{project.forkBlock.toString()}</span>
            <motion.span
              className="flex items-center gap-1"
              whileHover={{ color: 'var(--color-primary)' }}
            >
              VIEW →
            </motion.span>
          </div>
        </CardFooter>
      </Card>
    </motion.div>
  )
}

export default ProjectCard
