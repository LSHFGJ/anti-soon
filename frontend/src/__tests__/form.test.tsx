import { describe, it, expect } from 'vitest'
import {
  chainOptions,
  impactConfigSchema,
  impactTypes,
  pocFormSchema,
  targetConfigSchema,
  transactionSchema,
  type PocFormData,
  validateAddress,
  validateBlockNumber,
  validateHexData,
} from '@/lib/validations/poc'

const validAddress = '0x1234567890123456789012345678901234567890'

describe('Form Validation', () => {
  describe('targetConfigSchema', () => {
    it('should reject invalid Ethereum address (too short)', () => {
      const result = targetConfigSchema.safeParse({
        targetContract: '0x1234',
        forkBlock: '20000000',
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toMatch(/invalid.*address/i)
      }
    })

    it('should reject invalid Ethereum address (wrong format)', () => {
      const result = targetConfigSchema.safeParse({
        targetContract: 'invalid-address',
        forkBlock: '20000000',
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toMatch(/invalid.*address/i)
      }
    })

    it('should reject empty target address', () => {
      const result = targetConfigSchema.safeParse({
        targetContract: '',
        forkBlock: '20000000',
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toMatch(/required/i)
      }
    })

    it('should accept valid Ethereum address', () => {
      const result = targetConfigSchema.safeParse({
        targetContract: validAddress,
        forkBlock: '20000000',
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.targetContract).toBe(validAddress)
      }
    })

    it('should reject invalid fork block (zero)', () => {
      const result = targetConfigSchema.safeParse({
        targetContract: validAddress,
        forkBlock: '0',
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues.some(i => i.message.match(/positive/i))).toBe(true)
      }
    })

    it('should reject invalid fork block (negative)', () => {
      const result = targetConfigSchema.safeParse({
        targetContract: validAddress,
        forkBlock: '-1',
      })

      expect(result.success).toBe(false)
    })

    it('should accept valid fork block', () => {
      const result = targetConfigSchema.safeParse({
        targetContract: validAddress,
        forkBlock: '20000000',
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.forkBlock).toBe('20000000')
      }
    })

    it('should accept target config without chain or ABI fields', () => {
      const result = targetConfigSchema.safeParse({
        targetContract: validAddress,
        forkBlock: '20000000',
      })

      expect(result.success).toBe(true)
    })
  })

  describe('transactionSchema', () => {
    it('should reject invalid transaction target address', () => {
      const result = transactionSchema.safeParse({
        to: 'invalid',
        value: '0',
        data: '0x',
      })

      expect(result.success).toBe(false)
    })

    it('should accept valid transaction', () => {
      const result = transactionSchema.safeParse({
        to: validAddress,
        value: '1.5',
        data: '0x1234abcd',
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.to).toBe(validAddress)
        expect(result.data.value).toBe('1.5')
        expect(result.data.data).toBe('0x1234abcd')
      }
    })

    it('should reject invalid hex data', () => {
      const result = transactionSchema.safeParse({
        to: validAddress,
        value: '0',
        data: 'not-hex',
      })

      expect(result.success).toBe(false)
    })
  })

  describe('impactConfigSchema', () => {
    it('should reject invalid impact type', () => {
      const result = impactConfigSchema.safeParse({
        type: 'invalid-impact',
        estimatedLoss: '1000',
        description: 'This is a valid description',
      })

      expect(result.success).toBe(false)
    })

    it('should accept all valid impact types', () => {
      for (const impactType of impactTypes) {
        const result = impactConfigSchema.safeParse({
          type: impactType,
          estimatedLoss: '1000',
          description: 'This is a valid description',
        })

        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.type).toBe(impactType)
        }
      }
    })

    it('should accept empty description because impact notes are optional', () => {
      const result = impactConfigSchema.safeParse({
        type: 'fundsDrained',
        estimatedLoss: '',
        description: '',
      })

      expect(result.success).toBe(true)
    })

    it('should reject short description', () => {
      const result = impactConfigSchema.safeParse({
        type: 'fundsDrained',
        estimatedLoss: '1000',
        description: 'short',
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues.some(i => i.message.match(/10/i))).toBe(true)
      }
    })
  })

  describe('pocFormSchema', () => {
    const validTargetConfig = {
      targetContract: validAddress,
      chain: 'Sepolia',
      forkBlock: '20000000',
    }

    const validTransaction = {
      to: validAddress,
      value: '0',
      data: '0x',
    }

    const validImpact = {
      type: 'fundsDrained' as const,
      estimatedLoss: '1000',
      description: 'This is a valid description',
    }

    it('should accept complete valid POC form', () => {
      const result = pocFormSchema.safeParse({
        ...validTargetConfig,
        transactions: [validTransaction],
        impact: validImpact,
      })

      expect(result.success).toBe(true)
    })

    it('should reject POC form without transactions', () => {
      const result = pocFormSchema.safeParse({
        ...validTargetConfig,
        transactions: [],
        impact: validImpact,
      })

      expect(result.success).toBe(false)
    })
  })

  describe('Validation helpers', () => {
    it('validateAddress should return error for invalid address', () => {
      expect(validateAddress('invalid')).toMatch(/invalid/i)
      expect(validateAddress('')).toMatch(/required/i)
    })

    it('validateAddress should return null for valid address', () => {
      expect(validateAddress(validAddress)).toBeNull()
    })

    it('validateBlockNumber should return error for invalid block', () => {
      expect(validateBlockNumber('0')).toMatch(/positive/i)
      expect(validateBlockNumber('-1')).toMatch(/positive/i)
      expect(validateBlockNumber('')).toMatch(/required/i)
    })

    it('validateBlockNumber should return null for valid block', () => {
      expect(validateBlockNumber('20000000')).toBeNull()
    })

    it('validateHexData should return error for invalid hex', () => {
      expect(validateHexData('not-hex')).toMatch(/hex/i)
    })

    it('validateHexData should return null for valid hex', () => {
      expect(validateHexData('0x1234abcd')).toBeNull()
      expect(validateHexData('')).toBeNull()
    })
  })

  describe('Type exports', () => {
    it('should export PocFormData type', () => {
      const data: PocFormData = {
        targetContract: validAddress,
        chain: 'Sepolia',
        forkBlock: '20000000',
        transactions: [{ to: validAddress, value: '0', data: '0x' }],
        impact: { type: 'fundsDrained', estimatedLoss: '1000', description: 'Test description' },
      }
      
      expect(data.targetContract).toBe(validAddress)
      expect(data.chain).toBe('Sepolia')
      expect(data.transactions).toHaveLength(1)
    })

    it('should export impactTypes array', () => {
      expect(impactTypes).toEqual(['fundsDrained', 'accessEscalation', 'stateCorruption', 'other'])
    })

    it('should export chainOptions array', () => {
      expect(chainOptions).toEqual(['Mainnet', 'Sepolia', 'Optimism', 'Arbitrum'])
    })
  })
})
