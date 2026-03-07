import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useParams, useSearchParams } from 'react-router-dom'
import { PoCBuilder } from '../components/PoCBuilder'
import { PageHeader } from '../components/shared/ui-primitives'
import { BOUNTY_HUB_ADDRESS, BOUNTY_HUB_V2_ABI } from '../config'
import { readContractWithRpcFallback } from '../lib/publicClient'
import { resolveSubmissionProjectId } from './builderProjectResolution'
import { readProjectsByIds } from '../lib/projectReads'
import type { Project } from '../types'

type BuilderLocationState = {
  projectId?: string | number | bigint
}

const VNET_STATUS_ACTIVE = 2
const PROJECT_CONTEXT_CHUNK_SIZE = 24

export function Builder() {
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const { projectId: pathProjectId } = useParams<{ projectId?: string }>()
  const selectedProject = null

  const explicitProjectId = useMemo(() => {
    const state = location.state as BuilderLocationState | null

    return resolveSubmissionProjectId(
      state?.projectId,
      pathProjectId,
      searchParams.get('projectId'),
      searchParams.get('project')
    )
  }, [location.state, pathProjectId, searchParams])

  const [defaultProjectId, setDefaultProjectId] = useState<bigint | null>(null)
  const [manualProjectId, setManualProjectId] = useState<bigint | null>(null)
  const [availableProjects, setAvailableProjects] = useState<Project[]>([])
  const [isProjectContextLoading, setIsProjectContextLoading] = useState(true)

  useEffect(() => {
    if (explicitProjectId !== null) {
      setManualProjectId(null)
    }
  }, [explicitProjectId])

  useEffect(() => {
    let cancelled = false

    const readProjectChunksDescending = async (nextProjectId: bigint) => {
      const loadedProjects: Project[] = []

      for (let endExclusive = Number(nextProjectId); endExclusive > 0; endExclusive -= PROJECT_CONTEXT_CHUNK_SIZE) {
        const startInclusive = Math.max(0, endExclusive - PROJECT_CONTEXT_CHUNK_SIZE)
        const chunkIds = Array.from(
          { length: endExclusive - startInclusive },
          (_, index) => BigInt(endExclusive - 1 - index),
        )

        const chunkProjects = await readProjectsByIds(chunkIds)
        loadedProjects.push(...chunkProjects)

        if (cancelled) {
          return loadedProjects
        }

        if (explicitProjectId === null) {
          const firstReadyProject = loadedProjects.find(
            (project) => project.active && project.vnetStatus === VNET_STATUS_ACTIVE,
          )

          if (firstReadyProject) {
            setAvailableProjects(loadedProjects)
            setDefaultProjectId(firstReadyProject.id)
            setIsProjectContextLoading(false)
            break
          }
        }
      }

      return loadedProjects
    }

    const loadProjectContext = async () => {
      setIsProjectContextLoading(true)

      if (explicitProjectId !== null) {
        try {
          const explicitProjects = await readProjectsByIds([explicitProjectId])

          if (!cancelled && explicitProjects.length > 0) {
            setAvailableProjects(explicitProjects)
            setDefaultProjectId(null)
            setIsProjectContextLoading(false)
          }
        } catch {}
      }

      try {
        const nextProjectId = await readContractWithRpcFallback({
          address: BOUNTY_HUB_ADDRESS,
          abi: BOUNTY_HUB_V2_ABI,
          functionName: 'nextProjectId'
        }) as bigint

        if (nextProjectId === 0n) {
          let projects: Project[] = []

          if (explicitProjectId !== null) {
            try {
              projects = await readProjectsByIds([explicitProjectId])
            } catch {
              projects = []
            }
          }

          if (!cancelled) {
            setAvailableProjects(projects)
            setDefaultProjectId(null)
            setIsProjectContextLoading(false)
          }
          return
        }

        const projects = await readProjectChunksDescending(nextProjectId)
        let resolvedProjects = projects

        if (explicitProjectId !== null && !projects.some((project) => project.id === explicitProjectId)) {
          try {
            const explicitProjects = await readProjectsByIds([explicitProjectId])
            if (explicitProjects.length > 0) {
              resolvedProjects = [...explicitProjects, ...projects]
            }
          } catch {
            resolvedProjects = projects
          }
        }

        if (cancelled) {
          return
        }

        setAvailableProjects(resolvedProjects)

        if (explicitProjectId !== null) {
          setDefaultProjectId(null)
          setIsProjectContextLoading(false)
          return
        }

        const firstReadyProject = projects.find(
          (project) => project.active && project.vnetStatus === VNET_STATUS_ACTIVE,
        )

        setDefaultProjectId(firstReadyProject?.id ?? null)
        setIsProjectContextLoading(false)
      } catch {
        if (cancelled) {
          return
        }

        if (explicitProjectId !== null) {
          try {
            const explicitProjects = await readProjectsByIds([explicitProjectId])
            if (!cancelled) {
              setAvailableProjects(explicitProjects)
              setDefaultProjectId(null)
              setIsProjectContextLoading(false)
            }
            return
          } catch {
            if (!cancelled) {
              setAvailableProjects([])
              setDefaultProjectId(null)
              setIsProjectContextLoading(false)
            }
            return
          }
        }

        setAvailableProjects([])
        setDefaultProjectId(null)
        setIsProjectContextLoading(false)
      }
    }

    void loadProjectContext()

    return () => {
      cancelled = true
    }
  }, [explicitProjectId])

  const submissionProjectId = manualProjectId ?? explicitProjectId ?? defaultProjectId
  const handleProjectContextChange = useCallback((projectId: bigint) => {
    setManualProjectId(projectId)
  }, [])

  return (
    <main
      data-builder-shell="root"
      className="min-h-[calc(100vh-142px)] flex flex-col py-6"
    >
      <div className="container flex-1 flex flex-col min-h-0">
        <PageHeader
          title="BUILDER"
          subtitle="> Craft, authorize access, and submit your vulnerability proof-of-concept"
          className="mb-4"
        />

        {isProjectContextLoading ? (
          <div className="flex min-h-[320px] items-center justify-center rounded-sm border border-[var(--color-bg-light)] bg-[var(--color-bg-panel)] px-6 py-10 font-mono text-sm text-[var(--color-text-dim)]">
            Loading project context...
          </div>
        ) : (
          <PoCBuilder
            selectedProject={selectedProject}
            submissionProjectId={submissionProjectId}
            availableProjects={availableProjects}
            onProjectContextChange={handleProjectContextChange}
          />
        )}
      </div>
    </main>
  )
}

export default Builder
