import { CHAIN } from '../config'

const FALLBACK_EXPLORER_BASE_URL = 'https://sepolia.etherscan.io'

function getExplorerBaseUrl(): string {
  return CHAIN.blockExplorers?.default.url ?? FALLBACK_EXPLORER_BASE_URL
}

export function explorerAddressUrl(address: string): string {
  return `${getExplorerBaseUrl()}/address/${address}`
}

export function explorerBlockUrl(blockNumber: bigint | number | string): string {
  return `${getExplorerBaseUrl()}/block/${blockNumber.toString()}`
}

export function explorerTxUrl(txHash: string): string {
  return `${getExplorerBaseUrl()}/tx/${txHash}`
}

export function explorerSearchUrl(query: string): string {
  return `${getExplorerBaseUrl()}/search?f=0&q=${encodeURIComponent(query)}`
}
