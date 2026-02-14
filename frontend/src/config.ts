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
