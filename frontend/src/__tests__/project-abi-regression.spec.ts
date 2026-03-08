import { describe, expect, it } from 'vitest'
import { decodeFunctionResult, encodeFunctionResult, parseAbi } from 'viem'
import { BOUNTY_HUB_PROJECTS_V4_ABI } from '../config'

const PROJECTS_ABI = parseAbi([
  'function projects(uint256) view returns ((address owner,uint256 bountyPool,uint256 maxPayoutPerBug,address targetContract,uint256 forkBlock,bool active,uint8 mode,uint256 commitDeadline,uint256 revealDeadline,uint256 disputeWindow,uint256 juryWindow,uint256 adjudicationWindow,bytes32 rulesHash,uint8 vnetStatus,string vnetRpcUrl,bytes32 baseSnapshotId,uint256 vnetCreatedAt,string repoUrl) project)',
])

describe('BountyHub project ABI regression', () => {
  it('decodes the latest Project tuple including jury and adjudication windows', () => {
    const encoded = encodeFunctionResult({
      abi: PROJECTS_ABI,
      functionName: 'projects',
      result: {
        owner: '0xC1A97C6a4030a2089e1D9dA771De552bd67234a3',
        bountyPool: 1000000000000000n,
        maxPayoutPerBug: 500000000000000n,
        targetContract: '0x3fBd5ab0F3FD234A40923ae7986f45acB9d4A3cf',
        forkBlock: 0n,
        active: true,
        mode: 0,
        commitDeadline: 0n,
        revealDeadline: 0n,
        disputeWindow: 0n,
        juryWindow: 3600n,
        adjudicationWindow: 3600n,
        rulesHash: '0x209301aedf583e01b472aa65befa47d1e8d56f8207ce75328ae45cb821a85b34',
        vnetStatus: 1,
        vnetRpcUrl: '',
        baseSnapshotId: '0x0000000000000000000000000000000000000000000000000000000000000000',
        vnetCreatedAt: 0n,
        repoUrl: '',
      },
    })

    const decoded = decodeFunctionResult({
      abi: BOUNTY_HUB_PROJECTS_V4_ABI,
      functionName: 'projects',
      data: encoded,
    }) as Record<string, unknown>

    expect(decoded.juryWindow).toBe(3600n)
    expect(decoded.adjudicationWindow).toBe(3600n)
    expect(decoded.rulesHash).toBe(
      '0x209301aedf583e01b472aa65befa47d1e8d56f8207ce75328ae45cb821a85b34',
    )
    expect(decoded.vnetStatus).toBe(1)
  })
})
