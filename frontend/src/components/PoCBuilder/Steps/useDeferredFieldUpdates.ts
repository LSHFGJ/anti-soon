import { useCallback, useEffect, useRef } from 'react'

export function useDeferredFieldUpdates<Key extends string>(
  onCommit: (key: Key, value: string) => void,
  delayMs = 80
) {
  const pendingRef = useRef(new Map<Key, string>())
  const timerRef = useRef<number | null>(null)
  const onCommitRef = useRef(onCommit)

  useEffect(() => {
    onCommitRef.current = onCommit
  }, [onCommit])

  const flush = useCallback((key: Key) => {
    const value = pendingRef.current.get(key)
    if (value === undefined) {
      return
    }

    pendingRef.current.delete(key)
    onCommitRef.current(key, value)
  }, [])

  const flushAll = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }

    for (const [key, value] of pendingRef.current) {
      onCommitRef.current(key, value)
    }
    pendingRef.current.clear()
  }, [])

  const schedule = useCallback(
    (key: Key, value: string) => {
      pendingRef.current.set(key, value)

      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current)
      }

      timerRef.current = window.setTimeout(() => {
        timerRef.current = null
        for (const [pendingKey, pendingValue] of pendingRef.current) {
          onCommitRef.current(pendingKey, pendingValue)
        }
        pendingRef.current.clear()
      }, delayMs)
    },
    [delayMs]
  )

  useEffect(() => () => flushAll(), [flushAll])

  return {
    schedule,
    flush,
    flushAll,
  }
}
