import { parseAbiItem, type Address, type GetLogsReturnType } from 'viem'
import { BOUNTY_HUB_ADDRESS } from '../config'
import { discoverDeploymentBlockWithFallback, getLogsWithRangeFallback } from './chainLogs'
import { getBlockNumberWithRpcFallback, getLogsWithRpcFallback } from './publicClient'

const POC_COMMITTED_EVENT = parseAbiItem('event PoCCommitted(uint256 indexed submissionId, uint256 indexed projectId, address indexed auditor, bytes32 commitHash)')
type PoCCommittedLog = GetLogsReturnType<typeof POC_COMMITTED_EVENT, [typeof POC_COMMITTED_EVENT], true>[number]

export async function readSubmissionCommitTxHash(submissionId: bigint): Promise<`0x${string}` | undefined> {
  const logs = await getLogsWithRangeFallback<PoCCommittedLog>({
    fetchLogs: (range) => getLogsWithRpcFallback({
      address: BOUNTY_HUB_ADDRESS,
      event: POC_COMMITTED_EVENT,
      strict: true,
      args: { submissionId },
      ...(range ?? {}),
      toBlock: range?.toBlock ?? 'latest',
    }) as Promise<PoCCommittedLog[]>,
    getLatestBlock: () => getBlockNumberWithRpcFallback(),
    getStartBlock: async (latestBlock) => discoverDeploymentBlockWithFallback(BOUNTY_HUB_ADDRESS, latestBlock),
  })

  return logs.at(-1)?.transactionHash
}

export function isSameAddress(left: Address, right: Address): boolean {
  return left.toLowerCase() === right.toLowerCase()
}
