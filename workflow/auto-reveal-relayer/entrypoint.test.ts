import { describe, expect, it } from "bun:test"
import {
  buildAutoRevealExecutionEnv,
  resolveRequiredEntrypointSecret,
} from "./entrypoint-helpers"

const workflowConfig = {
  chainSelectorName: "ethereum-testnet-sepolia",
  bountyHubAddress: "0x17797b473864806072186f6997801D4473AAF6e8",
  gasLimit: "500000",
} as const

describe("auto-reveal-relayer CRE entrypoint helpers", () => {
  it("builds relayer execution env from runtime secrets and deployed config", () => {
    const env = buildAutoRevealExecutionEnv(workflowConfig, {
      AUTO_REVEAL_PUBLIC_RPC_URL: "https://ethereum-sepolia-rpc.publicnode.com",
      AUTO_REVEAL_ADMIN_RPC_URL: "https://rpc.tenderly.co/fork/admin",
      AUTO_REVEAL_PRIVATE_KEY:
        "0x1111111111111111111111111111111111111111111111111111111111111111",
      AUTO_REVEAL_CHAIN_ID: "11155111",
    })

    expect(env).toEqual({
      AUTO_REVEAL_PUBLIC_RPC_URL: "https://ethereum-sepolia-rpc.publicnode.com",
      AUTO_REVEAL_ADMIN_RPC_URL: "https://rpc.tenderly.co/fork/admin",
      AUTO_REVEAL_PRIVATE_KEY:
        "0x1111111111111111111111111111111111111111111111111111111111111111",
      AUTO_REVEAL_BOUNTY_HUB_ADDRESS: workflowConfig.bountyHubAddress,
      AUTO_REVEAL_CHAIN_ID: "11155111",
    })
  })

  it("fails closed when a required relayer secret is missing", () => {
    expect(() =>
      buildAutoRevealExecutionEnv(workflowConfig, {
        AUTO_REVEAL_PUBLIC_RPC_URL: "https://ethereum-sepolia-rpc.publicnode.com",
        AUTO_REVEAL_PRIVATE_KEY:
          "0x1111111111111111111111111111111111111111111111111111111111111111",
      }),
    ).toThrow("Missing required entrypoint secret: AUTO_REVEAL_ADMIN_RPC_URL")
  })

  it("rejects conflicting bounty hub overrides instead of silently masking drift", () => {
    expect(() =>
      buildAutoRevealExecutionEnv(workflowConfig, {
        AUTO_REVEAL_PUBLIC_RPC_URL: "https://ethereum-sepolia-rpc.publicnode.com",
        AUTO_REVEAL_ADMIN_RPC_URL: "https://rpc.tenderly.co/fork/admin",
        AUTO_REVEAL_PRIVATE_KEY:
          "0x1111111111111111111111111111111111111111111111111111111111111111",
        AUTO_REVEAL_BOUNTY_HUB_ADDRESS: "0x0000000000000000000000000000000000000001",
      }),
    ).toThrow("AUTO_REVEAL_BOUNTY_HUB_ADDRESS must match workflow config bountyHubAddress")
  })

  it("falls back to canonical local simulator env aliases for required secrets", () => {
    expect(
      resolveRequiredEntrypointSecret({
        secretId: "AUTO_REVEAL_PUBLIC_RPC_URL",
        processEnv: {
          CRE_SIM_SEPOLIA_RPC_URL: "https://ethereum-sepolia-rpc.publicnode.com",
        },
      }),
    ).toBe("https://ethereum-sepolia-rpc.publicnode.com")

    expect(
      resolveRequiredEntrypointSecret({
        secretId: "AUTO_REVEAL_PRIVATE_KEY",
        processEnv: {
          CRE_SIM_PRIVATE_KEY:
            "0x1111111111111111111111111111111111111111111111111111111111111111",
        },
      }),
    ).toBe("0x1111111111111111111111111111111111111111111111111111111111111111")
  })

  it("prefers runtime secrets over process env fallbacks", () => {
    expect(
      resolveRequiredEntrypointSecret({
        secretId: "AUTO_REVEAL_ADMIN_RPC_URL",
        runtimeSecretValue: "https://runtime-admin.example",
        processEnv: {
          CRE_SIM_ADMIN_RPC_URL: "https://process-admin.example",
        },
      }),
    ).toBe("https://runtime-admin.example")
  })
})
