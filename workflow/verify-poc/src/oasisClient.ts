import { evaluateTimedDecryptPolicy } from "./decryptPolicy"

const DEFAULT_RETRY_POLICY = {
  maxAttempts: 3,
  baseDelayMs: 250,
  backoffMultiplier: 2,
  maxDelayMs: 2000,
} as const

export type OasisRetryPolicy = {
  maxAttempts: number
  baseDelayMs: number
  backoffMultiplier: number
  maxDelayMs: number
}

export type OasisErrorKind =
  | "timeout"
  | "network"
  | "http"
  | "auth"
  | "not_found"
  | "rate_limited"
  | "invalid_response"
  | "retriable"
  | "retry_exhausted"

export type OasisClientError = {
  kind: OasisErrorKind
  message: string
  retriable: boolean
  statusCode?: number
}

export type OasisPointer = {
  chain: string
  contract: string
  slotId: string
}

export type OasisWriteRequest = {
  pointer: OasisPointer
  ciphertext: string
  iv: string
}

export type OasisReadRequest = {
  pointer: OasisPointer
}

export type OasisDecryptPolicyRequest = {
  pointer: OasisPointer
  submitter: string
  requester: string
  currentTimestamp: number
  submissionDeadline: number
}

export type OasisWriteResponse = {
  ok: true
  pointer: OasisPointer
}

export type OasisReadResponse = {
  ok: true
  ciphertext: string
  iv: string
}

export type OasisDecryptPolicyResponse = {
  ok: true
  allowed: boolean
  mode: string
}

export type OasisFailureResponse = {
  ok: false
  error: OasisClientError
}

export type OasisSuccess<T> = {
  ok: true
  data: T
}

export type OasisResult<T> = OasisSuccess<T> | OasisFailureResponse

type JsonRecord = Record<string, unknown>

type OasisClientConfig = {
  baseUrl: string
  retryPolicy?: OasisRetryPolicy
  fetchImpl?: typeof fetch
  sleep?: (ms: number) => Promise<void>
}

type InternalRequest = {
  path: string
  body: JsonRecord
  requiresAuthenticatedRead?: boolean
}

const noopSleep = async (_ms: number): Promise<void> => Promise.resolve()

const AUTH_FAILURE_TOKENS = [
  "invalid auth",
  "auth failed",
  "authentication failed",
  "unauthorized",
  "forbidden",
  "permission denied",
  "invalid signature",
  "invalid token",
  "invalid api key",
] as const

function buildAuthHttpError(statusCode: number): OasisClientError {
  return {
    kind: "auth",
    retriable: false,
    statusCode,
    message: `oasis auth failed with status ${statusCode}`,
  }
}

function normalizePointer(pointer: OasisPointer): OasisPointer {
  return {
    chain: pointer.chain,
    contract: pointer.contract.toLowerCase(),
    slotId: pointer.slotId,
  }
}

function normalizeRetryPolicy(policy?: OasisRetryPolicy): OasisRetryPolicy {
  const merged = policy ?? DEFAULT_RETRY_POLICY
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

export function createDeterministicRetrySchedule(policy: OasisRetryPolicy): number[] {
  const normalized = normalizeRetryPolicy(policy)
  const schedule: number[] = []
  for (let attempt = 1; attempt <= normalized.maxAttempts; attempt += 1) {
    if (attempt === 1) {
      schedule.push(0)
      continue
    }
    const delay = Math.min(
      normalized.baseDelayMs * normalized.backoffMultiplier ** (attempt - 2),
      normalized.maxDelayMs
    )
    schedule.push(delay)
  }
  return schedule
}

export function classifyOasisHttpError(statusCode: number): OasisClientError {
  if (statusCode === 401 || statusCode === 403) {
    return buildAuthHttpError(statusCode)
  }

  if (statusCode === 404) {
    return {
      kind: "not_found",
      retriable: false,
      statusCode,
      message: "oasis resource not found",
    }
  }

  if (statusCode === 429) {
    return {
      kind: "rate_limited",
      retriable: true,
      statusCode,
      message: "oasis rate limited",
    }
  }

  if (statusCode >= 500) {
    return {
      kind: "retriable",
      retriable: true,
      statusCode,
      message: `oasis upstream error ${statusCode}`,
    }
  }

  return {
    kind: "http",
    retriable: false,
    statusCode,
    message: `oasis request failed with status ${statusCode}`,
  }
}

function hasInvalidAuthSignal(responseBodyText: string): boolean {
  if (responseBodyText.length === 0) {
    return false
  }

  const candidates: string[] = [responseBodyText]
  const parsed = parseJsonObject(responseBodyText)
  if (parsed) {
    const keys = ["error", "message", "reason", "detail"]
    for (const key of keys) {
      const value = parsed[key]
      if (typeof value === "string" && value.length > 0) {
        candidates.push(value)
      }
    }
  }

  const normalized = candidates.join(" ").toLowerCase()
  return AUTH_FAILURE_TOKENS.some((token) => normalized.includes(token))
}

function classifyOasisNetworkError(error: unknown): OasisClientError {
  const maybe = error as { name?: string; message?: string }
  const message = typeof maybe.message === "string" ? maybe.message : "network failure"
  if (typeof maybe.name === "string" && maybe.name === "TimeoutError") {
    return {
      kind: "timeout",
      retriable: true,
      message,
    }
  }

  return {
    kind: "network",
    retriable: true,
    message,
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function parseJsonObject(text: string): JsonRecord | null {
  try {
    const parsed = JSON.parse(text)
    if (!isRecord(parsed)) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

function failure(error: OasisClientError): OasisFailureResponse {
  return { ok: false, error }
}

function buildUrl(baseUrl: string, path: string): string {
  const base = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl
  const normalizedPath = path.startsWith("/") ? path : `/${path}`
  return `${base}${normalizedPath}`
}

function parseWriteResponse(value: JsonRecord): OasisResult<OasisWriteResponse> {
  const pointer = value.pointer
  const ok = value.ok
  if (ok !== true || !isRecord(pointer)) {
    return failure({
      kind: "invalid_response",
      retriable: false,
      message: "oasis write response shape is invalid",
    })
  }

  const chain = pointer.chain
  const contract = pointer.contract
  const slotId = pointer.slotId
  if (typeof chain !== "string" || typeof contract !== "string" || typeof slotId !== "string") {
    return failure({
      kind: "invalid_response",
      retriable: false,
      message: "oasis write pointer fields are invalid",
    })
  }

  return {
    ok: true,
    data: {
      ok: true,
      pointer: normalizePointer({ chain, contract, slotId }),
    },
  }
}

function parseReadResponse(value: JsonRecord): OasisResult<OasisReadResponse> {
  const ok = value.ok
  const ciphertext = value.ciphertext
  const iv = value.iv
  if (ok !== true || typeof ciphertext !== "string" || typeof iv !== "string") {
    return failure({
      kind: "invalid_response",
      retriable: false,
      message: "oasis read response shape is invalid",
    })
  }

  return {
    ok: true,
    data: {
      ok: true,
      ciphertext,
      iv,
    },
  }
}

function parsePolicyResponse(value: JsonRecord): OasisResult<OasisDecryptPolicyResponse> {
  const ok = value.ok
  const allowed = value.allowed
  const mode = value.mode
  if (ok !== true || typeof allowed !== "boolean" || typeof mode !== "string") {
    return failure({
      kind: "invalid_response",
      retriable: false,
      message: "oasis decrypt-policy response shape is invalid",
    })
  }

  return {
    ok: true,
    data: {
      ok: true,
      allowed,
      mode,
    },
  }
}

async function requestWithRetry(
  request: InternalRequest,
  config: Required<Omit<OasisClientConfig, "retryPolicy">> & { retryPolicy: OasisRetryPolicy }
): Promise<OasisResult<JsonRecord>> {
  const url = buildUrl(config.baseUrl, request.path)
  const schedule = createDeterministicRetrySchedule(config.retryPolicy)
  let lastRetriableError: OasisClientError | null = null

  for (let attempt = 1; attempt <= config.retryPolicy.maxAttempts; attempt += 1) {
    const waitMs = schedule[attempt - 1] ?? 0
    if (waitMs > 0) {
      await config.sleep(waitMs)
    }

    let response: Response
    try {
      response = await config.fetchImpl(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request.body),
      })
    } catch (error) {
      const classified = classifyOasisNetworkError(error)
      if (classified.retriable && attempt < config.retryPolicy.maxAttempts) {
        lastRetriableError = classified
        continue
      }
      if (classified.retriable) {
        return failure({
          kind: "retry_exhausted",
          retriable: false,
          message: `oasis retry exhausted after ${config.retryPolicy.maxAttempts} attempts (${classified.kind})`,
        })
      }
      return failure(classified)
    }

    if (!response.ok) {
      const responseBodyText = await response.text()
      const classified =
        request.requiresAuthenticatedRead && hasInvalidAuthSignal(responseBodyText)
          ? buildAuthHttpError(response.status)
          : classifyOasisHttpError(response.status)
      if (classified.retriable && attempt < config.retryPolicy.maxAttempts) {
        lastRetriableError = classified
        continue
      }
      if (classified.retriable) {
        return failure({
          kind: "retry_exhausted",
          retriable: false,
          statusCode: response.status,
          message: `oasis retry exhausted after ${config.retryPolicy.maxAttempts} attempts (${classified.kind})`,
        })
      }
      return failure(classified)
    }

    const bodyText = await response.text()
    const parsed = parseJsonObject(bodyText)
    if (parsed === null) {
      return failure({
        kind: "invalid_response",
        retriable: false,
        message: "oasis response is not a JSON object",
      })
    }
    return {
      ok: true,
      data: parsed,
    }
  }

  return failure({
    kind: "retry_exhausted",
    retriable: false,
    message: lastRetriableError
      ? `oasis retry exhausted after ${config.retryPolicy.maxAttempts} attempts (${lastRetriableError.kind})`
      : `oasis retry exhausted after ${config.retryPolicy.maxAttempts} attempts`,
  })
}

export function createOasisClient(config: OasisClientConfig) {
  const normalizedPolicy = normalizeRetryPolicy(config.retryPolicy)
  const resolvedConfig = {
    baseUrl: config.baseUrl,
    retryPolicy: normalizedPolicy,
    fetchImpl: config.fetchImpl ?? fetch,
    sleep: config.sleep ?? noopSleep,
  }

  return {
    async write(payload: OasisWriteRequest): Promise<OasisResult<OasisWriteResponse>> {
      const pointer = normalizePointer(payload.pointer)
      const result = await requestWithRetry(
        {
          path: "/write",
          body: {
            pointer,
            ciphertext: payload.ciphertext,
            iv: payload.iv,
          },
        },
        resolvedConfig
      )
      if (!result.ok) {
        return result
      }
      return parseWriteResponse(result.data)
    },

    async read(payload: OasisReadRequest): Promise<OasisResult<OasisReadResponse>> {
      const pointer = normalizePointer(payload.pointer)
      const result = await requestWithRetry(
        {
          path: "/read",
          body: {
            pointer,
          },
          requiresAuthenticatedRead: true,
        },
        resolvedConfig
      )
      if (!result.ok) {
        return result
      }
      return parseReadResponse(result.data)
    },

    async readDecryptPolicy(
      payload: OasisDecryptPolicyRequest
    ): Promise<OasisResult<OasisDecryptPolicyResponse>> {
      const pointer = normalizePointer(payload.pointer)
      const localDecision = evaluateTimedDecryptPolicy({
        submitter: payload.submitter,
        requester: payload.requester,
        currentTimestamp: payload.currentTimestamp,
        submissionDeadlineTimestamp: payload.submissionDeadline,
      })

      if (!localDecision.allowed) {
        return failure({
          kind: "auth",
          retriable: false,
          message: `decrypt policy denied: ${localDecision.reason}`,
        })
      }

      const result = await requestWithRetry(
        {
          path: "/decrypt-policy",
          body: {
            pointer,
            submitter: payload.submitter.toLowerCase(),
            requester: payload.requester.toLowerCase(),
            currentTimestamp: payload.currentTimestamp,
            submissionDeadline: payload.submissionDeadline,
          },
        },
        resolvedConfig
      )
      if (!result.ok) {
        return result
      }
      return parsePolicyResponse(result.data)
    },
  }
}
