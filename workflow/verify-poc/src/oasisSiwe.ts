import { secp256k1 } from "@noble/curves/secp256k1"
import { hashMessage, toHex } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { createSiweMessage } from "viem/siwe"

export const SAPPHIRE_SIWE_CHAIN_ID = 23295
export const SAPPHIRE_SIWE_STATEMENT =
  "Authorize AntiSoon to read your Sapphire PoC preview."
export const SAPPHIRE_SIWE_TTL_MS = 60 * 60 * 1000

const OASIS_READ_PRIVATE_KEY_ENV_KEYS = [
  "CRE_ETH_PRIVATE_KEY",
  "PRIVATE_KEY",
  "CRE_SIM_PRIVATE_KEY",
  "DEMO_OPERATOR_PRIVATE_KEY",
] as const

export const OASIS_READ_PRIVATE_KEY_SECRET_ID = "OASIS_READ_PRIVATE_KEY" as const

export type OasisReadEnv = Record<string, string | undefined>

export type SapphireSiweSignature = {
  r: `0x${string}`
  s: `0x${string}`
  v: bigint
}

function normalizeOasisReadPrivateKey(
  candidate?: string,
): `0x${string}` | undefined {
  const normalized = candidate?.trim()
  if (!normalized) {
    return undefined
  }

  if (/^0x[0-9a-fA-F]{64}$/.test(normalized)) {
    return normalized.toLowerCase() as `0x${string}`
  }

  return undefined
}

export function buildSapphireSiweUri(domain: string): string {
  if (domain.startsWith("http://") || domain.startsWith("https://")) {
    return domain
  }

  return `https://${domain}`
}

export function resolveOasisReadPrivateKey(
  args: {
    secretValue?: string
    env?: OasisReadEnv
  },
): `0x${string}` | undefined {
  const secretValue = normalizeOasisReadPrivateKey(args.secretValue)
  if (secretValue) {
    return secretValue
  }

  for (const key of OASIS_READ_PRIVATE_KEY_ENV_KEYS) {
    const candidate = normalizeOasisReadPrivateKey(args.env?.[key])
    if (candidate) {
      return candidate
    }
  }

  return undefined
}

export function buildSapphireSiweMessage(args: {
  address: `0x${string}`
  domain: string
  nonce: string
  issuedAt: Date
  expiresAt: Date
}): string {
  return createSiweMessage({
    address: args.address,
    chainId: SAPPHIRE_SIWE_CHAIN_ID,
    domain: args.domain,
    expirationTime: args.expiresAt,
    issuedAt: args.issuedAt,
    nonce: args.nonce,
    statement: SAPPHIRE_SIWE_STATEMENT,
    uri: buildSapphireSiweUri(args.domain),
    version: "1",
  })
}

export function signSapphireSiweMessage(args: {
  privateKey: `0x${string}`
  message: string
}): {
  address: `0x${string}`
  signature: SapphireSiweSignature
} {
  const account = privateKeyToAccount(args.privateKey)
  const messageHash = hashMessage(args.message)
  const { r, s, recovery } = secp256k1.sign(
    messageHash.slice(2),
    args.privateKey.slice(2),
    { lowS: true },
  )

  return {
    address: account.address,
    signature: {
      r: toHex(r, { size: 32 }),
      s: toHex(s, { size: 32 }),
      v: recovery ? 28n : 27n,
    },
  }
}
