import { createPublicClient, http } from 'viem'
import type { AbiEvent, BlockNumber, BlockTag, GetLogsParameters, GetLogsReturnType } from 'viem'
import { CHAIN } from '../config'
import { resolveRpcUrl, resolveRpcUrls } from './rpcConfig'

const RPC_READ_TIMEOUT_MS = 4_000

type PublicReadClient = ReturnType<typeof createPublicClient>
type ReadContractParameters = Parameters<PublicReadClient['readContract']>[0]
type MulticallParameters = Parameters<PublicReadClient['multicall']>[0]
type GetBalanceParameters = Parameters<PublicReadClient['getBalance']>[0]
type GetCodeParameters = Parameters<PublicReadClient['getCode']>[0]

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = globalThis.setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`))
    }, timeoutMs)

    promise
      .then((value) => {
        globalThis.clearTimeout(timer)
        resolve(value)
      })
      .catch((error) => {
        globalThis.clearTimeout(timer)
        reject(error)
      })
  })
}

const configuredRpcUrls = resolveRpcUrls()
const rpcUrls = configuredRpcUrls.length > 0 ? configuredRpcUrls : [resolveRpcUrl()]

export const publicClients = rpcUrls.map((rpcUrl) => createPublicClient({
  chain: CHAIN,
  transport: http(rpcUrl),
}))

export const publicClient = publicClients[0]

export async function readWithRpcFallback<T>(
  operation: (client: PublicReadClient) => Promise<T>,
  timeoutMs = RPC_READ_TIMEOUT_MS,
): Promise<T> {
  try {
    return await Promise.any(
      publicClients.map((client, index) => withTimeout(
        Promise.resolve().then(() => operation(client)),
        timeoutMs,
        `RPC[${index + 1}]`,
      )),
    )
  } catch (error) {
    const errors = error instanceof AggregateError ? error.errors : [error]
    const reason = errors.map(getErrorMessage).join(' | ')
    throw new Error(`ALL_RPC_READS_FAILED: ${reason}`)
  }
}

export function readContractWithRpcFallback(parameters: ReadContractParameters) {
  return readWithRpcFallback((client) => client.readContract(parameters))
}

export function multicallWithRpcFallback(parameters: MulticallParameters) {
  return readWithRpcFallback((client) => client.multicall(parameters))
}

export function getLogsWithRpcFallback<
  const TAbiEvent extends AbiEvent | undefined = undefined,
  const TAbiEvents extends readonly AbiEvent[] | readonly unknown[] | undefined = TAbiEvent extends AbiEvent ? [TAbiEvent] : undefined,
  TStrict extends boolean | undefined = undefined,
  TFromBlock extends BlockNumber | BlockTag | undefined = undefined,
  TToBlock extends BlockNumber | BlockTag | undefined = undefined,
>(parameters?: GetLogsParameters<TAbiEvent, TAbiEvents, TStrict, TFromBlock, TToBlock>) {
  return readWithRpcFallback((client) => client.getLogs(parameters)) as Promise<
    GetLogsReturnType<TAbiEvent, TAbiEvents, TStrict, TFromBlock, TToBlock>
  >
}

export function getBlockNumberWithRpcFallback() {
  return readWithRpcFallback((client) => client.getBlockNumber())
}

export function getBalanceWithRpcFallback(parameters: GetBalanceParameters) {
  return readWithRpcFallback((client) => client.getBalance(parameters))
}

export function getCodeWithRpcFallback(parameters: GetCodeParameters) {
  return readWithRpcFallback((client) => client.getCode(parameters))
}
