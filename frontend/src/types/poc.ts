export type ConditionType = 'setBalance' | 'setTimestamp' | 'setStorage'
export type ImpactType = 'fundsDrained' | 'accessEscalation' | 'stateCorruption' | 'other'

export interface Condition {
  id: string
  type: ConditionType
  target?: string
  value: string
  slot?: string
}

export interface Transaction {
  id: string
  to: string
  value: string
  data: string
  functionName?: string
  args?: string
}

export interface TargetConfig {
  targetContract: string
  chain: string
  forkBlock: string
  abiJson: string
}

export interface ImpactConfig {
  type: ImpactType
  estimatedLoss: string
  description: string
}

export interface PoCData {
  target: string
  chain: string
  forkBlock: number
  conditions: Omit<Condition, 'id'>[]
  transactions: Omit<Transaction, 'id'>[]
  impact: ImpactConfig
  metadata: {
    generator: string
    timestamp: number
  }
}
