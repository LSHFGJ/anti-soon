import { describe, expect, it } from "bun:test"
import {
  buildProjectKeyProvisioningMetadata,
  createSafeProvisioningLogs,
  validatePrivateKeyHex,
} from "./provisioning"

describe("key provisioning metadata", () => {
  it("builds deterministic owner-bound secret metadata", () => {
    const metadata = buildProjectKeyProvisioningMetadata(
      12n,
      "0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD",
      {
        keyProvisioningMode: "manual",
        keySecretPrefix: "PROJECT_KEY_",
        oasisChain: "oasis-sapphire-testnet",
      }
    )

    expect(metadata.secretId).toBe("PROJECT_KEY_12")
    expect(metadata.owner).toBe("0xabcdefabcdefabcdefabcdefabcdefabcdefabcd")
    expect(metadata.mode).toBe("manual")
  })

  it("creates safe logs with no private key material", () => {
    const metadata = buildProjectKeyProvisioningMetadata(
      3n,
      "0x1111111111111111111111111111111111111111",
      {
        keyProvisioningMode: "manual",
        keySecretPrefix: "PROJECT_KEY_",
        oasisChain: "oasis-sapphire-testnet",
      }
    )

    const logs = createSafeProvisioningLogs(metadata)
    expect(logs.length).toBe(4)
    expect(logs.join(" ").includes("private key material is never logged")).toBe(true)
  })

  it("validates p256 private key hex format", () => {
    expect(validatePrivateKeyHex("a".repeat(64))).toBe(true)
    expect(validatePrivateKeyHex("0x" + "a".repeat(64))).toBe(false)
    expect(validatePrivateKeyHex("a".repeat(63))).toBe(false)
  })
})
