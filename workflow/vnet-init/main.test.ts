import { describe, expect, it } from "bun:test"
import { decodeAbiParameters, parseAbiParameters } from "viem"
import {
  decodeTypedReportEnvelope,
  encodeVnetFailedTypedReport,
  encodeVnetSuccessTypedReport,
  parseTenderlyVnetEntries,
  parseConfig,
} from "./main"

const validConfig = {
  chainSelectorName: "ethereum-testnet-sepolia",
  bountyHubAddress: "0x17797b473864806072186f6997801D4473AAF6e8",
  gasLimit: "500000",
  tenderlyAccountSlug: "LSHFGJ",
  tenderlyProjectSlug: "anti-soon",
  owner: "0xC1A97C6a4030a2089e1D9dA771De552bd67234a3",
}

const vnetSuccessParams = parseAbiParameters(
  "uint256 projectId, string vnetRpcUrl, bytes32 baseSnapshotId"
)

const vnetFailedParams = parseAbiParameters(
  "uint256 projectId, string reason"
)

describe("vnet-init typed report encoding", () => {
  it("encodes REPORT_TYPE_VNET_SUCCESS envelope with expected payload", () => {
    const projectId = 42n
    const vnetRpcUrl = "https://rpc.tenderly.co/vnet/42"
    const baseSnapshotId =
      "0x1111111111111111111111111111111111111111111111111111111111111111"

    const encoded = encodeVnetSuccessTypedReport(projectId, vnetRpcUrl, baseSnapshotId)

    const { magic, reportType, payload } = decodeTypedReportEnvelope(encoded)
    expect(magic).toBe("0x41535250")
    expect(reportType).toBe(1)

    const [decodedProjectId, decodedRpcUrl, decodedSnapshotId] = decodeAbiParameters(
      vnetSuccessParams,
      payload,
    )

    expect(decodedProjectId).toBe(projectId)
    expect(decodedRpcUrl).toBe(vnetRpcUrl)
    expect(decodedSnapshotId).toBe(baseSnapshotId)
  })

  it("encodes REPORT_TYPE_VNET_FAILED envelope with expected payload", () => {
    const projectId = 7n
    const reason = "VNet creation failed after max retries"

    const encoded = encodeVnetFailedTypedReport(projectId, reason)

    const { magic, reportType, payload } = decodeTypedReportEnvelope(encoded)
    expect(magic).toBe("0x41535250")
    expect(reportType).toBe(2)

    const [decodedProjectId, decodedReason] = decodeAbiParameters(vnetFailedParams, payload)
    expect(decodedProjectId).toBe(projectId)
    expect(decodedReason).toBe(reason)
  })
})

describe("vnet-init config validation", () => {
  it("rejects zero owner address", () => {
    expect(() =>
      parseConfig({
        ...validConfig,
        owner: "0x0000000000000000000000000000000000000000",
      }),
    ).toThrow("owner must be a non-zero EVM address")
  })

  it("rejects invalid owner address format", () => {
    expect(() =>
      parseConfig({
        ...validConfig,
        owner: "not-an-address",
      }),
    ).toThrow("owner must be a non-zero EVM address")
  })
})

describe("vnet-init Tenderly VNet parsing", () => {
  it("accepts top-level array responses from the Tenderly VNet API", () => {
    const entries = parseTenderlyVnetEntries([
      {
        slug: "antisoon-project-0",
        rpcs: [{ name: "Admin RPC", url: "https://virtual.sepolia.example/admin" }],
      },
    ])

    expect(entries).toHaveLength(1)
    expect(entries[0]?.slug).toBe("antisoon-project-0")
  })
})

describe("vnet-init workflow entrypoint", () => {
  it("uses a CRE-safe wrapper entrypoint", async () => {
    const workflowYaml = await Bun.file(
      new URL("./workflow.yaml", import.meta.url),
    ).text()

    expect(workflowYaml).toContain('workflow-path: "./entrypoint.ts"')
  })
})
