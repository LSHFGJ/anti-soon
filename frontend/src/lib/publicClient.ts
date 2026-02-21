import { createPublicClient, http } from 'viem'
import { CHAIN } from '../config'
import { resolveRpcUrl } from './rpcConfig'

export const publicClient = createPublicClient({
  chain: CHAIN,
  transport: http(resolveRpcUrl()),
})
