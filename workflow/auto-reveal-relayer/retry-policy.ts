const DEFAULT_AUTO_REVEAL_RETRY_POLICY = {
  maxAttempts: 3,
  baseDelayMs: 250,
  backoffMultiplier: 2,
  maxDelayMs: 2000,
} as const

const RETRIABLE_TIMEOUT_TOKENS = [
  "timeout",
  "timed out",
  "deadline exceeded",
  "etimedout",
] as const

const RETRIABLE_NETWORK_TOKENS = [
  "econnreset",
  "enotfound",
  "ehostunreach",
  "network",
  "socket hang up",
  "connection reset",
  "temporarily unavailable",
] as const

const RETRIABLE_RPC_TOKENS = [
  "rate limit",
  "too many requests",
  "header not found",
  "upstream busy",
  "upstream unavailable",
  "try again",
  "temporarily unavailable",
] as const

const TERMINAL_PAYLOAD_TOKENS = [
  "payload validation failed",
  "invalid project read result",
  "invalid eth_call response",
  "returned empty payload",
  "shape is invalid",
] as const

export const AUTO_REVEAL_REASON_RETRYABLE_TIMEOUT =
  "AUTO_REVEAL_REASON_RETRYABLE_TIMEOUT" as const
export const AUTO_REVEAL_REASON_RETRYABLE_NETWORK =
  "AUTO_REVEAL_REASON_RETRYABLE_NETWORK" as const
export const AUTO_REVEAL_REASON_RETRYABLE_HTTP_STATUS =
  "AUTO_REVEAL_REASON_RETRYABLE_HTTP_STATUS" as const
export const AUTO_REVEAL_REASON_RETRYABLE_RPC_TRANSIENT =
  "AUTO_REVEAL_REASON_RETRYABLE_RPC_TRANSIENT" as const

export const AUTO_REVEAL_REASON_TERMINAL_HTTP_STATUS =
  "AUTO_REVEAL_REASON_TERMINAL_HTTP_STATUS" as const
export const AUTO_REVEAL_REASON_TERMINAL_INVALID_PAYLOAD =
  "AUTO_REVEAL_REASON_TERMINAL_INVALID_PAYLOAD" as const
export const AUTO_REVEAL_REASON_TERMINAL_RPC_ERROR =
  "AUTO_REVEAL_REASON_TERMINAL_RPC_ERROR" as const

export const AUTO_REVEAL_REASON_RETRY_EXHAUSTED =
  "AUTO_REVEAL_REASON_RETRY_EXHAUSTED" as const
export const AUTO_REVEAL_QUARANTINE_STATE = "QUARANTINED" as const

export type AutoRevealRetryPolicy = {
  maxAttempts: number
  baseDelayMs: number
  backoffMultiplier: number
  maxDelayMs: number
}

export type AutoRevealFailure = {
  retriable: boolean
  reasonCode: string
  message: string
  statusCode?: number
}

export type AutoRevealFailureMetricEvent = {
  metric: "auto_reveal_orchestration"
  transition: "RETRY_SCHEDULED" | "EXECUTION_FAILED"
  operation: string
  idempotency_key: string | null
  reason_code: string
  attempt: number
  attempts: number
  quarantine_state: typeof AUTO_REVEAL_QUARANTINE_STATE | null
}

type ErrorLike = {
  name?: string
  message?: string
  statusCode?: number
}

type RetryArgs<T> = {
  operation: string
  idempotencyKey?: string
  retryPolicy?: AutoRevealRetryPolicy
  sleep?: (ms: number) => Promise<void> | void
  execute: (attempt: number) => Promise<T> | T
  classifyError?: (error: unknown) => AutoRevealFailure
  onMetric?: (event: AutoRevealFailureMetricEvent) => void
}

function includesAny(text: string, tokens: readonly string[]): boolean {
  return tokens.some((token) => text.includes(token))
}

function normalizeRetryPolicy(
  policy?: AutoRevealRetryPolicy,
): AutoRevealRetryPolicy {
  const merged = policy ?? DEFAULT_AUTO_REVEAL_RETRY_POLICY
  const maxAttempts = Math.max(1, Math.floor(merged.maxAttempts))
  const baseDelayMs = Math.max(0, Math.floor(merged.baseDelayMs))
  const backoffMultiplier = Math.max(1, Math.floor(merged.backoffMultiplier))
  const maxDelayMs = Math.max(baseDelayMs, Math.floor(merged.maxDelayMs))
  return {
    maxAttempts,
    baseDelayMs,
    backoffMultiplier,
    maxDelayMs,
  }
}

export function createAutoRevealRetrySchedule(
  policy: AutoRevealRetryPolicy,
): number[] {
  const normalized = normalizeRetryPolicy(policy)
  const schedule: number[] = []

  for (let attempt = 1; attempt <= normalized.maxAttempts; attempt += 1) {
    if (attempt === 1) {
      schedule.push(0)
      continue
    }

    const delay = Math.min(
      normalized.baseDelayMs * normalized.backoffMultiplier ** (attempt - 2),
      normalized.maxDelayMs,
    )
    schedule.push(delay)
  }

  return schedule
}

function toErrorLike(error: unknown): ErrorLike {
  if (typeof error === "object" && error !== null) {
    return error as ErrorLike
  }

  if (typeof error === "string") {
    return { message: error }
  }

  return { message: "unknown auto-reveal execution error" }
}

export function classifyAutoRevealError(error: unknown): AutoRevealFailure {
  const details = toErrorLike(error)
  const message =
    typeof details.message === "string"
      ? details.message
      : "unknown auto-reveal execution error"
  const normalizedMessage = message.toLowerCase()

  if (typeof details.statusCode === "number") {
    if (
      details.statusCode === 408
      || details.statusCode === 425
      || details.statusCode === 429
      || details.statusCode >= 500
    ) {
      return {
        retriable: true,
        reasonCode: AUTO_REVEAL_REASON_RETRYABLE_HTTP_STATUS,
        message,
        statusCode: details.statusCode,
      }
    }

    return {
      retriable: false,
      reasonCode: AUTO_REVEAL_REASON_TERMINAL_HTTP_STATUS,
      message,
      statusCode: details.statusCode,
    }
  }

  if (
    details.name === "TimeoutError"
    || includesAny(normalizedMessage, RETRIABLE_TIMEOUT_TOKENS)
  ) {
    return {
      retriable: true,
      reasonCode: AUTO_REVEAL_REASON_RETRYABLE_TIMEOUT,
      message,
    }
  }

  if (includesAny(normalizedMessage, RETRIABLE_NETWORK_TOKENS)) {
    return {
      retriable: true,
      reasonCode: AUTO_REVEAL_REASON_RETRYABLE_NETWORK,
      message,
    }
  }

  if (includesAny(normalizedMessage, RETRIABLE_RPC_TOKENS)) {
    return {
      retriable: true,
      reasonCode: AUTO_REVEAL_REASON_RETRYABLE_RPC_TRANSIENT,
      message,
    }
  }

  if (includesAny(normalizedMessage, TERMINAL_PAYLOAD_TOKENS)) {
    return {
      retriable: false,
      reasonCode: AUTO_REVEAL_REASON_TERMINAL_INVALID_PAYLOAD,
      message,
    }
  }

  return {
    retriable: false,
    reasonCode: AUTO_REVEAL_REASON_TERMINAL_RPC_ERROR,
    message,
  }
}

const noopSleep = async (_ms: number): Promise<void> => {}

export class AutoRevealTerminalError extends Error {
  readonly reasonCode: string
  readonly attempt: number
  readonly attempts: number
  readonly failure: AutoRevealFailure

  constructor(args: {
    operation: string
    attempt: number
    attempts: number
    failure: AutoRevealFailure
  }) {
    super(
      `${args.failure.reasonCode}:${args.operation}:attempt=${args.attempt}:${args.failure.message}`,
    )
    this.name = "AutoRevealTerminalError"
    this.reasonCode = args.failure.reasonCode
    this.attempt = args.attempt
    this.attempts = args.attempts
    this.failure = args.failure
  }
}

export class AutoRevealRetryExhaustedError extends Error {
  readonly reasonCode = AUTO_REVEAL_REASON_RETRY_EXHAUSTED
  readonly quarantineState = AUTO_REVEAL_QUARANTINE_STATE
  readonly attempts: number
  readonly lastFailure: AutoRevealFailure

  constructor(args: { operation: string; attempts: number; lastFailure: AutoRevealFailure }) {
    super(
      `${AUTO_REVEAL_REASON_RETRY_EXHAUSTED}:${args.operation}:attempts=${args.attempts}:last=${args.lastFailure.reasonCode}`,
    )
    this.name = "AutoRevealRetryExhaustedError"
    this.attempts = args.attempts
    this.lastFailure = args.lastFailure
  }
}

function emitMetric(
  handler: RetryArgs<unknown>["onMetric"],
  event: AutoRevealFailureMetricEvent,
): void {
  handler?.(event)
}

export async function runAutoRevealWithRetry<T>(
  args: RetryArgs<T>,
): Promise<T> {
  const policy = normalizeRetryPolicy(args.retryPolicy)
  const sleep = args.sleep ?? noopSleep
  const classify = args.classifyError ?? classifyAutoRevealError
  const schedule = createAutoRevealRetrySchedule(policy)
  let lastFailure: AutoRevealFailure | null = null

  for (let attempt = 1; attempt <= policy.maxAttempts; attempt += 1) {
    const waitMs = schedule[attempt - 1] ?? 0
    if (waitMs > 0) {
      await sleep(waitMs)
    }

    try {
      return await args.execute(attempt)
    } catch (error) {
      const failure = classify(error)
      lastFailure = failure

      if (!failure.retriable) {
        emitMetric(args.onMetric, {
          metric: "auto_reveal_orchestration",
          transition: "EXECUTION_FAILED",
          operation: args.operation,
          idempotency_key: args.idempotencyKey ?? null,
          reason_code: failure.reasonCode,
          attempt,
          attempts: policy.maxAttempts,
          quarantine_state: null,
        })
        throw new AutoRevealTerminalError({
          operation: args.operation,
          attempt,
          attempts: policy.maxAttempts,
          failure,
        })
      }

      if (attempt === policy.maxAttempts) {
        emitMetric(args.onMetric, {
          metric: "auto_reveal_orchestration",
          transition: "EXECUTION_FAILED",
          operation: args.operation,
          idempotency_key: args.idempotencyKey ?? null,
          reason_code: AUTO_REVEAL_REASON_RETRY_EXHAUSTED,
          attempt,
          attempts: policy.maxAttempts,
          quarantine_state: AUTO_REVEAL_QUARANTINE_STATE,
        })
        throw new AutoRevealRetryExhaustedError({
          operation: args.operation,
          attempts: policy.maxAttempts,
          lastFailure: failure,
        })
      }

      emitMetric(args.onMetric, {
        metric: "auto_reveal_orchestration",
        transition: "RETRY_SCHEDULED",
        operation: args.operation,
        idempotency_key: args.idempotencyKey ?? null,
        reason_code: failure.reasonCode,
        attempt,
        attempts: policy.maxAttempts,
        quarantine_state: null,
      })
    }
  }

  throw new AutoRevealRetryExhaustedError({
    operation: args.operation,
    attempts: policy.maxAttempts,
    lastFailure: lastFailure ?? {
      retriable: true,
      reasonCode: AUTO_REVEAL_REASON_RETRYABLE_RPC_TRANSIENT,
      message: "auto-reveal execution exhausted without classified failure",
    },
  })
}
