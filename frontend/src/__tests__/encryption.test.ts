import { describe, it, expect } from 'vitest'
import {
  generateAesKey,
  exportPublicKey,
  aesGcmEncrypt,
  aesGcmDecrypt
} from '../utils/encryption'

describe('AES-GCM Encryption', () => {
  describe('generateAesKey', () => {
    it('should generate a valid AES-256-GCM key', async () => {
      const key = await generateAesKey()
      expect(key).toBeDefined()
      expect(key.type).toBe('secret')
      expect(key.algorithm.name).toBe('AES-GCM')
      expect((key.algorithm as AesKeyGenParams).length).toBe(256)
      expect(key.extractable).toBe(true)
      expect(key.usages).toContain('encrypt')
      expect(key.usages).toContain('decrypt')
    })

    it('should generate unique keys each time', async () => {
      const key1 = await generateAesKey()
      const key2 = await generateAesKey()
      const exported1 = await exportPublicKey(key1)
      const exported2 = await exportPublicKey(key2)
      
      expect(new Uint8Array(exported1)).not.toEqual(new Uint8Array(exported2))
    })
  })

  describe('exportPublicKey', () => {
    it('should export key to Uint8Array', async () => {
      const key = await generateAesKey()
      const keyBytes = await exportPublicKey(key)
      
      expect(keyBytes).toBeInstanceOf(Uint8Array)
      expect(keyBytes.length).toBe(32)
    })

    it('should produce consistent exports for the same key', async () => {
      const key = await generateAesKey()
      const export1 = await exportPublicKey(key)
      const export2 = await exportPublicKey(key)
      
      expect(new Uint8Array(export1)).toEqual(new Uint8Array(export2))
    })
  })

  describe('encrypt/decrypt roundtrip', () => {
    it('should successfully encrypt and decrypt a simple string', async () => {
      const key = await generateAesKey()
      const keyBytes = await exportPublicKey(key)
      const plaintext = 'Hello, World!'
      
      const { ciphertext, iv } = await aesGcmEncrypt(plaintext, keyBytes)
      const decrypted = await aesGcmDecrypt(ciphertext, iv, keyBytes)
      
      expect(decrypted).toBe(plaintext)
    })

    it('should encrypt and decrypt empty string', async () => {
      const key = await generateAesKey()
      const keyBytes = await exportPublicKey(key)
      const plaintext = ''
      
      const { ciphertext, iv } = await aesGcmEncrypt(plaintext, keyBytes)
      const decrypted = await aesGcmDecrypt(ciphertext, iv, keyBytes)
      
      expect(decrypted).toBe(plaintext)
    })

    it('should encrypt and decrypt JSON string', async () => {
      const key = await generateAesKey()
      const keyBytes = await exportPublicKey(key)
      const plaintext = JSON.stringify({
        target: '0x1234567890123456789012345678901234567890',
        chain: 'Sepolia',
        conditions: [
          { type: 'setBalance', value: '1000000000000000000' }
        ]
      })
      
      const { ciphertext, iv } = await aesGcmEncrypt(plaintext, keyBytes)
      const decrypted = await aesGcmDecrypt(ciphertext, iv, keyBytes)
      
      expect(decrypted).toBe(plaintext)
    })

    it('should produce different ciphertext for same plaintext with different IVs', async () => {
      const key = await generateAesKey()
      const keyBytes = await exportPublicKey(key)
      const plaintext = 'Same text'
      
      const { ciphertext: ciphertext1, iv: iv1 } = await aesGcmEncrypt(plaintext, keyBytes)
      const { ciphertext: ciphertext2, iv: iv2 } = await aesGcmEncrypt(plaintext, keyBytes)
      
      expect(iv1).not.toEqual(iv2)
      expect(ciphertext1).not.toEqual(ciphertext2)
      const decrypted1 = await aesGcmDecrypt(ciphertext1, iv1, keyBytes)
      const decrypted2 = await aesGcmDecrypt(ciphertext2, iv2, keyBytes)
      expect(decrypted1).toBe(decrypted2)
      expect(decrypted1).toBe(plaintext)
    })

    it('should use 12-byte IV for GCM', async () => {
      const key = await generateAesKey()
      const keyBytes = await exportPublicKey(key)
      const plaintext = 'Test'
      
      const { iv } = await aesGcmEncrypt(plaintext, keyBytes)
      
      expect(iv.length).toBe(12)
    })

    it('should fail to decrypt with wrong key', async () => {
      const key1 = await generateAesKey()
      const keyBytes1 = await exportPublicKey(key1)
      const key2 = await generateAesKey()
      const keyBytes2 = await exportPublicKey(key2)
      const plaintext = 'Secret message'
      
      const { ciphertext, iv } = await aesGcmEncrypt(plaintext, keyBytes1)
      
      await expect(aesGcmDecrypt(ciphertext, iv, keyBytes2)).rejects.toThrow()
    })

    it('should fail to decrypt with wrong IV', async () => {
      const key = await generateAesKey()
      const keyBytes = await exportPublicKey(key)
      const plaintext = 'Secret message'
      
      const { ciphertext } = await aesGcmEncrypt(plaintext, keyBytes)
      const wrongIv = new Uint8Array(12)
      
      await expect(aesGcmDecrypt(ciphertext, wrongIv, keyBytes)).rejects.toThrow()
    })
  })

  describe('PoC data encryption simulation', () => {
    it('should encrypt and decrypt realistic PoC JSON', async () => {
      const key = await generateAesKey()
      const keyBytes = await exportPublicKey(key)
      
      const pocJson = JSON.stringify({
        target: '0x7f66d83C0c920CAFA3773fFCd2eE802340a84fb9',
        chain: 'Sepolia',
        forkBlock: 6500000,
        conditions: [
          {
            type: 'setBalance',
            value: '1000000000000000000',
            target: '0xAttacker'
          },
          {
            type: 'setTimestamp',
            value: '1737000000'
          }
        ],
        transactions: [
          {
            to: '0x7f66d83C0c920CAFA3773fFCd2eE802340a84fb9',
            value: '0',
            data: '0xa9059cbb000000000000000000000000attacker0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000de0b6b3a7640000'
          }
        ],
        impact: {
          type: 'fundsDrained',
          estimatedLoss: '1000000000000000000000',
          description: 'Reentrancy vulnerability allows draining of contract funds'
        },
        metadata: {
          title: 'Reentrancy in withdraw()',
          severity: 'High',
          author: 'Auditor'
        }
      })
      
      const { ciphertext, iv } = await aesGcmEncrypt(pocJson, keyBytes)
      const decrypted = await aesGcmDecrypt(ciphertext, iv, keyBytes)
      
      expect(decrypted).toBe(pocJson)
      
      // Verify JSON structure is preserved
      const decryptedObj = JSON.parse(decrypted)
      expect(decryptedObj.target).toBe('0x7f66d83C0c920CAFA3773fFCd2eE802340a84fb9')
      expect(decryptedObj.conditions).toHaveLength(2)
      expect(decryptedObj.transactions).toHaveLength(1)
    })
  })
})
