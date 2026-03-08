export function getActualStatus(status: number, lifecycleStatus?: number): number {
  return status === 5 || status === 6 || status === 7
    ? status
    : lifecycleStatus ?? status
}
