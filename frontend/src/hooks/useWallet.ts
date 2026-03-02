import { useCallback, useEffect, useRef, useState } from 'react'
import {
  useAccount,
  useDisconnect,
  usePublicClient,
  useSwitchChain,
  useWalletClient,
} from 'wagmi'
import { useAppKit } from '@reown/appkit/react'
import { sepolia } from '@reown/appkit/networks'
import type { Address, WalletClient, PublicClient } from 'viem'
import { normalizeEthereumAddress } from '../lib/address'

const WALLET_STORAGE_KEYS = [
  'wagmi.store',
  'wagmi.recentConnectorId',
  'WALLETCONNECT_DEEPLINK_CHOICE',
]

const WALLET_STORAGE_PREFIXES = ['wagmi.', 'walletconnect', 'wc@2:', 'reown', '@appkit/']

const CHAIN_NAME_BY_ID: Record<number, string> = {
  1: 'Ethereum Mainnet',
  [sepolia.id]: 'Sepolia',
  23294: 'Oasis Sapphire',
  23295: 'Oasis Sapphire',
}

function clearPersistedWalletState() {
  if (typeof window === 'undefined') return

  for (const storage of [window.localStorage, window.sessionStorage]) {
    try {
      const staleKeys: string[] = []
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index)
        if (!key) continue

        const lowerKey = key.toLowerCase()
        const shouldClear =
          WALLET_STORAGE_KEYS.includes(key) ||
          WALLET_STORAGE_PREFIXES.some((prefix) => lowerKey.startsWith(prefix))

        if (shouldClear) staleKeys.push(key)
      }

      for (const key of staleKeys) {
        storage.removeItem(key)
      }
    } catch {}
  }
}

interface WalletState {
  address: Address | null
  chainId: number | null
  chainName: string | null
  isConnected: boolean
  isConnecting: boolean
  isWrongNetwork: boolean
  walletClient: WalletClient | undefined
  publicClient: PublicClient | undefined
  connect: () => Promise<void>
  disconnect: () => void
  switchToCorrectNetwork: () => Promise<void>
}

interface UseWalletOptions {
  autoSwitchToSepolia?: boolean
}

export function useWallet(options: UseWalletOptions = {}): WalletState {
  const { autoSwitchToSepolia = true } = options
  const { address, isConnected, chain, chainId: accountChainId } = useAccount()
  const { open } = useAppKit()
  const { disconnect } = useDisconnect()
  const { switchChain, isPending: isSwitching } = useSwitchChain()
  const { data: walletClient } = useWalletClient()
  const publicClient = usePublicClient()
  const [isConnecting, setIsConnecting] = useState(false)
  const autoSwitchAttemptedChainRef = useRef<number | null>(null)

  const normalizedAddress = normalizeEthereumAddress(address)
  const resolvedChainId = chain?.id ?? accountChainId ?? walletClient?.chain?.id ?? null
  const resolvedChainName =
    chain?.name ??
    walletClient?.chain?.name ??
    (resolvedChainId !== null ? CHAIN_NAME_BY_ID[resolvedChainId] ?? null : null)

  const isWrongNetwork = isConnected && resolvedChainId !== sepolia.id

  const switchToCorrectNetwork = useCallback(async () => {
    if (switchChain) {
      try {
        await switchChain({ chainId: sepolia.id })
      } catch (error) {
        console.error('Failed to switch network:', error)
      }
    }
  }, [switchChain])

  const connect = useCallback(async () => {
    try {
      setIsConnecting(true)
      await open()
    } catch (error) {
      console.error('Failed to connect wallet:', error)
    } finally {
      setIsConnecting(false)
    }
  }, [open])

  const disconnectAndClearState = useCallback(() => {
    autoSwitchAttemptedChainRef.current = null
    disconnect()
    clearPersistedWalletState()
  }, [disconnect])

  // Auto-switch to correct network when connected to wrong network
  useEffect(() => {
    if (!autoSwitchToSepolia) {
      autoSwitchAttemptedChainRef.current = null
      return
    }

    if (!isConnected) {
      return
    }

    if (!isWrongNetwork) {
      autoSwitchAttemptedChainRef.current = null
      return
    }

    const currentChainId = resolvedChainId
    if (currentChainId === null || isSwitching) {
      return
    }

    if (autoSwitchAttemptedChainRef.current === currentChainId) {
      return
    }

    autoSwitchAttemptedChainRef.current = currentChainId
    void switchToCorrectNetwork()
  }, [
    autoSwitchToSepolia,
    isConnected,
    isWrongNetwork,
    isSwitching,
    resolvedChainId,
    switchToCorrectNetwork,
  ])

  return {
    address: normalizedAddress,
    chainId: resolvedChainId,
    chainName: resolvedChainName,
    isConnected: isConnected && normalizedAddress !== null,
    isConnecting,
    isWrongNetwork,
    walletClient,
    publicClient,
    connect,
    disconnect: disconnectAndClearState,
    switchToCorrectNetwork
  }
}
