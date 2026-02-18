import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider } from 'wagmi'
import { createAppKit } from '@reown/appkit/react'
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'
import { sepolia, type AppKitNetwork } from '@reown/appkit/networks'

const queryClient = new QueryClient()

const projectId = '9bfcfddfcd5c1c5381b624d26565cfcf'

const metadata = {
  name: 'AntiSoon',
  description: 'Decentralized Vulnerability Verification Network',
  url: 'https://antisoon.xyz',
  icons: ['https://avatars.githubusercontent.com/u/179229932']
}

const networks: [AppKitNetwork, ...AppKitNetwork[]] = [sepolia]

const wagmiAdapter = new WagmiAdapter({
  networks,
  projectId,
  ssr: false
})

createAppKit({
  adapters: [wagmiAdapter],
  networks,
  projectId,
  metadata,
  features: {
    analytics: false
  }
})

export function Web3Provider({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  )
}
