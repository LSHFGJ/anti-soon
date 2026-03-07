interface RpcEnv {
  VITE_RPC_URL?: string
  VITE_SEPOLIA_RPC_URL?: string
  VITE_PRIVATE_RPC_URL?: string
  [key: string]: string | undefined
}

const RPC_KEYS: readonly (keyof RpcEnv)[] = [
  'VITE_RPC_URL',
  'VITE_SEPOLIA_RPC_URL',
  'VITE_PRIVATE_RPC_URL',
]

export function resolveRpcUrls(env: RpcEnv = import.meta.env as unknown as RpcEnv): string[] {
  const urls: string[] = []

  for (const key of RPC_KEYS) {
    const value = env[key]?.trim()
    if (!value) {
      continue
    }

    for (const candidate of value.split(',')) {
      const url = candidate.trim()
      if (url && !urls.includes(url)) {
        urls.push(url)
      }
    }
  }

  return urls
}

export function resolveRpcUrl(env: RpcEnv = import.meta.env as unknown as RpcEnv): string | undefined {
  return resolveRpcUrls(env)[0]
}
