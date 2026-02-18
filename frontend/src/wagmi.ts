import { http, createConfig } from 'wagmi'
import { sepolia } from 'wagmi/chains'
import { walletConnect, injected, coinbaseWallet } from 'wagmi/connectors'

const projectId = '9bfcfddfcd5c1c5381b624d26565cfcf'

export const config = createConfig({
  chains: [sepolia],
  multiInjectedProviderDiscovery: false,
  connectors: [
    injected(),
    walletConnect({ projectId }),
    coinbaseWallet({
      appName: 'AntiSoon',
    }),
  ],
  transports: {
    [sepolia.id]: http('https://1rpc.io/sepolia'),
  },
})

declare module 'wagmi' {
  export interface Register {
    config: typeof config
  }
}
