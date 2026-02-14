import React, { useState } from 'react'

interface FieldGuide {
  field: string
  description: string
  example?: string
}

interface StepGuidanceProps {
  title: string
  description: string
  fields?: FieldGuide[]
}

export const StepGuidance: React.FC<StepGuidanceProps> = React.memo(({ 
  title, 
  description, 
  fields 
}) => {
  const [expandedField, setExpandedField] = useState<string | null>(null)

  return (
    <div style={{ 
      marginBottom: '1.5rem', 
      padding: '1rem', 
      background: 'rgba(0, 255, 136, 0.03)', 
      border: '1px solid var(--color-primary-dim)',
      borderRadius: '4px'
    }}>
      <h4 style={{ 
        color: 'var(--color-primary)', 
        marginBottom: '0.5rem', 
        fontFamily: 'var(--font-mono)',
        fontSize: '0.9rem'
      }}>
        {title}
      </h4>
      <p style={{ 
        color: 'var(--color-text-dim)', 
        fontSize: '0.85rem', 
        lineHeight: 1.6,
        marginBottom: fields ? '1rem' : 0
      }}>
        {description}
      </p>
      
      {fields && fields.length > 0 && (
        <div style={{ marginTop: '0.5rem' }}>
          <div style={{ 
            fontSize: '0.75rem', 
            color: 'var(--color-text-dim)', 
            marginBottom: '0.5rem',
            textTransform: 'uppercase',
            letterSpacing: '0.1em'
          }}>
            Field Guide
          </div>
          {fields.map((f, i) => (
            <div 
              key={i}
              style={{ 
                marginBottom: '0.5rem',
                cursor: 'pointer'
              }}
              onClick={() => setExpandedField(expandedField === f.field ? null : f.field)}
            >
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '0.5rem',
                color: expandedField === f.field ? 'var(--color-primary)' : 'var(--color-text)',
                fontSize: '0.85rem'
              }}>
                <span style={{ 
                  color: 'var(--color-secondary)', 
                  fontFamily: 'var(--font-mono)'
                }}>
                  {expandedField === f.field ? '▼' : '▶'}
                </span>
                <code style={{ 
                  background: 'rgba(255,255,255,0.1)', 
                  padding: '0.1rem 0.3rem',
                  borderRadius: '2px',
                  fontSize: '0.8rem'
                }}>
                  {f.field}
                </code>
              </div>
              {expandedField === f.field && (
                <div style={{ 
                  marginLeft: '1.5rem', 
                  marginTop: '0.5rem',
                  padding: '0.5rem',
                  background: 'rgba(0,0,0,0.3)',
                  borderRadius: '2px',
                  fontSize: '0.8rem',
                  animation: 'fadeIn 0.2s ease'
                }}>
                  <div style={{ color: 'var(--color-text-dim)', marginBottom: f.example ? '0.5rem' : 0 }}>
                    {f.description}
                  </div>
                  {f.example && (
                    <div style={{ 
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--color-secondary)',
                      background: 'rgba(0,255,136,0.05)',
                      padding: '0.5rem',
                      marginTop: '0.5rem',
                      borderRadius: '2px',
                      wordBreak: 'break-all'
                    }}>
                      Example: {f.example}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
})

StepGuidance.displayName = 'StepGuidance'

export const STEP_GUIDES = {
  target: {
    title: '// STEP_01: TARGET',
    description: 'Specify the vulnerable contract and network configuration for the PoC execution environment.',
    fields: [
      { 
        field: 'targetContract', 
        description: 'The Ethereum address of the vulnerable contract you want to exploit.',
        example: '0x1234567890abcdef1234567890abcdef12345678'
      },
      { 
        field: 'chain', 
        description: 'The blockchain network where the contract is deployed.',
        example: 'Ethereum Mainnet, Sepolia Testnet'
      },
      { 
        field: 'forkBlock', 
        description: 'The block number to fork from. Use the block before the exploit occurred for accurate reproduction.',
        example: '18500000'
      },
      { 
        field: 'abiJson', 
        description: 'The contract ABI in JSON format. Required to encode function calls.',
        example: '[{"name":"transfer","inputs":[{"type":"address"},{"type":"uint256"}]}]'
      }
    ]
  },
  conditions: {
    title: '// STEP_02: CONDITIONS',
    description: 'Set up the initial blockchain state before executing the attack. This recreates the vulnerable environment.',
    fields: [
      { 
        field: 'setBalance', 
        description: 'Set ETH balance for an address. Useful for giving attacker funds.',
        example: 'Address: 0xAttacker, Value: 1000000000000000000 (1 ETH)'
      },
      { 
        field: 'setTimestamp', 
        description: 'Set the block timestamp. Useful for time-based vulnerabilities.',
        example: 'Value: 1700000000'
      },
      { 
        field: 'setStorage', 
        description: 'Directly modify a storage slot. Advanced: bypasses contract logic.',
        example: 'Contract: 0xTarget, Slot: 0x0, Value: 0x1234'
      }
    ]
  },
  transactions: {
    title: '// STEP_03: ATTACK VECTOR',
    description: 'Define the sequence of transactions that execute the exploit. Each transaction will be executed in order.',
    fields: [
      { 
        field: 'to', 
        description: 'Target address for the transaction (usually the vulnerable contract).',
        example: '0xTargetContract'
      },
      { 
        field: 'value', 
        description: 'Amount of ETH to send with the transaction (in wei).',
        example: '0 for function calls, 1000000000000000000 for 1 ETH'
      },
      { 
        field: 'data', 
        description: 'ABI-encoded calldata. Use the function selector + encoded args.',
        example: '0xa9059cbb000000000000000000000000attacker00000000000000000000000000000000000000000000000000000000000000dead'
      }
    ]
  },
  impact: {
    title: '// STEP_04: IMPACT',
    description: 'Describe the expected impact of the exploit. This helps validators verify the vulnerability.',
    fields: [
      { 
        field: 'type', 
        description: 'Category of the vulnerability impact.',
        example: 'fundsDrained, accessEscalation, stateCorruption'
      },
      { 
        field: 'estimatedLoss', 
        description: 'Estimated value at risk in wei.',
        example: '1000000000000000000000 (1000 ETH)'
      },
      { 
        field: 'description', 
        description: 'Human-readable explanation of the vulnerability and its impact.',
        example: 'Reentrancy allows attacker to drain all user deposits'
      }
    ]
  },
  review: {
    title: '// STEP_05: REVIEW & SUBMIT',
    description: 'Review your PoC configuration and submit to the verification network. The PoC will be validated by decentralized nodes.',
    fields: []
  }
}