import { decodeAbiParameters, encodeAbiParameters, keccak256, parseAbiParameters, toBytes } from "viem"

const submissionReadParams = parseAbiParameters(
  "address auditor, uint256 projectId, bytes32 commitHash, string cipherURI, bytes32 decryptionKey, bytes32 salt, uint256 commitTimestamp, uint256 revealTimestamp, uint8 status, uint256 drainAmountWei, uint8 severity, uint256 payoutAmount, uint256 disputeDeadline, bool challenged, address challenger, uint256 challengeBond"
)

const submissionIdParam = parseAbiParameters("uint256")

export type ChainSubmissionRecord = {
  auditor: `0x${string}`
  projectId: bigint
  commitHash: `0x${string}`
  cipherURI: string
  decryptionKey: `0x${string}`
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
  const decoded = decodeAbiParameters(
    submissionReadParams,
    rawHexResult as `0x${string}`
  )

  return {
    auditor: decoded[0] as `0x${string}`,
    projectId: decoded[1] as bigint,
    commitHash: decoded[2] as `0x${string}`,
    cipherURI: decoded[3] as string,
    decryptionKey: decoded[4] as `0x${string}`,
    salt: decoded[5] as `0x${string}`,
    commitTimestamp: decoded[6] as bigint,
    revealTimestamp: decoded[7] as bigint,
    status: Number(decoded[8]),
    drainAmountWei: decoded[9] as bigint,
    severity: Number(decoded[10]),
    payoutAmount: decoded[11] as bigint,
    disputeDeadline: decoded[12] as bigint,
    challenged: decoded[13] as boolean,
    challenger: decoded[14] as `0x${string}`,
    challengeBond: decoded[15] as bigint,
  }
}
