import { hexToBase64 } from "@chainlink/cre-sdk"

function bytesToHex(bytes: Uint8Array): `0x${string}` {
  const hex = Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")

  return `0x${hex}`
}

export function encodeJsonBodyBase64(payload: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(payload))
  return hexToBase64(bytesToHex(bytes))
}
