import { sepolia } from 'viem/chains'

export const BOUNTY_HUB_ADDRESS = "0x82c85B0A96633A887D9fD7Fb575fA2339fDb7582" as const

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
