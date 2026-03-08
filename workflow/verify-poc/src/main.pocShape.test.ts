import { describe, expect, it } from "bun:test"
import { parsePoCData } from "../main"

describe("verify-poc PoC payload parsing", () => {
  it("normalizes the current frontend builder PoC shape", () => {
    const parsed = parsePoCData({
      target: "0x1234567890123456789012345678901234567890",
      chain: "Sepolia",
      forkBlock: 10408817,
      conditions: [
        {
          type: "setBalance",
          target: "0x1234567890123456789012345678901234567890",
          value: "1000000000000000000",
        },
      ],
      transactions: [
        {
          to: "0x1234567890123456789012345678901234567890",
          value: "0",
          data: "0x",
        },
      ],
      impact: {
        type: "fundsDrained",
        estimatedLoss: "1000000000000000000",
        description: "Drain test funds",
      },
      metadata: {
        generator: "AntiSoon v1.0",
        timestamp: 1741442141,
      },
    })

    expect(parsed.target.contract).toBe(
      "0x1234567890123456789012345678901234567890",
    )
    expect(parsed.target.chain).toBe(11155111)
    expect(parsed.target.forkBlock).toBe(10408817)
    expect(parsed.setup).toEqual([
      {
        type: "setBalance",
        address: "0x1234567890123456789012345678901234567890",
        value: "1000000000000000000",
      },
    ])
    expect(parsed.expectedImpact).toEqual({
      type: "fundsDrained",
      estimatedLoss: "1000000000000000000",
      description: "Drain test funds",
    })
  })
})
