import { keccak256, encodeAbiParameters, parseAbiParameters } from 'viem'

export function generateRandomKey(): `0x${string}` {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return `0x${Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('')}`
}

export function generateRandomSalt(): `0x${string}` {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return `0x${Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('')}`
}

export function xorEncrypt(plaintext: string, keyHex: `0x${string}`): `0x${string}` {
  const encoder = new TextEncoder()
  const data = encoder.encode(plaintext)
  const key = hexToBytes(keyHex)
  
  const encrypted = new Uint8Array(data.length)
  for (let i = 0; i < data.length; i++) {
    encrypted[i] = data[i] ^ key[i % key.length]
  }
  return `0x${bytesToHex(encrypted)}`
}

export function xorDecrypt(ciphertextHex: `0x${string}`, keyHex: `0x${string}`): string {
  const ciphertext = hexToBytes(ciphertextHex)
  const key = hexToBytes(keyHex)
  
  const decrypted = new Uint8Array(ciphertext.length)
  for (let i = 0; i < ciphertext.length; i++) {
    decrypted[i] = ciphertext[i] ^ key[i % key.length]
  }
  
  const decoder = new TextDecoder()
  return decoder.decode(decrypted)
}

export function computeCommitHash(
  cipherHash: `0x${string}`, 
  sender: `0x${string}`, 
  salt: `0x${string}`
): `0x${string}` {
  const encoded = encodeAbiParameters(
    parseAbiParameters('bytes32, address, bytes32'),
    [cipherHash, sender, salt]
  )
  return keccak256(encoded)
}

export function hashCiphertext(ciphertext: `0x${string}`): `0x${string}` {
  return keccak256(ciphertext)
}

function hexToBytes(hex: `0x${string}`): Uint8Array {
  const clean = hex.slice(2)
  const bytes = new Uint8Array(clean.length / 2)
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.slice(i, i + 2), 16)
  }
  return bytes
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}
