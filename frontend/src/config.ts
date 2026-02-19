import { sepolia } from 'viem/chains'

export const BOUNTY_HUB_ADDRESS = "0x7f66d83C0c920CAFA3773fFCd2eE802340a84fb9" as const

// V1 ABI - kept for backward compatibility
export const BOUNTY_HUB_ABI = [
  {
    name: "submitPoC",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_projectId", type: "uint256" },
      { name: "_pocHash", type: "bytes32" },
      { name: "_pocURI", type: "string" }
    ],
    outputs: [{ name: "submissionId", type: "uint256" }]
  },
  {
    name: "registerProject",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "_targetContract", type: "address" },
      { name: "_maxPayoutPerBug", type: "uint256" },
      { name: "_forkBlock", type: "uint256" }
    ],
    outputs: [{ name: "projectId", type: "uint256" }]
  }
] as const

// V2 ABI - commit-reveal with encryption
export const BOUNTY_HUB_V2_ABI = [
  // V1 functions (backward compatible)
  {
    name: "submitPoC",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_projectId", type: "uint256" },
      { name: "_pocHash", type: "bytes32" },
      { name: "_pocURI", type: "string" }
    ],
    outputs: [{ name: "submissionId", type: "uint256" }]
  },
  // V2: Register project with full rules
  {
    name: "registerProjectV2",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "_targetContract", type: "address" },
      { name: "_maxPayoutPerBug", type: "uint256" },
      { name: "_forkBlock", type: "uint256" },
      { name: "_mode", type: "uint8" },
      { name: "_commitDeadline", type: "uint256" },
      { name: "_revealDeadline", type: "uint256" },
      { name: "_disputeWindow", type: "uint256" },
      {
        name: "_rules",
        type: "tuple",
        components: [
          { name: "maxAttackerSeedWei", type: "uint256" },
          { name: "maxWarpSeconds", type: "uint256" },
          { name: "allowImpersonation", type: "bool" },
          {
            name: "thresholds",
            type: "tuple",
            components: [
              { name: "criticalDrainWei", type: "uint256" },
              { name: "highDrainWei", type: "uint256" },
              { name: "mediumDrainWei", type: "uint256" },
              { name: "lowDrainWei", type: "uint256" }
            ]
          }
        ]
      }
    ],
    outputs: [{ name: "projectId", type: "uint256" }]
  },
  // V2: Commit encrypted PoC (Phase 1)
  {
    name: "commitPoC",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_projectId", type: "uint256" },
      { name: "_commitHash", type: "bytes32" },
      { name: "_cipherURI", type: "string" }
    ],
    outputs: [{ name: "submissionId", type: "uint256" }]
  },
  // V2: Reveal decryption key (Phase 2)
  {
    name: "revealPoC",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_submissionId", type: "uint256" },
      { name: "_decryptionKey", type: "bytes32" },
      { name: "_salt", type: "bytes32" }
    ],
    outputs: []
  },
  {
    name: "nextProjectId",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    name: "nextSubmissionId",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }]
  },
  // Dispute functions
  {
    name: "challenge",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "_submissionId", type: "uint256" }
    ],
    outputs: []
  },
  {
    name: "resolveDispute",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_submissionId", type: "uint256" },
      { name: "_overturn", type: "bool" }
    ],
    outputs: []
  },
  {
    name: "finalize",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_submissionId", type: "uint256" }
    ],
    outputs: []
  },
  // View functions
  {
    name: "projectRules",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [
      { name: "maxAttackerSeedWei", type: "uint256" },
      { name: "maxWarpSeconds", type: "uint256" },
      { name: "allowImpersonation", type: "bool" },
      {
        name: "thresholds",
        type: "tuple",
        components: [
          { name: "criticalDrainWei", type: "uint256" },
          { name: "highDrainWei", type: "uint256" },
          { name: "mediumDrainWei", type: "uint256" },
          { name: "lowDrainWei", type: "uint256" }
        ]
      }
    ]
  },
  // Events
  {
    name: "DisputeResolved",
    type: "event",
    inputs: [
      { name: "submissionId", type: "uint256", indexed: true },
      { name: "overturned", type: "bool", indexed: false }
    ]
  },
  {
    name: "projects",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [
      { name: "owner", type: "address" },
      { name: "bountyPool", type: "uint256" },
      { name: "maxPayoutPerBug", type: "uint256" },
      { name: "targetContract", type: "address" },
      { name: "forkBlock", type: "uint256" },
      { name: "active", type: "bool" },
      { name: "mode", type: "uint8" },
      { name: "commitDeadline", type: "uint256" },
      { name: "revealDeadline", type: "uint256" },
      { name: "disputeWindow", type: "uint256" },
      { name: "rulesHash", type: "bytes32" },
      { name: "projectPublicKey", type: "bytes" }
    ]
  },
  {
    name: "submissions",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [
      { name: "auditor", type: "address" },
      { name: "projectId", type: "uint256" },
      { name: "commitHash", type: "bytes32" },
      { name: "cipherURI", type: "string" },
      { name: "decryptionKey", type: "bytes32" },
      { name: "salt", type: "bytes32" },
      { name: "commitTimestamp", type: "uint256" },
      { name: "revealTimestamp", type: "uint256" },
      { name: "status", type: "uint8" },
      { name: "drainAmountWei", type: "uint256" },
      { name: "severity", type: "uint8" },
      { name: "payoutAmount", type: "uint256" },
      { name: "disputeDeadline", type: "uint256" },
      { name: "challenged", type: "bool" },
      { name: "challenger", type: "address" },
      { name: "challengeBond", type: "uint256" }
    ]
  },
  // Events
  {
    name: "ProjectRegisteredV2",
    type: "event",
    inputs: [
      { name: "projectId", type: "uint256", indexed: true },
      { name: "owner", type: "address", indexed: true },
      { name: "mode", type: "uint8", indexed: false }
    ]
  },
  {
    name: "PoCCommitted",
    type: "event",
    inputs: [
      { name: "submissionId", type: "uint256", indexed: true },
      { name: "projectId", type: "uint256", indexed: true },
      { name: "auditor", type: "address", indexed: true },
      { name: "commitHash", type: "bytes32", indexed: false }
    ]
  },
  {
    name: "PoCRevealed",
    type: "event",
    inputs: [
      { name: "submissionId", type: "uint256", indexed: true },
      { name: "decryptionKey", type: "bytes32", indexed: false }
    ]
  },
  {
    name: "PoCVerified",
    type: "event",
    inputs: [
      { name: "submissionId", type: "uint256", indexed: true },
      { name: "isValid", type: "bool", indexed: false },
      { name: "drainAmountWei", type: "uint256", indexed: false },
      { name: "severity", type: "uint8", indexed: false }
    ]
  },
  {
    name: "BountyPaid",
    type: "event",
    inputs: [
      { name: "submissionId", type: "uint256", indexed: true },
      { name: "auditor", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false }
    ]
  },
  {
    name: "DisputeRaised",
    type: "event",
    inputs: [
      { name: "submissionId", type: "uint256", indexed: true },
      { name: "challenger", type: "address", indexed: true },
      { name: "bond", type: "uint256", indexed: false }
    ]
  },
  {
    name: "BountyFinalized",
    type: "event",
    inputs: [
      { name: "submissionId", type: "uint256", indexed: true }
    ]
  },
  {
    name: "updateProjectPublicKey",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_projectId", type: "uint256" },
      { name: "_publicKey", type: "bytes" }
    ],
    outputs: []
  },
  {
    name: "ProjectPublicKeyUpdated",
    type: "event",
    inputs: [
      { name: "projectId", type: "uint256", indexed: true },
      { name: "publicKey", type: "bytes", indexed: false }
    ]
  }
] as const

export const CHAIN = sepolia

export const DEMO_PROJECTS = [
  {
    id: 'dummy-vault-001',
    name: 'DummyVault',
    description: 'Vulnerable vault contract for AntiSoon demo - contains reentrancy, access control, and price manipulation vulnerabilities',
    prizePool: '10,000 USDC',
    targetContract: '0xDummyVault',
    chain: 'Anvil Local',
    forkBlock: '0',
    logo: 'DV',
    auditUrl: '',
    repoUrl: 'demo-projects/dummy-vault',
    nSLOC: 150,
    highFindings: 4,
    status: 'active'
  },
  {
    id: 'panoptic-next-core-001',
    name: 'Panoptic Next Core',
    description: 'DeFi options protocol - transforms Uniswap LP positions into onchain options',
    prizePool: '56,000 USDC',
    targetContract: '0xPanopticPool',
    chain: 'Mainnet',
    forkBlock: '18963715',
    logo: 'P',
    auditUrl: 'https://code4rena.com/audits/2025-12-panoptic-next-core',
    repoUrl: 'https://github.com/code-423n4/2025-12-panoptic',
    nSLOC: 6356,
    highFindings: 5,
    status: 'report_in_progress'
  }
]

export const H01_POC_TEMPLATE = {
  target: '0xPanopticPool',
  chain: 'Mainnet',
  forkBlock: 18963715,
  conditions: [
    {
      id: 'cond-1',
      type: 'fork',
      network: 'mainnet',
      blockNumber: 18963715
    },
    {
      id: 'cond-2',
      type: 'deploy',
      contract: 'PanopticPool',
      constructorArgs: []
    }
  ],
  transactions: [
    {
      id: 'tx-1',
      to: '0xPanopticPool',
      value: '0',
      data: '0x...'
    }
  ],
  impact: {
    type: 'protocol_loss',
    estimatedLoss: '0',
    description: 'H-01: POC pending audit report publication. Check demo-data/pocs/H-01.t.sol for template.'
  }
}

export const DUMMYVAULT_POC_TEMPLATES = {
  reentrancy: {
    name: 'Reentrancy Attack',
    severity: 'HIGH' as const,
    description: 'Withdraw function updates state after transfer, allowing reentrancy',
    template: {
      target: 'DummyVault',
      chain: 31337,
      forkBlock: 0,
      setup: [
        { type: 'deploy', contract: 'MockERC20', value: '0' },
        { type: 'deploy', contract: 'DummyVault', value: '0' },
        { type: 'setBalance', address: '0xAttacker', value: '1000000000000000000000' }
      ],
      transactions: [
        { to: 'DummyVault', data: 'deposit(1000000000000000000000)', value: '0' },
        { to: 'DummyVault', data: 'withdraw(1000000000000000000000)', value: '0' }
      ],
      expectedImpact: {
        type: 'fundsDrained',
        estimatedLoss: '1000000000000000000000',
        description: 'Reentrancy allows draining funds before state update'
      }
    }
  },
  accessControl: {
    name: 'Access Control Bypass',
    severity: 'HIGH' as const,
    description: 'updatePrice() has no access control, anyone can manipulate oracle',
    template: {
      target: 'DummyVault',
      chain: 31337,
      forkBlock: 0,
      setup: [
        { type: 'deploy', contract: 'DummyVault', value: '0' }
      ],
      transactions: [
        { to: 'DummyVault', data: 'updatePrice(1)', value: '0' }
      ],
      expectedImpact: {
        type: 'stateCorruption',
        estimatedLoss: '1000000000000000000000000',
        description: 'Price can be manipulated to steal funds via inflated share value'
      }
    }
  },
  emergencyWithdraw: {
    name: 'Emergency Withdraw Theft',
    severity: 'HIGH' as const,
    description: 'emergencyWithdraw() has no access control, anyone can drain all funds',
    template: {
      target: 'DummyVault',
      chain: 31337,
      forkBlock: 0,
      setup: [
        { type: 'deploy', contract: 'MockERC20', value: '0' },
        { type: 'deploy', contract: 'DummyVault', value: '0' },
        { type: 'deposit', address: '0xVictim', value: '1000000000000000000000' }
      ],
      transactions: [
        { to: 'DummyVault', data: 'emergencyWithdraw()', value: '0' }
      ],
      expectedImpact: {
        type: 'fundsDrained',
        estimatedLoss: '1000000000000000000000',
        description: 'All vault funds stolen by unauthorized caller'
      }
    }
  },
  priceManipulation: {
    name: 'Oracle Price Manipulation',
    severity: 'HIGH' as const,
    description: 'Attacker can inflate price to drain more funds than deposited',
    template: {
      target: 'DummyVault',
      chain: 31337,
      forkBlock: 0,
      setup: [
        { type: 'deploy', contract: 'DummyVault', value: '0' },
        { type: 'deposit', address: '0xVictim', value: '1000000000000000000000' }
      ],
      transactions: [
        { to: 'DummyVault', data: 'updatePrice(1000000000000000000000)', value: '0' },
        { to: 'DummyVault', data: 'getShareValue(0xVictim)', value: '0' }
      ],
      expectedImpact: {
        type: 'stateCorruption',
        estimatedLoss: '999000000000000000000000',
        description: 'Share value inflated 1000x, enabling massive theft'
      }
    }
  }
}
