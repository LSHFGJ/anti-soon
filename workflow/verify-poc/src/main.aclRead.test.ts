import { describe, expect, it } from "bun:test"
import { encodeFunctionResult, parseAbi } from "viem"
import { buildAuthorizedReadCallParams, decodeAuthorizedReadCaller } from "../main"

const oasisPoCStoreAbi = parseAbi([
  "function readMeta(string slotId) view returns (address writer, uint256 storedAt)",
])

describe("verify-poc ACL read caller enforcement", () => {
  it("derives authorized caller from readMeta result", () => {
    const writer = "0x1111111111111111111111111111111111111111"
    const encodedMeta = encodeFunctionResult({
      abi: oasisPoCStoreAbi,
      functionName: "readMeta",
      result: [writer, 1700000000n],
    })

    expect(decodeAuthorizedReadCaller(encodedMeta)).toBe(writer)
  })

  it("fails closed when readMeta resolves zero-address writer", () => {
    const encodedMeta = encodeFunctionResult({
      abi: oasisPoCStoreAbi,
      functionName: "readMeta",
      result: ["0x0000000000000000000000000000000000000000", 0n],
    })

    expect(() => decodeAuthorizedReadCaller(encodedMeta)).toThrow(
      "Oasis storage metadata missing writer for slot",
    )
  })

  it("builds read eth_call params with deterministic authorized caller", () => {
    const contract = "0x2222222222222222222222222222222222222222"
    const authorizedCaller = "0x3333333333333333333333333333333333333333"
    const callData = "0x1234"

    const params = buildAuthorizedReadCallParams(contract, callData, authorizedCaller)

    expect(params[0]).toEqual({
      to: contract,
      data: callData,
      from: authorizedCaller,
    })
    expect(params[1]).toBe("latest")
  })
})
