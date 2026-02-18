import { useState, useEffect, useCallback } from 'react'
import { createWalletClient, custom, createPublicClient, http } from 'viem'
import type { Address, WalletClient, PublicClient } from 'viem'
import { CHAIN } from '../config'

interface WalletState {
  address: Address | null
  isConnected: boolean
  isConnecting: boolean
  walletClient: WalletClient | null
  publicClient: PublicClient | null
  connect: () => Promise<void>
  disconnect: () => void
}

export function useWallet(): WalletState {
  const [address, setAddress] = useState<Address | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [walletClient, setWalletClient] = useState<WalletClient | null>(null)
  const [publicClient, setPublicClient] = useState<PublicClient | null>(null)

  // Initialize public client immediately
  useEffect(() => {
    const pc = createPublicClient({ 
      chain: CHAIN, 
      transport: http() 
    })
    setPublicClient(pc)
  }, [])

  const connect = useCallback(async () => {
    if (!window.ethereum) {
      alert("No crypto wallet found. Please install MetaMask or similar.")
      return
    }

    try {
      setIsConnecting(true)
      const wc = createWalletClient({
        chain: CHAIN,
        transport: custom(window.ethereum)
      })

      const [addr] = await wc.requestAddresses()
      
      setWalletClient(wc)
      setAddress(addr)
    } catch (error) {
      console.error("Failed to connect wallet:", error)
    } finally {
      setIsConnecting(false)
    }
  }, [])

  // Auto-connect if already authorized
  useEffect(() => {
    async function checkConnection() {
      if (!window.ethereum) return
      
      const wc = createWalletClient({
        chain: CHAIN,
        transport: custom(window.ethereum)
      })
      
      try {
        const addresses = await wc.getAddresses()
        if (addresses.length > 0) {
          setWalletClient(wc)
          setAddress(addresses[0])
        }
      } catch (e) {
        // Ignore error on check
      }
    }
    
    checkConnection()
  }, [])

  const disconnect = useCallback(() => {
    setWalletClient(null)
    setAddress(null)
  }, [])

  return {
    address,
    isConnected: !!address,
    isConnecting,
    walletClient,
    publicClient,
    connect,
    disconnect
  }
}

// Add window.ethereum type
declare global {
  interface Window {
    ethereum?: any
  }
}
