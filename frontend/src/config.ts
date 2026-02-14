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
    id: 'sequence-demo-001',
    name: 'Sequence Wallet',
    description: 'Modular crypto infrastructure stack for account abstraction',
    prizePool: '73,000 USDC',
    targetContract: '0x539u3nceW4113tC0n7r4c7D3m0', // Mock address for demo
    chain: 'Sepolia',
    forkBlock: '5824125', // Arbitrary block for demo
    logo: 'S'
  }
]

export const H01_POC_TEMPLATE = {
  target: '0x539u3nceW4113tC0n7r4c7D3m0',
  chain: 'Sepolia',
  forkBlock: 5824125,
  conditions: [
    {
      id: 'cond-1',
      type: 'setBalance',
      target: '0xAttackerAddress',
      value: '1000000000000000000' // 1 ETH
    }
  ],
  transactions: [
    {
      id: 'tx-1',
      to: '0x539u3nceW4113tC0n7r4c7D3m0',
      value: '0',
      data: '0xbad519...' // Mock calldata for checkpointer bypass
    }
  ],
  impact: {
    type: 'accessEscalation',
    estimatedLoss: '0',
    description: 'H-01: Chained signature bypasses checkpointer validation allowing unauthorized transaction execution.'
  }
}
