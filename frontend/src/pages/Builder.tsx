import { useMemo } from 'react'
import { useLocation, useParams, useSearchParams } from 'react-router-dom'
import { PoCBuilder } from '../components/PoCBuilder'
import { PageHeader } from '../components/shared/ui-primitives'

type BuilderLocationState = {
  projectId?: string | number | bigint
}

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

  return (
    <main
      data-builder-shell="root"
      className="min-h-[calc(100vh-142px)] flex flex-col py-6"
    >
      <div className="container flex-1 flex flex-col min-h-0">
        <PageHeader
          title="POC_BUILDER_V1.0"
          subtitle="> Craft, encrypt, and submit your vulnerability proof-of-concept"
          className="mb-4"
          rightSlot={
            explicitProjectId !== null ? (
              <span
                data-testid="builder-project-context"
                className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-secondary)]"
              >
                CONTEXT_PROJECT_ID: #{explicitProjectId.toString()}
              </span>
            ) : undefined
          }
        />

        <PoCBuilder selectedProject={selectedProject} submissionProjectId={explicitProjectId} />
      </div>
    </main>
  )
}

export default Builder
