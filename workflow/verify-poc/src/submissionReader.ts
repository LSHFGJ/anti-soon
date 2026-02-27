import { decodeAbiParameters, encodeAbiParameters, keccak256, parseAbiParameters, toBytes } from "viem"

const aclSubmissionReadParams = parseAbiParameters(
  "address auditor, uint256 projectId, bytes32 commitHash, string cipherURI, bytes32 salt, uint256 commitTimestamp, uint256 revealTimestamp, uint8 status, uint256 drainAmountWei, uint8 severity, uint256 payoutAmount, uint256 disputeDeadline, bool challenged, address challenger, uint256 challengeBond"
)

const submissionIdParam = parseAbiParameters("uint256")

const ACL_SUBMISSION_TUPLE_HEAD_WORDS = 15n
const CIPHER_URI_OFFSET_WORD_INDEX = 3
const ACL_CIPHER_URI_OFFSET = ACL_SUBMISSION_TUPLE_HEAD_WORDS * 32n

export const UNSUPPORTED_SUBMISSION_LAYOUT_ERROR =
  "UNSUPPORTED_SUBMISSION_PAYLOAD: unexpected submissions(uint256) tuple layout"
export const INVALID_SUBMISSION_PAYLOAD_ERROR =
  "UNSUPPORTED_SUBMISSION_PAYLOAD: unable to decode ACL submissions(uint256) tuple"

export type ChainSubmissionRecord = {
  auditor: `0x${string}`
  projectId: bigint
  commitHash: `0x${string}`
  cipherURI: string
  salt: `0x${string}`
  commitTimestamp: bigint
  revealTimestamp: bigint
  status: number
  drainAmountWei: bigint
  severity: number
  payoutAmount: bigint
  disputeDeadline: bigint
  challenged: boolean
  challenger: `0x${string}`
  challengeBond: bigint
}

export function encodeSubmissionReadCall(submissionId: bigint): `0x${string}` {
  const selector = keccak256(toBytes("submissions(uint256)")).slice(0, 10)
  const encodedArgs = encodeAbiParameters(submissionIdParam, [submissionId])
  return `${selector}${encodedArgs.slice(2)}` as `0x${string}`
}

export function decodeSubmissionReadResult(rawHexResult: string): ChainSubmissionRecord {
  const normalized = rawHexResult.startsWith("0x")
    ? rawHexResult.toLowerCase()
    : `0x${rawHexResult.toLowerCase()}`

  const minExpectedLength = 2 + Number(ACL_SUBMISSION_TUPLE_HEAD_WORDS * 64n)
  if (normalized.length < minExpectedLength) {
    throw new Error(`${UNSUPPORTED_SUBMISSION_LAYOUT_ERROR}: payload too short`)
  }

  const offsetStart = 2 + CIPHER_URI_OFFSET_WORD_INDEX * 64
  const offsetEnd = offsetStart + 64
  const cipherUriOffsetHex = normalized.slice(offsetStart, offsetEnd)
  const cipherUriOffset = BigInt(`0x${cipherUriOffsetHex}`)
  if (cipherUriOffset !== ACL_CIPHER_URI_OFFSET) {
    throw new Error(
      `${UNSUPPORTED_SUBMISSION_LAYOUT_ERROR}: cipherURI offset ${cipherUriOffset.toString()}`
    )
  }

  try {
    const decoded = decodeAbiParameters(
      aclSubmissionReadParams,
      normalized as `0x${string}`
    )

    return {
      auditor: decoded[0] as `0x${string}`,
      projectId: decoded[1] as bigint,
      commitHash: decoded[2] as `0x${string}`,
      cipherURI: decoded[3] as string,
      salt: decoded[4] as `0x${string}`,
      commitTimestamp: decoded[5] as bigint,
      revealTimestamp: decoded[6] as bigint,
      status: Number(decoded[7]),
      drainAmountWei: decoded[8] as bigint,
      severity: Number(decoded[9]),
      payoutAmount: decoded[10] as bigint,
      disputeDeadline: decoded[11] as bigint,
      challenged: decoded[12] as boolean,
      challenger: decoded[13] as `0x${string}`,
      challengeBond: decoded[14] as bigint,
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`${INVALID_SUBMISSION_PAYLOAD_ERROR}: ${reason}`)
  }
}
