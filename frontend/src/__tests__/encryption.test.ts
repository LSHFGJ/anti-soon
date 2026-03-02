import { describe, it, expect } from 'vitest'
import { encodePacked, getAddress, keccak256 } from 'viem'
import {
  computeCommitHash,
  generateRandomSalt,
  hashCiphertext,
} from '../utils/encryption'

describe('commit-reveal helpers', () => {
  describe('generateRandomSalt', () => {
    it('returns a 32-byte hex string', () => {
      const salt = generateRandomSalt()
      expect(salt).toMatch(/^0x[0-9a-f]{64}$/)
    })

    it('returns different salts across calls', () => {
      const first = generateRandomSalt()
      const second = generateRandomSalt()
      expect(first).not.toBe(second)
    })
  })

  describe('hashCiphertext', () => {
    it('returns deterministic keccak hash for ciphertext', () => {
      const ciphertext = '0x1234' as const
      const hash1 = hashCiphertext(ciphertext)
      const hash2 = hashCiphertext(ciphertext)
      expect(hash1).toBe(hash2)
      expect(hash1).toMatch(/^0x[0-9a-f]{64}$/)
    })
  })

  describe('computeCommitHash', () => {
    it('returns deterministic commit hash for same inputs', () => {
      const cipherHash = '0x1111111111111111111111111111111111111111111111111111111111111111' as const
      const sender = '0x2222222222222222222222222222222222222222' as const
      const salt = '0x3333333333333333333333333333333333333333333333333333333333333333' as const

      const hash1 = computeCommitHash(cipherHash, sender, salt)
      const hash2 = computeCommitHash(cipherHash, sender, salt)
      expect(hash1).toBe(hash2)
      expect(hash1).toMatch(/^0x[0-9a-f]{64}$/)
    })

    it('changes when salt changes', () => {
      const cipherHash = '0x1111111111111111111111111111111111111111111111111111111111111111' as const
      const sender = '0x2222222222222222222222222222222222222222' as const
      const salt1 = '0x3333333333333333333333333333333333333333333333333333333333333333' as const
      const salt2 = '0x4444444444444444444444444444444444444444444444444444444444444444' as const

      const hash1 = computeCommitHash(cipherHash, sender, salt1)
      const hash2 = computeCommitHash(cipherHash, sender, salt2)
      expect(hash1).not.toBe(hash2)
    })
  })

  describe('commit hash parity', () => {
    const parityVectors = [
      {
        label: 'zero salt',
        cipherHash: '0x1111111111111111111111111111111111111111111111111111111111111111' as const,
        auditor: '0x1234567890abcdef1234567890abcdef12345678' as const,
        salt: '0x0000000000000000000000000000000000000000000000000000000000000000' as const,
        expected: '0xdef33f6b6ce0e9a580d69ef6197b369e9f0c730a7e236f18cb10f81b50553ff8' as const,
      },
      {
        label: 'non-zero salt',
        cipherHash: '0x1111111111111111111111111111111111111111111111111111111111111111' as const,
        auditor: '0x1234567890abcdef1234567890abcdef12345678' as const,
        salt: '0x0000000000000000000000000000000000000000000000000000000000000001' as const,
        expected: '0xf641fd3cce8357e710a05823a932fbd74560a92138e93d551f7deec51075bbf8' as const,
      },
      {
        label: 'casing vector',
        cipherHash: '0x1111111111111111111111111111111111111111111111111111111111111111' as const,
        auditor: '0x1234567890abcdef1234567890abcdef12345678' as const,
        salt: '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' as const,
        expected: '0x48b50f8460cbfe9c9fb6779ae1ad17ce3b925412f902b158a54d5d22f23662f4' as const,
      },
    ] as const

    it('commit hash parity vectors match Solidity packed recomputation', () => {
      for (const vector of parityVectors) {
        const packedHash = keccak256(
          encodePacked(['bytes32', 'address', 'bytes32'], [vector.cipherHash, vector.auditor, vector.salt])
        )
        const frontendHash = computeCommitHash(vector.cipherHash, vector.auditor, vector.salt)

        expect(packedHash, `${vector.label} packed hash drift`).toBe(vector.expected)
        expect(frontendHash, `${vector.label} frontend hash drift`).toBe(vector.expected)
      }
    })

    it('commit hash parity address casing is explicit and normalized', () => {
      const vector = parityVectors[2]
      const checksumAddress = getAddress(vector.auditor)

      const lowercaseHash = computeCommitHash(vector.cipherHash, vector.auditor, vector.salt)
      const checksumHash = computeCommitHash(vector.cipherHash, checksumAddress, vector.salt)

      expect(checksumHash).toBe(lowercaseHash)
      expect(checksumHash).toBe(vector.expected)
    })
  })
})
