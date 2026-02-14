import { useState, useCallback } from 'react'
import type { Condition, Transaction, ImpactType, TargetConfig, ImpactConfig, PoCData } from '../types/poc'

export const usePoCBuilder = () => {
  const [activeStep, setActiveStep] = useState(1)
  
  const [targetConfig, setTargetConfig] = useState<TargetConfig>({
    targetContract: '',
    chain: 'Sepolia',
    forkBlock: '',
    abiJson: ''
  })
  
  const [conditions, setConditions] = useState<Condition[]>([])
  
  const [transactions, setTransactions] = useState<Transaction[]>([])
  
  const [impactConfig, setImpactConfig] = useState<ImpactConfig>({
    type: 'fundsDrained',
    estimatedLoss: '',
    description: ''
  })

  const updateTargetConfig = useCallback((field: keyof TargetConfig, value: string) => {
    setTargetConfig(prev => ({ ...prev, [field]: value }))
  }, [])

  const addCondition = useCallback(() => {
    setConditions(prev => [...prev, { id: crypto.randomUUID(), type: 'setBalance', value: '0' }])
  }, [])

  const removeCondition = useCallback((id: string) => {
    setConditions(prev => prev.filter(c => c.id !== id))
  }, [])

  const updateCondition = useCallback((id: string, field: keyof Condition, val: string) => {
    setConditions(prev => prev.map(c => c.id === id ? { ...c, [field]: val } : c))
  }, [])

  const addTransaction = useCallback(() => {
    setTransactions(prev => [...prev, { id: crypto.randomUUID(), to: targetConfig.targetContract, value: '0', data: '0x' }])
  }, [targetConfig.targetContract])

  const removeTransaction = useCallback((id: string) => {
    setTransactions(prev => prev.filter(t => t.id !== id))
  }, [])

  const updateTransaction = useCallback((id: string, field: keyof Transaction, val: string) => {
    setTransactions(prev => prev.map(t => t.id === id ? { ...t, [field]: val } : t))
  }, [])

  const updateImpactConfig = useCallback((field: keyof ImpactConfig, value: string | ImpactType) => {
    setImpactConfig(prev => ({ ...prev, [field]: value }))
  }, [])

  const loadTemplate = useCallback((template: Partial<PoCData>) => {
    if (template.target) updateTargetConfig('targetContract', template.target)
    if (template.chain) updateTargetConfig('chain', template.chain)
    if (template.forkBlock) updateTargetConfig('forkBlock', template.forkBlock.toString())
    
    if (template.conditions) {
        setConditions(template.conditions.map(c => ({ ...c, id: crypto.randomUUID() })))
    }
    
    if (template.transactions) {
        setTransactions(template.transactions.map(t => ({ ...t, id: crypto.randomUUID() })))
    }

    if (template.impact) {
        setImpactConfig(template.impact)
    }
  }, [updateTargetConfig])

  const generatePoCJSON = useCallback((): string => {
    const poc: PoCData = {
      target: targetConfig.targetContract,
      chain: targetConfig.chain,
      forkBlock: parseInt(targetConfig.forkBlock) || 0,
      conditions: conditions.map(({ id, ...rest }) => rest),
      transactions: transactions.map(({ id, ...rest }) => rest),
      impact: impactConfig,
      metadata: {
        generator: "AntiSoon v1.0",
        timestamp: Date.now()
      }
    }
    return JSON.stringify(poc, null, 2)
  }, [targetConfig, conditions, transactions, impactConfig])

  return {
    activeStep,
    setActiveStep,
    targetConfig,
    updateTargetConfig,
    conditions,
    addCondition,
    removeCondition,
    updateCondition,
    transactions,
    addTransaction,
    removeTransaction,
    updateTransaction,
    impactConfig,
    updateImpactConfig,
    loadTemplate,
    generatePoCJSON
  }
}
