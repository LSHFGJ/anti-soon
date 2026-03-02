import { encodePacked, keccak256 } from 'viem'

export function generateRandomSalt(): `0x${string}` {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return `0x${Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('')}`
}

export function computeCommitHash(
  cipherHash: `0x${string}`, 
  sender: `0x${string}`, 
  salt: `0x${string}`
): `0x${string}` {
  const encoded = encodePacked(
    ['bytes32', 'address', 'bytes32'],
    [cipherHash, sender, salt]
  )
  return keccak256(encoded)
}

export function hashCiphertext(ciphertext: `0x${string}`): `0x${string}` {
  return keccak256(ciphertext)
}
