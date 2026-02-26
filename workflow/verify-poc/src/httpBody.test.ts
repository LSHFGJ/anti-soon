import { describe, expect, it } from "bun:test"
import { encodeJsonBodyBase64 } from "./httpBody"

describe("httpBody", () => {
  it("encodes JSON payload as base64 body for HTTP capability", () => {
    const payload = {
      jsonrpc: "2.0",
      method: "eth_getBlockByNumber",
      params: ["latest", false],
      id: 1,
    }

    const encoded = encodeJsonBodyBase64(payload)
    const decoded = atob(encoded)

    expect(decoded).toBe(JSON.stringify(payload))
  })
})
