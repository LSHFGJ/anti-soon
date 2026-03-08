import { describe, expect, it } from "bun:test"

import {
  BOUNTY_HUB_SUBMISSION_STATUS,
  assertTerminalPayoutEvidence,
  createBountyHubClient,
} from "./bountyHubClient"
import type {
  BountyHubEventLog,
  BountyHubTransport,
  RegisterProjectV2Input,
} from "./bountyHubClient"

const BOUNTY_HUB_ADDRESS =
  "0x17797b473864806072186f6997801d4473aaf6e8" as const
const AUDITOR = "0x1111111111111111111111111111111111111111" as const
const OWNER = "0x2222222222222222222222222222222222222222" as const
const TARGET = "0x3333333333333333333333333333333333333333" as const
const TX_REGISTER =
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const
const TX_REVEAL_OLD =
  "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as const
const TX_REVEAL_NEW =
  "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc" as const
const TX_COMMIT =
  "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd" as const
const TX_PAYOUT =
  "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" as const
const TX_FINALIZED =
  "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" as const

function buildTransport(overrides: Partial<BountyHubTransport>): BountyHubTransport {
  return {
    readContract: async () => {
      throw new Error("Unexpected readContract call")
    },
    writeContract: async () => {
      throw new Error("Unexpected writeContract call")
    },
    waitForTransactionReceipt: async () => {
      throw new Error("Unexpected waitForTransactionReceipt call")
    },
    getEvents: async () => {
      throw new Error("Unexpected getEvents call")
    },
    ...overrides,
  }
}

function buildRegisterProjectInput(): RegisterProjectV2Input {
  return {
    value: 5_000_000_000_000_000_000n,
    targetContract: TARGET,
    maxPayoutPerBug: 2_000_000_000_000_000_000n,
    forkBlock: 0n,
    mode: 1,
    commitDeadline: 0n,
    revealDeadline: 0n,
    disputeWindow: 0n,
    rules: {
      maxAttackerSeedWei: 100_000_000_000_000_000n,
      maxWarpSeconds: 0n,
      allowImpersonation: true,
      thresholds: {
        criticalDrainWei: 10_000_000_000_000_000_000n,
        highDrainWei: 5_000_000_000_000_000_000n,
        mediumDrainWei: 1_000_000_000_000_000_000n,
        lowDrainWei: 100_000_000_000_000_000n,
      },
    },
  }
}

describe("bountyHubClient", () => {
  it("extracts tx hash and event index for workflow triggers", async () => {
    const writtenRequests: unknown[] = []
    const eventQueries: unknown[] = []
    const client = createBountyHubClient({
      address: BOUNTY_HUB_ADDRESS,
      transport: buildTransport({
        writeContract: async (request) => {
          writtenRequests.push(request)
          return TX_REGISTER
        },
        waitForTransactionReceipt: async (hash) => {
          expect(hash).toBe(TX_REGISTER)

          return {
            transactionHash: hash,
            logs: [
              {
                eventName: "ProjectRegisteredV2",
                args: {
                  projectId: 77n,
                  owner: OWNER,
                  mode: 1,
                },
                logIndex: 2,
              },
            ],
          }
        },
        getEvents: async (query) => {
          eventQueries.push(query)

          return [
            {
              eventName: "PoCRevealed",
              args: { submissionId: 501n },
              transactionHash: TX_REVEAL_OLD,
              blockNumber: 12n,
              logIndex: 8,
            },
            {
              eventName: "PoCRevealed",
              args: { submissionId: 501n },
              txHash: TX_REVEAL_NEW,
              blockNumber: 13n,
              logIndex: "4",
            },
          ] satisfies readonly BountyHubEventLog<"PoCRevealed">[]
        },
      }),
    })

    const registrationTrigger = await client.registerProjectV2(
      buildRegisterProjectInput(),
    )

    expect(writtenRequests).toEqual([
      {
        address: BOUNTY_HUB_ADDRESS,
        functionName: "registerProjectV2",
        value: 5_000_000_000_000_000_000n,
        args: [
          TARGET,
          2_000_000_000_000_000_000n,
          0n,
          1,
          0n,
          0n,
          0n,
          {
            maxAttackerSeedWei: 100_000_000_000_000_000n,
            maxWarpSeconds: 0n,
            allowImpersonation: true,
            thresholds: {
              criticalDrainWei: 10_000_000_000_000_000_000n,
              highDrainWei: 5_000_000_000_000_000_000n,
              mediumDrainWei: 1_000_000_000_000_000_000n,
              lowDrainWei: 100_000_000_000_000_000n,
            },
          },
        ],
      },
    ])
    expect(registrationTrigger).toEqual({
      eventName: "ProjectRegisteredV2",
      projectId: 77n,
      txHash: TX_REGISTER,
      eventIndex: 2,
    })

    const revealTrigger = await client.findRevealWorkflowTrigger(501n)

    expect(eventQueries).toEqual([
      {
        address: BOUNTY_HUB_ADDRESS,
        eventName: "PoCRevealed",
        signature: "event PoCRevealed(uint256 indexed submissionId)",
        args: { submissionId: 501n },
      },
    ])
    expect(revealTrigger).toEqual({
      eventName: "PoCRevealed",
      submissionId: 501n,
      txHash: TX_REVEAL_NEW,
      eventIndex: 4,
    })
  })

  it("scans indexed PoCCommitted submissions for project and auditor", async () => {
    const eventQueries: unknown[] = []
    const committedLogs = [
      {
        eventName: "PoCCommitted",
        args: {
          submissionId: 9n,
          projectId: 42n,
          auditor: AUDITOR,
          commitHash:
            "0x9999999999999999999999999999999999999999999999999999999999999999",
        },
        transactionHash: TX_COMMIT,
        blockNumber: 6n,
        logIndex: 3,
      },
      {
        eventName: "PoCCommitted",
        args: {
          submissionId: 8n,
          projectId: 42n,
          auditor: AUDITOR,
          commitHash:
            "0x8888888888888888888888888888888888888888888888888888888888888888",
        },
        transactionHash: TX_REVEAL_OLD,
        blockNumber: 5n,
        logIndex: 7,
      },
      {
        eventName: "PoCCommitted",
        args: {
          submissionId: 9n,
          projectId: 42n,
          auditor: AUDITOR,
          commitHash:
            "0x9999999999999999999999999999999999999999999999999999999999999999",
        },
        transactionHash: TX_COMMIT,
        blockNumber: 6n,
        logIndex: 3,
      },
    ] satisfies readonly BountyHubEventLog<"PoCCommitted">[]

    const client = createBountyHubClient({
      address: BOUNTY_HUB_ADDRESS,
      transport: buildTransport({
        getEvents: async (query) => {
          eventQueries.push(query)
          return committedLogs
        },
      }),
    })

    expect(await client.scanCommittedSubmissionsByProject(42n)).toEqual([
      {
        submissionId: 8n,
        projectId: 42n,
        auditor: AUDITOR,
        commitHash:
          "0x8888888888888888888888888888888888888888888888888888888888888888",
        txHash: TX_REVEAL_OLD,
        eventIndex: 7,
      },
      {
        submissionId: 9n,
        projectId: 42n,
        auditor: AUDITOR,
        commitHash:
          "0x9999999999999999999999999999999999999999999999999999999999999999",
        txHash: TX_COMMIT,
        eventIndex: 3,
      },
    ])

    expect(await client.scanCommittedSubmissionsByAuditor(AUDITOR)).toEqual([
      {
        submissionId: 8n,
        projectId: 42n,
        auditor: AUDITOR,
        commitHash:
          "0x8888888888888888888888888888888888888888888888888888888888888888",
        txHash: TX_REVEAL_OLD,
        eventIndex: 7,
      },
      {
        submissionId: 9n,
        projectId: 42n,
        auditor: AUDITOR,
        commitHash:
          "0x9999999999999999999999999999999999999999999999999999999999999999",
        txHash: TX_COMMIT,
        eventIndex: 3,
      },
    ])

    expect(eventQueries).toEqual([
      {
        address: BOUNTY_HUB_ADDRESS,
        eventName: "PoCCommitted",
        signature:
          "event PoCCommitted(uint256 indexed submissionId, uint256 indexed projectId, address indexed auditor, bytes32 commitHash)",
        args: { projectId: 42n },
      },
      {
        address: BOUNTY_HUB_ADDRESS,
        eventName: "PoCCommitted",
        signature:
          "event PoCCommitted(uint256 indexed submissionId, uint256 indexed projectId, address indexed auditor, bytes32 commitHash)",
        args: { auditor: AUDITOR },
      },
    ])
  })

  it("requires finalized and payout evidence instead of local paid flag", () => {
    expect(() =>
      assertTerminalPayoutEvidence({
        submissionId: 900n,
        auditor: AUDITOR,
        submission: {
          auditor: AUDITOR,
          status: BOUNTY_HUB_SUBMISSION_STATUS.Finalized,
          payoutAmount: 1_500_000_000_000_000_000n,
        },
        localPaidFlag: true,
      }),
    ).toThrow(
      "Terminal payout checks require contract-observable evidence, not a local paid flag",
    )

    expect(
      assertTerminalPayoutEvidence({
        submissionId: 900n,
        auditor: AUDITOR,
        submission: {
          auditor: AUDITOR,
          status: BOUNTY_HUB_SUBMISSION_STATUS.Finalized,
          payoutAmount: 1_500_000_000_000_000_000n,
        },
        payoutEvent: {
          eventName: "BountyPaid",
          args: {
            submissionId: 900n,
            auditor: AUDITOR,
            amount: 1_500_000_000_000_000_000n,
          },
          transactionHash: TX_PAYOUT,
          logIndex: 5,
        },
        finalizedEvent: {
          eventName: "BountyFinalized",
          args: { submissionId: 900n },
          transactionHash: TX_FINALIZED,
          logIndex: 6,
        },
      }),
    ).toEqual({
      submissionId: 900n,
      auditor: AUDITOR,
      payoutAmount: 1_500_000_000_000_000_000n,
      payoutTxHash: TX_PAYOUT,
      payoutEventIndex: 5,
      finalizedTxHash: TX_FINALIZED,
      finalizedEventIndex: 6,
    })
  })
})
