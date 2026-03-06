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
