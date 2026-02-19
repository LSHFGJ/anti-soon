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
    keyBytes,
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
      iv: iv,
    },
    key,
    data
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
      iv: iv,
    },
    key,
    ciphertext
  )

  const decoder = new TextDecoder()
  return decoder.decode(decrypted)
}

// ==================== DEPRECATED XOR ENCRYPTION ====================
// The following functions are deprecated in favor of AES-GCM encryption.
// XOR encryption is cryptographically weak and provides no real security.
// These are kept for reference only and will be removed in a future update.
// Use aesGcmEncrypt/aesGcmDecrypt instead.
// ===================================================================

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
