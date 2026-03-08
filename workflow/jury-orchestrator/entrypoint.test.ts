import { describe, expect, it } from "bun:test"
import { buildJuryPipelineInputFromHttpPayload } from "./entrypoint-helpers"

const workflowConfig = {
  chainSelectorName: "ethereum-testnet-sepolia",
  bountyHubAddress: "0x17797b473864806072186f6997801D4473AAF6e8",
  gasLimit: "300000",
  juryPolicy: {
    allowDirectSettlement: false,
    requireOwnerResolution: true,
  },
} as const

describe("jury-orchestrator CRE entrypoint helpers", () => {
  it("decodes HTTP payload JSON and injects deployed workflow config", () => {
    const payload = {
      input: new TextEncoder().encode(
        JSON.stringify({
          mode: "derive-recommendation",
          verifiedReport: {
            magic: "ASRP",
            reportType: "verified-report/v1",
            payload: {
              submissionId: "9",
              projectId: "2",
              isValid: true,
              drainAmountWei: "1300000000000000000",
              observedCalldata: ["0xdeadbeef"],
            },
          },
        }),
      ),
    }

    expect(buildJuryPipelineInputFromHttpPayload(workflowConfig, payload)).toEqual({
      mode: "derive-recommendation",
      config: workflowConfig,
      verifiedReport: {
        magic: "ASRP",
        reportType: "verified-report/v1",
        payload: {
          submissionId: "9",
          projectId: "2",
          isValid: true,
          drainAmountWei: "1300000000000000000",
          observedCalldata: ["0xdeadbeef"],
        },
      },
    })
  })

  it("rejects HTTP payloads that attempt to override deployed workflow config", () => {
    const payload = {
      input: new TextEncoder().encode(
        JSON.stringify({
          config: {
            bountyHubAddress: "0x0000000000000000000000000000000000000001",
          },
          verifiedReport: {
            magic: "ASRP",
            reportType: "verified-report/v1",
            payload: {
              submissionId: "9",
              projectId: "2",
              isValid: true,
              drainAmountWei: "1300000000000000000",
              observedCalldata: ["0xdeadbeef"],
            },
          },
        }),
      ),
    }

    expect(() => buildJuryPipelineInputFromHttpPayload(workflowConfig, payload)).toThrow(
      "must not include config",
    )
  })
})
