import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useParams, useSearchParams } from 'react-router-dom'
import { PoCBuilder } from '../components/PoCBuilder'
import { PageHeader } from '../components/shared/ui-primitives'
import { BOUNTY_HUB_ADDRESS, BOUNTY_HUB_V2_ABI } from '../config'
import { readProjectsByIds } from '../lib/projectReads'
import { publicClient } from '../lib/publicClient'
import type { Project } from '../types'

type BuilderLocationState = {
  projectId?: string | number | bigint
}

const VNET_STATUS_ACTIVE = 2

export function parseProjectId(value: string | number | bigint | null | undefined): bigint | null {
  if (value === null || value === undefined) return null

  if (typeof value === 'bigint') return value >= 0n ? value : null

  try {
    const parsed = BigInt(value)
    return parsed >= 0n ? parsed : null
  } catch {
    return null
  }
}

export function resolveSubmissionProjectId(
  stateProjectId: string | number | bigint | null | undefined,
  pathProjectId: string | undefined,
  queryProjectId: string | null | undefined,
  queryProject: string | null | undefined,
): bigint | null {
  return (
    parseProjectId(stateProjectId) ??
    parseProjectId(pathProjectId) ??
    parseProjectId(queryProjectId) ??
    parseProjectId(queryProject)
  )
}

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

  useEffect(() => {
    if (explicitProjectId !== null) {
      setManualProjectId(null)
    }
  }, [explicitProjectId])

  useEffect(() => {
    let cancelled = false

    const loadProjectContext = async () => {
      try {
        const nextProjectId = await publicClient.readContract({
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
          }
          return
        }

        const projectIds = Array.from({ length: Number(nextProjectId) }, (_, index) => BigInt(index))
        const projects = await readProjectsByIds(projectIds)
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
          return
        }

        const firstReadyProject = projects.find(
          (project) => project.active && project.vnetStatus === VNET_STATUS_ACTIVE,
        )

        setDefaultProjectId(firstReadyProject?.id ?? null)
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
            }
            return
          } catch {
            if (!cancelled) {
              setAvailableProjects([])
              setDefaultProjectId(null)
            }
            return
          }
        }

        setAvailableProjects([])
        setDefaultProjectId(null)
      }
    }

    void loadProjectContext()

    return () => {
      cancelled = true
    }
  }, [explicitProjectId])

  const submissionProjectId = manualProjectId ?? explicitProjectId ?? defaultProjectId
  const projectContextLabel =
    manualProjectId !== null
      ? 'SELECTED_PROJECT_ID'
      : explicitProjectId !== null
        ? 'CONTEXT_PROJECT_ID'
        : 'DEFAULT_PROJECT_ID'

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
          rightSlot={
            submissionProjectId !== null ? (
              <span
                data-testid="builder-project-context"
                className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-secondary)]"
              >
                {projectContextLabel}: #{submissionProjectId.toString()}
              </span>
            ) : undefined
          }
        />

        <PoCBuilder
          selectedProject={selectedProject}
          submissionProjectId={submissionProjectId}
          availableProjects={availableProjects}
          onProjectContextChange={handleProjectContextChange}
        />
      </div>
    </main>
  )
}

export default Builder
