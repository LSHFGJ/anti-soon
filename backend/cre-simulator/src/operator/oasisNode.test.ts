import { describe, expect, it } from "bun:test"

import { uploadPoCToOasis, type HexString } from "./oasisNode"

const AUDITOR = "0x7777777777777777777777777777777777777777" as const
const AUDITOR_PRIVATE_KEY =
  "0x7777777777777777777777777777777777777777777777777777777777777777" as const
const STORAGE_CONTRACT =
  "0x1234567890abcdef1234567890abcdef12345678" as const
const TX_HASH =
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const
const SLOT_HASH =
  "0x1111111111111111111111111111111111111111111111111111111111111111" as const
const POC_HASH =
  "0x2222222222222222222222222222222222222222222222222222222222222222" as const
const ENVELOPE_HASH =
  "0x3333333333333333333333333333333333333333333333333333333333333333" as const
const ENCODED_ENVELOPE = "0x4444" as const

describe("uploadPoCToOasis", () => {
  it("falls back to a direct Sapphire storage-contract write when no upload API URL is configured", async () => {
    const pocJson = JSON.stringify({
      target: { contract: "0x3333333333333333333333333333333333333333", chain: 11155111 },
      transactions: [{ to: "0x3333333333333333333333333333333333333333", data: "0x", value: "0" }],
    })

    const writeCalls: Array<Record<string, unknown>> = []
    const waitCalls: Array<Record<string, unknown>> = []
    const createdWalletAccounts: unknown[] = []
    const encoder = new TextEncoder()
    const canonicalPoCJson = JSON.stringify(JSON.parse(pocJson))
    const signerAccount = {
      address: AUDITOR,
      signTransaction: async () => TX_HASH,
    }

    const result = await uploadPoCToOasis(
      {
        pocJson,
        projectId: 77n,
        auditor: AUDITOR,
        env: {
          DEMO_AUDITOR_PRIVATE_KEY: AUDITOR_PRIVATE_KEY,
          VITE_OASIS_STORAGE_CONTRACT: STORAGE_CONTRACT,
        },
      },
      {
        accountFromPrivateKey: () => signerAccount,
        encodeAbiParameters: (_params, values) => {
          expect(values).toEqual([
            "anti-soon.oasis-envelope.v1",
            "oasis-sapphire-testnet",
            STORAGE_CONTRACT,
            `slot-${SLOT_HASH.slice(2, 18)}`,
            POC_HASH,
            POC_HASH,
          ])
          return ENCODED_ENVELOPE
        },
        keccak256: (value) => {
          if (typeof value === "string") {
            expect(value).toBe(ENCODED_ENVELOPE)
            return ENVELOPE_HASH
          }

          const decoded = new TextDecoder().decode(value)
          if (decoded === `77:${AUDITOR}:${pocJson}`) {
            return SLOT_HASH
          }
          if (decoded === canonicalPoCJson) {
            return POC_HASH
          }

          throw new Error(`Unexpected hash input: ${decoded}`)
        },
        parseAbi: () => [{ type: "function", name: "write" }] as unknown[],
        parseAbiParameters: () => ENCODED_ENVELOPE,
        toBytes: (value) => encoder.encode(value),
        createWalletClient: ({ account }) => {
          createdWalletAccounts.push(account)
          return {
          writeContract: async (request) => {
            writeCalls.push(request as Record<string, unknown>)
            return TX_HASH
          },
        }
        },
        createPublicClient: () => ({
          waitForTransactionReceipt: async (request) => {
            waitCalls.push(request as Record<string, unknown>)
            return { status: "success" as const }
          },
        }),
      },
    )

    expect(waitCalls).toEqual([{ hash: TX_HASH }])
    expect(createdWalletAccounts).toEqual([signerAccount])
    expect(writeCalls).toHaveLength(1)

    expect(writeCalls[0].address).toBe(STORAGE_CONTRACT)
    expect(writeCalls[0].functionName).toBe("write")

    const slotId = (writeCalls[0].args as [string, string])[0]
    const payloadJson = (writeCalls[0].args as [string, string])[1]
    const payload = JSON.parse(payloadJson) as {
      projectId: string
      auditor: string
      pointer: { chain: string; contract: string; slotId: string }
      envelopeHash: HexString
      poc: unknown
    }

    expect(slotId).toBe(`slot-${SLOT_HASH.slice(2, 18)}`)
    expect(payload.projectId).toBe("77")
    expect(payload.auditor).toBe(AUDITOR)
    expect(payload.pointer).toEqual({
      chain: "oasis-sapphire-testnet",
      contract: STORAGE_CONTRACT,
      slotId,
    })
    expect(payload.poc).toEqual(JSON.parse(pocJson))
    expect(result).toEqual({
      cipherURI: `oasis://oasis-sapphire-testnet/${STORAGE_CONTRACT}/${encodeURIComponent(slotId)}#${ENVELOPE_HASH}`,
      oasisTxHash: TX_HASH,
    })
  })

  it("uses the relayer upload path without touching direct Sapphire signer dependencies", async () => {
    const fetchCalls: Array<{ url: string; body: string }> = []

    const result = await uploadPoCToOasis(
      {
        pocJson: JSON.stringify({ ok: true }),
        projectId: 77n,
        auditor: AUDITOR,
        env: {
          DEMO_OPERATOR_OASIS_UPLOAD_API_URL: "https://upload.test/api/oasis",
        },
      },
      {
        fetchFn: async (input, init) => {
          fetchCalls.push({
            url: String(input),
            body: String(init?.body ?? ""),
          })
          return new Response(
            JSON.stringify({
              cipherURI:
                "oasis://oasis-sapphire-testnet/0x1234567890abcdef1234567890abcdef12345678/slot-relayer#0x5555555555555555555555555555555555555555555555555555555555555555",
              oasisTxHash: TX_HASH,
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          )
        },
        accountFromPrivateKey: () => {
          throw new Error("direct signer should not be touched")
        },
        createWalletClient: () => {
          throw new Error("direct wallet client should not be created")
        },
        createPublicClient: () => {
          throw new Error("direct public client should not be created")
        },
      },
    )

    expect(fetchCalls).toEqual([
      {
        url: "https://upload.test/api/oasis",
        body: JSON.stringify({
          poc: JSON.stringify({ ok: true }),
          projectId: "77",
          auditor: AUDITOR,
        }),
      },
    ])
    expect(result).toEqual({
      cipherURI:
        "oasis://oasis-sapphire-testnet/0x1234567890abcdef1234567890abcdef12345678/slot-relayer#0x5555555555555555555555555555555555555555555555555555555555555555",
      oasisTxHash: TX_HASH,
    })
  })

  it("fails closed for the direct write path when VITE_OASIS_STORAGE_CONTRACT is missing", async () => {
    await expect(
      uploadPoCToOasis(
        {
          pocJson: JSON.stringify({ ok: true }),
          projectId: 77n,
          auditor: AUDITOR,
          env: {
            DEMO_AUDITOR_PRIVATE_KEY: AUDITOR_PRIVATE_KEY,
          },
        },
        {
          accountFromPrivateKey: () => ({ address: AUDITOR }),
          createWalletClient: () => {
            throw new Error("wallet client should not be created")
          },
          createPublicClient: () => {
            throw new Error("public client should not be created")
          },
        },
      ),
    ).rejects.toThrow(
      "VITE_OASIS_STORAGE_CONTRACT must be set to a valid Ethereum address before uploading PoCs.",
    )
  })
})
