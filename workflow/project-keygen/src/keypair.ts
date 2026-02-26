import elliptic from "elliptic"
import { keccak256, toBytes } from "viem"

const EC = elliptic.ec
const curve = new EC("p256")

const P256_ORDER = BigInt("0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551")

function normalizeOwner(owner: string): string {
  return owner.startsWith("0x") ? owner.toLowerCase() : `0x${owner.toLowerCase()}`
}

export function deriveDeterministicP256PrivateKey(projectId: bigint, owner: string): string {
  const normalizedOwner = normalizeOwner(owner)

  let counter = 0n
  while (true) {
    const seed = `anti-soon.project-keygen.v1:${projectId}:${normalizedOwner}:${counter}`
    const digest = BigInt(keccak256(toBytes(seed)))
    const candidate = (digest % (P256_ORDER - 1n)) + 1n

    if (candidate > 0n && candidate < P256_ORDER) {
      return candidate.toString(16).padStart(64, "0")
    }

    counter += 1n
  }
}

export function generateDeterministicECDHKeyPair(projectId: bigint, owner: string): {
  privateKey: string
  publicKey: string
} {
  const privateKey = deriveDeterministicP256PrivateKey(projectId, owner)
  const keyPair = curve.keyFromPrivate(privateKey, "hex")
  const pubPoint = keyPair.getPublic()
  const pubX = pubPoint.getX().toString("hex").padStart(64, "0")
  const pubY = pubPoint.getY().toString("hex").padStart(64, "0")

  return { privateKey, publicKey: `${pubX}${pubY}` }
}
