import { keccak256, encodeAbiParameters, parseAbiParameters } from 'viem'

// AES-GCM Encryption Utilities
// Replaces deprecated XOR encryption for client-side PoC encryption

/**
 * Generate an AES-256-GCM encryption key
 * @returns CryptoKey object for use with Web Crypto API
 */
export async function generateAesKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    {
      name: 'AES-GCM',
      length: 256,
    },
    true,
    ['encrypt', 'decrypt']
  )
}

/**
 * Export a CryptoKey to raw bytes (Uint8Array)
 * Used for storing/transmitting the key
 * @param key - CryptoKey to export
 * @returns Raw key bytes
 */
export async function exportPublicKey(key: CryptoKey): Promise<Uint8Array> {
  const exported = await crypto.subtle.exportKey('raw', key)
  return new Uint8Array(exported)
}

/**
 * Import raw bytes back to CryptoKey
 * @param keyBytes - Raw key bytes
 * @returns CryptoKey object
 */
export async function importAesKey(keyBytes: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    keyBytes.buffer as ArrayBuffer,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  )
}

/**
 * AES-GCM encryption
 * @param plaintext - String to encrypt
 * @param keyBytes - Raw key bytes (from exportPublicKey)
 * @returns Object with ciphertext and IV (both Uint8Array)
 */
export async function aesGcmEncrypt(
  plaintext: string,
  keyBytes: Uint8Array
): Promise<{ ciphertext: Uint8Array; iv: Uint8Array }> {
  const key = await importAesKey(keyBytes)
  const encoder = new TextEncoder()
  const data = encoder.encode(plaintext)

  // Generate 12-byte IV (96 bits) for GCM
  const iv = crypto.getRandomValues(new Uint8Array(12))

  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv.buffer as ArrayBuffer,
    },
    key,
    data.buffer as ArrayBuffer
  )

  return {
    ciphertext: new Uint8Array(ciphertext),
    iv: iv,
  }
}

/**
 * AES-GCM decryption
 * @param ciphertext - Encrypted data (Uint8Array)
 * @param iv - Initialization vector used for encryption (12 bytes)
 * @param keyBytes - Raw key bytes (from exportPublicKey)
 * @returns Decrypted plaintext string
 */
export async function aesGcmDecrypt(
  ciphertext: Uint8Array,
  iv: Uint8Array,
  keyBytes: Uint8Array
): Promise<string> {
  const key = await importAesKey(keyBytes)

  const decrypted = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: iv.buffer as ArrayBuffer,
    },
    key,
    ciphertext.buffer as ArrayBuffer
  )

  const decoder = new TextDecoder()
  return decoder.decode(decrypted)
}

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
  const encoded = encodeAbiParameters(
    parseAbiParameters('bytes32, address, bytes32'),
    [cipherHash, sender, salt]
  )
  return keccak256(encoded)
}

export function hashCiphertext(ciphertext: `0x${string}`): `0x${string}` {
  return keccak256(ciphertext)
}
