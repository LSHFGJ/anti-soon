import { describe, expect, it } from "bun:test"

import {
  OASIS_READ_PRIVATE_KEY_SECRET_ID,
  SAPPHIRE_SIWE_CHAIN_ID,
  buildSapphireSiweMessage,
  buildSapphireSiweUri,
  resolveOasisReadPrivateKey,
  signSapphireSiweMessage,
} from "./oasisSiwe"

describe("oasisSiwe", () => {
  it("prefers the CRE runtime secret over legacy env keys when resolving the Oasis read signer", () => {
    const resolved = resolveOasisReadPrivateKey({
      secretValue:
        "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      env: {
        CRE_SIM_PRIVATE_KEY:
          "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        CRE_ETH_PRIVATE_KEY:
          "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      },
    })

    expect(resolved).toBe(
      "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    )
  })

  it("exports the CRE runtime secret id used by verify-poc", () => {
    expect(OASIS_READ_PRIVATE_KEY_SECRET_ID).toBe("OASIS_READ_PRIVATE_KEY")
  })

  it("builds a Sapphire SIWE URI from a bare domain", () => {
    expect(buildSapphireSiweUri("preview.anti-soon.test")).toBe(
      "https://preview.anti-soon.test",
    )
    expect(buildSapphireSiweUri("https://preview.anti-soon.test")).toBe(
      "https://preview.anti-soon.test",
    )
  })

  it("builds a SIWE message for the Sapphire chain", () => {
    const message = buildSapphireSiweMessage({
      address: "0x1111111111111111111111111111111111111111",
      domain: "preview.anti-soon.test",
      nonce: "abcdef12",
      issuedAt: new Date("2025-01-01T00:00:00.000Z"),
      expiresAt: new Date("2025-01-01T01:00:00.000Z"),
    })

    expect(message).toContain("preview.anti-soon.test wants you to sign in")
    expect(message).toContain("0x1111111111111111111111111111111111111111")
    expect(message).toContain(`Chain ID: ${SAPPHIRE_SIWE_CHAIN_ID}`)
    expect(message).toContain("URI: https://preview.anti-soon.test")
  })

  it("signs the SIWE message with a local private key synchronously", () => {
    const signed = signSapphireSiweMessage({
      privateKey:
        "0x59c6995e998f97a5a0044966f0945382dbb4d5b2f2f8c5b7c82f38a9f89f5b5d",
      message: "AntiSoon Sapphire SIWE smoke",
    })

    expect(signed.address).toBe("0x3eae25eac885aD094f16C846B4cbb60BA67FC549")
    expect(signed.signature.r).toMatch(/^0x[0-9a-f]{64}$/)
    expect(signed.signature.s).toMatch(/^0x[0-9a-f]{64}$/)
    expect(typeof signed.signature.v).toBe("bigint")
  })
})
