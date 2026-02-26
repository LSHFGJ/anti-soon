import { describe, expect, it } from "bun:test"
import {
  deriveDeterministicP256PrivateKey,
  generateDeterministicECDHKeyPair,
} from "./keypair"

describe("deterministic keypair generation", () => {
  it("derives stable 32-byte private keys", () => {
    const owner = "0xC1A97C6a4030a2089e1D9dA771De552bd67234a3"

    const keyA = deriveDeterministicP256PrivateKey(1n, owner)
    const keyB = deriveDeterministicP256PrivateKey(1n, owner)
    const keyC = deriveDeterministicP256PrivateKey(2n, owner)

    expect(keyA).toBe(keyB)
    expect(keyA === keyC).toBe(false)
    expect(/^[0-9a-f]{64}$/.test(keyA)).toBe(true)
  })

  it("builds deterministic public keys without runtime randomness", () => {
    const owner = "0xC1A97C6a4030a2089e1D9dA771De552bd67234a3"

    const pairA = generateDeterministicECDHKeyPair(1n, owner)
    const pairB = generateDeterministicECDHKeyPair(1n, owner)

    expect(pairA.privateKey).toBe(pairB.privateKey)
    expect(pairA.publicKey).toBe(pairB.publicKey)
    expect(/^[0-9a-f]{64}$/.test(pairA.privateKey)).toBe(true)
    expect(/^[0-9a-f]{128}$/.test(pairA.publicKey)).toBe(true)
  })
})
