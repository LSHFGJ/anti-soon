import type { Address } from 'viem'
import type { Project } from '../types'

export interface ProjectV4OnChain {
  owner: Address
  bountyPool: bigint
  maxPayoutPerBug: bigint
  targetContract: Address
  forkBlock: bigint
  active: boolean
  mode: number
  commitDeadline: bigint
  revealDeadline: bigint
  disputeWindow: bigint
  rulesHash: `0x${string}`
  vnetStatus: number
  vnetRpcUrl: string
  baseSnapshotId: `0x${string}`
  vnetCreatedAt: bigint
  repoUrl: string
}

export function mapProjectTupleV4(projectId: bigint, data: ProjectV4OnChain): Project {
  return {
    id: projectId,
    owner: data.owner,
    bountyPool: data.bountyPool,
    maxPayoutPerBug: data.maxPayoutPerBug,
    targetContract: data.targetContract,
    forkBlock: data.forkBlock,
    active: data.active,
    mode: data.mode,
    commitDeadline: data.commitDeadline,
    revealDeadline: data.revealDeadline,
    disputeWindow: data.disputeWindow,
    rulesHash: data.rulesHash,
    vnetStatus: data.vnetStatus,
    vnetRpcUrl: data.vnetRpcUrl,
    baseSnapshotId: data.baseSnapshotId,
    vnetCreatedAt: data.vnetCreatedAt,
    repoUrl: data.repoUrl,
  }
}
