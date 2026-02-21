import { useMemo, useState } from 'react'
import { useLocation, useParams, useSearchParams } from 'react-router-dom'
import { PoCBuilder } from '../components/PoCBuilder'
import { DEMO_PROJECTS } from '../config'

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
  const [selectedProject] = useState<typeof DEMO_PROJECTS[0] | null>(null)

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
      className="min-h-full flex flex-col"
    >
      <div className="bg-[var(--color-bg)] py-4 border-b border-[var(--color-bg-light)] shrink-0">
        <div className="container">
          <h1 className="font-mono text-[1.2rem] text-[var(--color-primary)] mb-1">
            POC_BUILDER_V1.0
          </h1>
          <p className="font-mono text-xs text-[var(--color-text-dim)]">
            Craft, encrypt, and submit your vulnerability proof-of-concept
          </p>
          {explicitProjectId !== null && (
            <p
              data-testid="builder-project-context"
              className="font-mono text-xs text-[var(--color-secondary)] mt-1.5"
            >
              CONTEXT_PROJECT_ID: #{explicitProjectId.toString()}
            </p>
          )}
        </div>
      </div>
      <div className="flex-1 min-h-0 flex">
        <PoCBuilder selectedProject={selectedProject} submissionProjectId={explicitProjectId} />
      </div>
    </main>
  )
}

export default Builder
