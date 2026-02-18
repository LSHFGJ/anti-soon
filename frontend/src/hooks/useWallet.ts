import { useCallback, useEffect, useState } from 'react'
import { useAccount, useDisconnect, useSwitchChain, useWalletClient, usePublicClient } from 'wagmi'
import { useAppKit } from '@reown/appkit/react'
import { sepolia } from '@reown/appkit/networks'
import type { Address, WalletClient, PublicClient } from 'viem'

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

export function useWallet(): WalletState {
  const { address, isConnected, chain } = useAccount()
  const { open } = useAppKit()
  const { disconnect } = useDisconnect()
  const { switchChain, isPending: isSwitching } = useSwitchChain()
  const { data: walletClient } = useWalletClient()
  const publicClient = usePublicClient()
  const [isConnecting, setIsConnecting] = useState(false)

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
    if (isWrongNetwork && !isSwitching) {
      switchToCorrectNetwork()
    }
  }, [isWrongNetwork, isSwitching, switchToCorrectNetwork])

  return {
    address: address ?? null,
    isConnected,
    isConnecting,
    isWrongNetwork,
    walletClient,
    publicClient,
    connect,
    disconnect,
    switchToCorrectNetwork
  }
}
