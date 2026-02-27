import { useCallback, useEffect, useState } from 'react'
import { useAccount, useDisconnect, useSwitchChain, useWalletClient, usePublicClient } from 'wagmi'
import { useAppKit } from '@reown/appkit/react'
import { sepolia } from '@reown/appkit/networks'
import type { Address, WalletClient, PublicClient } from 'viem'
import { normalizeEthereumAddress } from '../lib/address'

interface WalletState {
  address: Address | null
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
  const { address, isConnected, chain } = useAccount()
  const { open } = useAppKit()
  const { disconnect } = useDisconnect()
  const { switchChain, isPending: isSwitching } = useSwitchChain()
  const { data: walletClient } = useWalletClient()
  const publicClient = usePublicClient()
  const [isConnecting, setIsConnecting] = useState(false)

  const normalizedAddress = normalizeEthereumAddress(address)

  const isWrongNetwork = isConnected && chain?.id !== sepolia.id

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

  // Auto-switch to correct network when connected to wrong network
  useEffect(() => {
    if (autoSwitchToSepolia && isWrongNetwork && !isSwitching) {
      switchToCorrectNetwork()
    }
  }, [autoSwitchToSepolia, isWrongNetwork, isSwitching, switchToCorrectNetwork])

  return {
    address: normalizedAddress,
    isConnected: isConnected && normalizedAddress !== null,
    isConnecting,
    isWrongNetwork,
    walletClient,
    publicClient,
    connect,
    disconnect,
    switchToCorrectNetwork
  }
}
