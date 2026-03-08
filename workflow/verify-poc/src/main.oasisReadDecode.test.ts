import { describe, expect, it } from "bun:test"
import { encodeFunctionResult, parseAbi } from "viem"
import {
  decodeOasisSiweDomainResult,
  decodeOasisSiweLoginToken,
  decodeOasisStoredPayloadJson,
} from "../main"

const oasisSiweAbi = parseAbi([
  "function domain() view returns (string)",
  "function login(string siweMsg, (bytes32 r, bytes32 s, uint256 v) sig) view returns (bytes token)",
  "function read(string slotId, bytes token) view returns (string payload)",
])

describe("verify-poc Oasis read result decoding", () => {
  it("decodes the full SIWE domain result instead of the first character", () => {
    const encodedDomain = encodeFunctionResult({
      abi: oasisSiweAbi,
      functionName: "domain",
      result: "localhost",
    })

    expect(decodeOasisSiweDomainResult(encodedDomain)).toBe("localhost")
  })

  it("decodes the full SIWE login token bytes result", () => {
    const encodedToken = encodeFunctionResult({
      abi: oasisSiweAbi,
      functionName: "login",
      result: "0x1234",
    })

    expect(decodeOasisSiweLoginToken(encodedToken)).toBe("0x1234")
  })

  it("decodes the full Oasis stored payload JSON string", () => {
    const payloadJson = JSON.stringify({ ok: true, poc: { target: { chain: 1 } } })
    const encodedPayload = encodeFunctionResult({
      abi: oasisSiweAbi,
      functionName: "read",
      result: payloadJson,
    })

    expect(decodeOasisStoredPayloadJson(encodedPayload)).toBe(payloadJson)
  })
})
