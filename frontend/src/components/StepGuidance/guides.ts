export const STEP_GUIDES = {
  target: {
    title: '// STEP_01: TARGET',
    description: 'Choose the project context and then select the deployed contract you want the PoC to target.',
    fields: [
      {
        field: 'targetProject',
        description: 'Pick the explorer project whose deployment context should back this PoC run.',
        example: '#42 · 0x1234...beef · Sepolia'
      },
      {
        field: 'targetContract',
        description: 'Select a deployed contract from the chosen project instead of entering an address manually.',
        example: '0x1234567890abcdef1234567890abcdef12345678'
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
        field: 'description',
        description: 'Optional human-readable explanation of the vulnerability and its impact.',
        example: 'Reentrancy allows attacker to drain all user deposits'
      }
    ]
  },
  review: {
    title: '// STEP_05: REVIEW & SUBMIT',
    description: 'Review your PoC and commit it on Sepolia. Track verification later.',
    fields: []
  }
} as const
