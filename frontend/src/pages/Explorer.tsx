import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { formatEther, type Address } from 'viem'
import { BOUNTY_HUB_ADDRESS, BOUNTY_HUB_V2_ABI, CHAIN } from '../config'
import { createPublicClient, http } from 'viem'

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
  rulesHash: `0x${string}`
]

const publicClient = createPublicClient({
  chain: CHAIN,
  transport: http()
})

export function Explorer() {
  const [projects, setProjects] = useState<Project[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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

  const getDeadlineStatus = (project: Project) => {
    const now = BigInt(Math.floor(Date.now() / 1000))
    if (project.commitDeadline === 0n || now < project.commitDeadline) {
      return { text: 'OPEN', color: 'var(--color-primary)' }
    }
    if (project.revealDeadline === 0n || now < project.revealDeadline) {
      return { text: 'REVEAL', color: 'var(--color-secondary)' }
    }
    return { text: 'CLOSED', color: 'var(--color-error)' }
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
              EXPLORER
            </h1>
            <span style={{ 
              color: 'var(--color-text-dim)', 
              fontSize: '0.8rem',
              fontFamily: 'var(--font-mono)'
            }}>
              [{projects.filter(p => p.active).length} ACTIVE]
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
            &gt; Browse active bounty projects
          </p>
        </header>

        {isLoading && (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-dim)', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="spinner" style={{ width: '32px', height: '32px', margin: '0 auto 1rem' }} />
            <p>Scanning blockchain...</p>
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

        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', 
          gap: '1rem',
          flex: 1,
          overflowY: 'auto',
          alignContent: 'start'
        }}>
          {projects.filter(p => p.active).map((project) => {
            const deadlineStatus = getDeadlineStatus(project)
            return (
              <Link
                key={project.id.toString()}
                to={`/project/${project.id.toString()}`}
                style={{
                  display: 'block',
                  background: 'linear-gradient(135deg, rgba(17, 17, 17, 0.9), rgba(10, 10, 10, 0.95))',
                  border: '1px solid var(--color-bg-light)',
                  borderRadius: '4px',
                  padding: '1.5rem',
                  textDecoration: 'none',
                  transition: 'all 0.2s',
                  position: 'relative',
                  overflow: 'hidden'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-primary)'
                  e.currentTarget.style.boxShadow = '0 0 20px rgba(0, 255, 157, 0.1)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-bg-light)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              >
                <div style={{
                  position: 'absolute',
                  top: 0,
                  right: 0,
                  padding: '0.25rem 0.75rem',
                  background: project.mode === 0 ? 'var(--color-primary)' : 'var(--color-secondary)',
                  color: 'var(--color-bg)',
                  fontSize: '0.7rem',
                  fontWeight: 'bold',
                  fontFamily: 'var(--font-display)',
                  letterSpacing: '0.1em'
                }}>
                  {project.mode === 0 ? 'UNIQUE' : 'MULTI'}
                </div>

                <h3 style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '1.2rem',
                  marginBottom: '1rem',
                  color: 'var(--color-text)',
                  letterSpacing: '0.05em'
                }}>
                  PROJECT_#{project.id.toString()}
                </h3>

                <div style={{ 
                  display: 'flex', 
                  flexDirection: 'column', 
                  gap: '0.75rem',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.85rem'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--color-text-dim)' }}>BOUNTY</span>
                    <span style={{ color: 'var(--color-primary)', fontWeight: 'bold' }}>
                      {formatEther(project.bountyPool)} ETH
                    </span>
                  </div>
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--color-text-dim)' }}>MAX_PAYOUT</span>
                    <span>{formatEther(project.maxPayoutPerBug)} ETH</span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--color-text-dim)' }}>TARGET</span>
                    <span style={{ 
                      color: 'var(--color-secondary)',
                      fontSize: '0.8rem'
                    }}>
                      {project.targetContract.slice(0, 6)}...{project.targetContract.slice(-4)}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--color-text-dim)' }}>FORK_BLOCK</span>
                    <span>{project.forkBlock.toString()}</span>
                  </div>

                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between',
                    paddingTop: '0.5rem',
                    borderTop: '1px solid var(--color-bg-light)'
                  }}>
                    <span style={{ color: 'var(--color-text-dim)' }}>STATUS</span>
                    <span style={{ color: deadlineStatus.color, fontWeight: 'bold' }}>
                      [{deadlineStatus.text}]
                    </span>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>

        {projects.filter(p => p.active).length === 0 && !isLoading && (
          <div style={{ 
            textAlign: 'center', 
            padding: '2rem',
            color: 'var(--color-text-dim)',
            border: '1px dashed var(--color-text-dim)',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <p style={{ fontFamily: 'var(--font-mono)' }}>
              &gt; No active projects found
            </p>
            <p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>
              Projects will appear here once registered on-chain
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

export default Explorer
