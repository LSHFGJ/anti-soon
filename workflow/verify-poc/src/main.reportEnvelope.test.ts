import { describe, expect, it } from "bun:test"
import { decodeAbiParameters, parseAbiParameters } from "viem"
import { encodeVerifyPocLegacyReport } from "../main"

const verifyPocResultParams = parseAbiParameters(
  "uint256 submissionId, bool isValid, uint256 drainAmountWei"
)

describe("verify-poc report encoding", () => {
  it("encodes verification result as legacy payload for hardened contract fallback", () => {
    const submissionId = 123n
    const isValid = true
    const drainAmountWei = 1000000000000000000n

    const encoded = encodeVerifyPocLegacyReport(submissionId, isValid, drainAmountWei)
    const [decodedSubmissionId, decodedIsValid, decodedDrain] = decodeAbiParameters(
      verifyPocResultParams,
      encoded,
    )

    expect(decodedSubmissionId).toBe(submissionId)
    expect(decodedIsValid).toBe(isValid)
    expect(decodedDrain).toBe(drainAmountWei)
  })
})
