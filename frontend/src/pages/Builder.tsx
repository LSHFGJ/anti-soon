import { useEffect, useMemo, useState } from 'react'
import { useLocation, useParams, useSearchParams } from 'react-router-dom'
import { PoCBuilder } from '../components/PoCBuilder'
import { PageHeader } from '../components/shared/ui-primitives'
import { BOUNTY_HUB_ADDRESS, BOUNTY_HUB_V2_ABI } from '../config'
import { readProjectsByIds } from '../lib/projectReads'
import { publicClient } from '../lib/publicClient'

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

  useEffect(() => {
    let cancelled = false

    const loadDefaultProjectId = async () => {
      if (explicitProjectId !== null) {
        setDefaultProjectId(null)
        return
      }

      try {
        const nextProjectId = await publicClient.readContract({
          address: BOUNTY_HUB_ADDRESS,
          abi: BOUNTY_HUB_V2_ABI,
          functionName: 'nextProjectId'
        }) as bigint

        if (nextProjectId === 0n) {
          if (!cancelled) setDefaultProjectId(null)
          return
        }

        const projectIds = Array.from({ length: Number(nextProjectId) }, (_, index) => BigInt(index))
        const projects = await readProjectsByIds(projectIds)
        const firstReadyProject = projects.find(
          (project) => project.active && project.vnetStatus === VNET_STATUS_ACTIVE,
        )

        if (!cancelled) {
          setDefaultProjectId(firstReadyProject?.id ?? null)
        }
      } catch {
        if (!cancelled) {
          setDefaultProjectId(null)
        }
      }
    }

    void loadDefaultProjectId()

    return () => {
      cancelled = true
    }
  }, [explicitProjectId])

  const submissionProjectId = explicitProjectId ?? defaultProjectId

  return (
    <main
      data-builder-shell="root"
      className="min-h-[calc(100vh-142px)] flex flex-col py-6"
    >
      <div className="container flex-1 flex flex-col min-h-0">
        <PageHeader
          title="POC_BUILDER_V1.0"
          subtitle="> Craft, authorize access, and submit your vulnerability proof-of-concept"
          className="mb-4"
          rightSlot={
            submissionProjectId !== null ? (
              <span
                data-testid="builder-project-context"
                className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-secondary)]"
              >
                {explicitProjectId !== null ? 'CONTEXT_PROJECT_ID' : 'DEFAULT_PROJECT_ID'}: #{submissionProjectId.toString()}
              </span>
            ) : undefined
          }
        />

        <PoCBuilder selectedProject={selectedProject} submissionProjectId={submissionProjectId} />
      </div>
    </main>
  )
}

export default Builder
