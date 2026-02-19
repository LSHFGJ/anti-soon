import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePoCBuilder } from '../hooks/usePoCBuilder'
import type { PoCData } from '../types/poc'

describe('usePoCBuilder', () => {
  beforeEach(() => {
    // Reset state between tests
  })

  describe('initial state', () => {
    it('should have correct initial step', () => {
      const { result } = renderHook(() => usePoCBuilder())
      expect(result.current.activeStep).toBe(1)
    })

    it('should have empty initial target config', () => {
      const { result } = renderHook(() => usePoCBuilder())
      expect(result.current.targetConfig).toEqual({
        targetContract: '',
        chain: 'Sepolia',
        forkBlock: '',
        abiJson: ''
      })
    })

    it('should have empty initial conditions', () => {
      const { result } = renderHook(() => usePoCBuilder())
      expect(result.current.conditions).toEqual([])
    })

    it('should have empty initial transactions', () => {
      const { result } = renderHook(() => usePoCBuilder())
      expect(result.current.transactions).toEqual([])
    })

    it('should have default impact config', () => {
      const { result } = renderHook(() => usePoCBuilder())
      expect(result.current.impactConfig).toEqual({
        type: 'fundsDrained',
        estimatedLoss: '',
        description: ''
      })
    })
  })

  describe('step navigation', () => {
    it('should update active step with setActiveStep', () => {
      const { result } = renderHook(() => usePoCBuilder())
      
      act(() => {
        result.current.setActiveStep(3)
      })
      
      expect(result.current.activeStep).toBe(3)
    })

    it('should allow navigating to any step', () => {
      const { result } = renderHook(() => usePoCBuilder())
      
      for (let step = 1; step <= 5; step++) {
        act(() => {
          result.current.setActiveStep(step)
        })
        expect(result.current.activeStep).toBe(step)
      }
    })
  })

  describe('target config updates', () => {
    it('should update target contract address', () => {
      const { result } = renderHook(() => usePoCBuilder())
      
      act(() => {
        result.current.updateTargetConfig('targetContract', '0x1234567890123456789012345678901234567890')
      })
      
      expect(result.current.targetConfig.targetContract).toBe('0x1234567890123456789012345678901234567890')
    })

    it('should update chain', () => {
      const { result } = renderHook(() => usePoCBuilder())
      
      act(() => {
        result.current.updateTargetConfig('chain', 'Mainnet')
      })
      
      expect(result.current.targetConfig.chain).toBe('Mainnet')
    })

    it('should update fork block', () => {
      const { result } = renderHook(() => usePoCBuilder())
      
      act(() => {
        result.current.updateTargetConfig('forkBlock', '18500000')
      })
      
      expect(result.current.targetConfig.forkBlock).toBe('18500000')
    })

    it('should update ABI JSON', () => {
      const { result } = renderHook(() => usePoCBuilder())
      const abi = '[{"name":"test","type":"function"}]'
      
      act(() => {
        result.current.updateTargetConfig('abiJson', abi)
      })
      
      expect(result.current.targetConfig.abiJson).toBe(abi)
    })
  })

  describe('conditions management', () => {
    it('should add a condition', () => {
      const { result } = renderHook(() => usePoCBuilder())
      
      act(() => {
        result.current.addCondition()
      })
      
      expect(result.current.conditions).toHaveLength(1)
      expect(result.current.conditions[0].type).toBe('setBalance')
      expect(result.current.conditions[0].value).toBe('0')
    })

    it('should remove a condition', () => {
      const { result } = renderHook(() => usePoCBuilder())
      
      act(() => {
        result.current.addCondition()
      })
      
      const conditionId = result.current.conditions[0].id
      
      act(() => {
        result.current.removeCondition(conditionId)
      })
      
      expect(result.current.conditions).toHaveLength(0)
    })

    it('should update a condition', () => {
      const { result } = renderHook(() => usePoCBuilder())
      
      act(() => {
        result.current.addCondition()
      })
      
      const conditionId = result.current.conditions[0].id
      
      act(() => {
        result.current.updateCondition(conditionId, 'type', 'setTimestamp')
        result.current.updateCondition(conditionId, 'value', '1234567890')
      })
      
      expect(result.current.conditions[0].type).toBe('setTimestamp')
      expect(result.current.conditions[0].value).toBe('1234567890')
    })

    it('should add multiple conditions', () => {
      const { result } = renderHook(() => usePoCBuilder())
      
      act(() => {
        result.current.addCondition()
        result.current.addCondition()
        result.current.addCondition()
      })
      
      expect(result.current.conditions).toHaveLength(3)
    })
  })

  describe('transactions management', () => {
    it('should add a transaction with target contract as default', () => {
      const { result } = renderHook(() => usePoCBuilder())
      
      act(() => {
        result.current.updateTargetConfig('targetContract', '0xTargetContract')
      })
      
      act(() => {
        result.current.addTransaction()
      })
      
      expect(result.current.transactions).toHaveLength(1)
      expect(result.current.transactions[0].to).toBe('0xTargetContract')
      expect(result.current.transactions[0].value).toBe('0')
      expect(result.current.transactions[0].data).toBe('0x')
    })

    it('should remove a transaction', () => {
      const { result } = renderHook(() => usePoCBuilder())
      
      act(() => {
        result.current.addTransaction()
      })
      
      const txId = result.current.transactions[0].id
      
      act(() => {
        result.current.removeTransaction(txId)
      })
      
      expect(result.current.transactions).toHaveLength(0)
    })

    it('should update a transaction', () => {
      const { result } = renderHook(() => usePoCBuilder())
      
      act(() => {
        result.current.addTransaction()
      })
      
      const txId = result.current.transactions[0].id
      
      act(() => {
        result.current.updateTransaction(txId, 'to', '0xNewTarget')
        result.current.updateTransaction(txId, 'value', '1000000000000000000')
        result.current.updateTransaction(txId, 'data', '0xabcdef')
      })
      
      expect(result.current.transactions[0].to).toBe('0xNewTarget')
      expect(result.current.transactions[0].value).toBe('1000000000000000000')
      expect(result.current.transactions[0].data).toBe('0xabcdef')
    })
  })

  describe('impact config updates', () => {
    it('should update impact type', () => {
      const { result } = renderHook(() => usePoCBuilder())
      
      act(() => {
        result.current.updateImpactConfig('type', 'accessEscalation')
      })
      
      expect(result.current.impactConfig.type).toBe('accessEscalation')
    })

    it('should update estimated loss', () => {
      const { result } = renderHook(() => usePoCBuilder())
      
      act(() => {
        result.current.updateImpactConfig('estimatedLoss', '1000000000000000000000')
      })
      
      expect(result.current.impactConfig.estimatedLoss).toBe('1000000000000000000000')
    })

    it('should update description', () => {
      const { result } = renderHook(() => usePoCBuilder())
      
      act(() => {
        result.current.updateImpactConfig('description', 'Reentrancy vulnerability')
      })
      
      expect(result.current.impactConfig.description).toBe('Reentrancy vulnerability')
    })
  })

  describe('loadTemplate', () => {
    it('should load a complete template', () => {
      const { result } = renderHook(() => usePoCBuilder())
      
      const template: Partial<PoCData> = {
        target: '0xTemplateTarget',
        chain: 'Mainnet',
        forkBlock: 20000000,
        conditions: [
          { type: 'setBalance', value: '1000000000000000000', target: '0xAttacker' }
        ],
        transactions: [
          { to: '0xTarget', value: '0', data: '0x1234' }
        ],
        impact: {
          type: 'fundsDrained',
          estimatedLoss: '1000000000000000000000',
          description: 'Test impact'
        }
      }
      
      act(() => {
        result.current.loadTemplate(template)
      })
      
      expect(result.current.targetConfig.targetContract).toBe('0xTemplateTarget')
      expect(result.current.targetConfig.chain).toBe('Mainnet')
      expect(result.current.targetConfig.forkBlock).toBe('20000000')
      expect(result.current.conditions).toHaveLength(1)
      expect(result.current.transactions).toHaveLength(1)
      expect(result.current.impactConfig.type).toBe('fundsDrained')
      expect(result.current.impactConfig.description).toBe('Test impact')
    })

    it('should generate unique IDs for template conditions', () => {
      const { result } = renderHook(() => usePoCBuilder())
      
      const template: Partial<PoCData> = {
        conditions: [
          { type: 'setBalance', value: '100' },
          { type: 'setTimestamp', value: '1000' }
        ]
      }
      
      act(() => {
        result.current.loadTemplate(template)
      })
      
      const ids = result.current.conditions.map(c => c.id)
      expect(new Set(ids).size).toBe(2) // All IDs should be unique
    })

    it('should generate unique IDs for template transactions', () => {
      const { result } = renderHook(() => usePoCBuilder())
      
      const template: Partial<PoCData> = {
        transactions: [
          { to: '0x1', value: '0', data: '0x1' },
          { to: '0x2', value: '0', data: '0x2' }
        ]
      }
      
      act(() => {
        result.current.loadTemplate(template)
      })
      
      const ids = result.current.transactions.map(t => t.id)
      expect(new Set(ids).size).toBe(2) // All IDs should be unique
    })
  })

  describe('generatePoCJSON', () => {
    it('should generate valid JSON string', () => {
      const { result } = renderHook(() => usePoCBuilder())
      
      act(() => {
        result.current.updateTargetConfig('targetContract', '0xTarget')
        result.current.updateTargetConfig('chain', 'Sepolia')
        result.current.updateTargetConfig('forkBlock', '1000000')
      })
      
      const json = result.current.generatePoCJSON()
      
      expect(() => JSON.parse(json)).not.toThrow()
    })

    it('should include all configured data', () => {
      const { result } = renderHook(() => usePoCBuilder())
      
      act(() => {
        result.current.updateTargetConfig('targetContract', '0xTarget')
        result.current.updateTargetConfig('chain', 'Mainnet')
        result.current.updateTargetConfig('forkBlock', '20000000')
        result.current.addCondition()
        result.current.addTransaction()
        result.current.updateImpactConfig('description', 'Test vulnerability')
      })
      
      const conditionId = result.current.conditions[0]?.id
      if (conditionId) {
        act(() => {
          result.current.updateCondition(conditionId, 'value', '100')
        })
      }
      
      const json = result.current.generatePoCJSON()
      const parsed = JSON.parse(json)
      
      expect(parsed.target).toBe('0xTarget')
      expect(parsed.chain).toBe('Mainnet')
      expect(parsed.forkBlock).toBe(20000000)
      expect(parsed.conditions).toHaveLength(1)
      expect(parsed.transactions).toHaveLength(1)
      expect(parsed.impact.description).toBe('Test vulnerability')
      expect(parsed.metadata.generator).toBe('AntiSoon v1.0')
      expect(parsed.metadata.timestamp).toBeGreaterThan(0)
    })

    it('should strip IDs from conditions and transactions', () => {
      const { result } = renderHook(() => usePoCBuilder())
      
      act(() => {
        result.current.addCondition()
        result.current.addTransaction()
      })
      
      const json = result.current.generatePoCJSON()
      const parsed = JSON.parse(json)
      
      expect(parsed.conditions[0]).not.toHaveProperty('id')
      expect(parsed.transactions[0]).not.toHaveProperty('id')
    })

    it('should handle empty conditions and transactions', () => {
      const { result } = renderHook(() => usePoCBuilder())
      
      const json = result.current.generatePoCJSON()
      const parsed = JSON.parse(json)
      
      expect(parsed.conditions).toEqual([])
      expect(parsed.transactions).toEqual([])
    })
  })

  describe('complete flow simulation', () => {
    it('should support a complete PoC building flow', () => {
      const { result } = renderHook(() => usePoCBuilder())
      
      act(() => {
        result.current.updateTargetConfig('targetContract', '0xVulnerableContract')
        result.current.updateTargetConfig('chain', 'Mainnet')
        result.current.updateTargetConfig('forkBlock', '18500000')
        result.current.setActiveStep(2)
      })
      
      expect(result.current.activeStep).toBe(2)
      
      act(() => {
        result.current.addCondition()
      })
      
      const conditionId = result.current.conditions[0]?.id
      act(() => {
        if (conditionId) {
          result.current.updateCondition(conditionId, 'type', 'setBalance')
          result.current.updateCondition(conditionId, 'value', '1000000000000000000')
          result.current.updateCondition(conditionId, 'target', '0xAttacker')
        }
        result.current.setActiveStep(3)
      })
      
      expect(result.current.conditions).toHaveLength(1)
      expect(result.current.activeStep).toBe(3)
      
      act(() => {
        result.current.addTransaction()
      })
      
      const txId = result.current.transactions[0]?.id
      act(() => {
        if (txId) {
          result.current.updateTransaction(txId, 'data', '0xattackcalldata')
        }
        result.current.setActiveStep(4)
      })
      
      expect(result.current.transactions).toHaveLength(1)
      expect(result.current.activeStep).toBe(4)
      
      act(() => {
        result.current.updateImpactConfig('type', 'fundsDrained')
        result.current.updateImpactConfig('estimatedLoss', '1000000000000000000000')
        result.current.updateImpactConfig('description', 'Reentrancy attack drains funds')
        result.current.setActiveStep(5)
      })
      
      expect(result.current.impactConfig.type).toBe('fundsDrained')
      expect(result.current.activeStep).toBe(5)
      
      const json = result.current.generatePoCJSON()
      const parsed = JSON.parse(json)
      
      expect(parsed.target).toBe('0xVulnerableContract')
      expect(parsed.chain).toBe('Mainnet')
      expect(parsed.forkBlock).toBe(18500000)
      expect(parsed.conditions).toHaveLength(1)
      expect(parsed.transactions).toHaveLength(1)
      expect(parsed.impact.type).toBe('fundsDrained')
    })
  })
})
