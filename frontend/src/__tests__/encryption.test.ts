import { describe, it, expect } from 'vitest'
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
})
