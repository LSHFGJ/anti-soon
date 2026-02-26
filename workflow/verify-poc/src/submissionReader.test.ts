import { describe, expect, it } from "bun:test"
import { encodeAbiParameters, parseAbiParameters } from "viem"
import {
  decodeSubmissionReadResult,
  encodeSubmissionReadCall,
} from "./submissionReader"

describe("submissionReader", () => {
  it("encodes submissions(uint256) call data with canonical selector", () => {
    const callData = encodeSubmissionReadCall(42n)
    expect(callData.slice(0, 10)).toBe("0xad73349e")
    expect(callData.length).toBe(74)
  })

  it("decodes submissions tuple into stable typed record", () => {
    const encoded = encodeAbiParameters(
      parseAbiParameters(
        "address auditor, uint256 projectId, bytes32 commitHash, string cipherURI, bytes32 decryptionKey, bytes32 salt, uint256 commitTimestamp, uint256 revealTimestamp, uint8 status, uint256 drainAmountWei, uint8 severity, uint256 payoutAmount, uint256 disputeDeadline, bool challenged, address challenger, uint256 challengeBond"
      ),
      [
        "0x1111111111111111111111111111111111111111",
        9n,
        "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "oasis://oasis-sapphire-testnet/0x2222222222222222222222222222222222222222/slot-1#0xbb",
        "0x0000000000000000000000000000000000000000000000000000000000000000",
        "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        100n,
        101n,
        2,
        7n,
        1,
        3n,
        999n,
        false,
        "0x3333333333333333333333333333333333333333",
        0n,
      ]
    )

    const record = decodeSubmissionReadResult(encoded)
    expect(record.projectId).toBe(9n)
    expect(record.cipherURI.startsWith("oasis://")).toBe(true)
    expect(record.status).toBe(2)
    expect(record.drainAmountWei).toBe(7n)
    expect(record.challenged).toBe(false)
  })
})
