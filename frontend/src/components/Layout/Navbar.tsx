import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { createPublicClient, defineChain, formatEther, http } from 'viem'
import { useWallet } from '../../hooks/useWallet'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { publicClient } from '@/lib/publicClient'
import { DOCS_ENABLED } from '@/config'

const LOW_GAS_BALANCE_WEI = 10_000_000_000_000_000n
const GAS_BALANCE_REFRESH_MS = 30_000

const sapphireTestnetChain = defineChain({
  id: 23295,
  name: 'Oasis Sapphire Testnet',
  nativeCurrency: {
    name: 'TEST',
    symbol: 'TEST',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ['https://testnet.sapphire.oasis.io'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Oasis Explorer',
      url: 'https://explorer.oasis.io/testnet/sapphire',
    },
  },
})

const sapphirePublicClient = createPublicClient({
  chain: sapphireTestnetChain,
  transport: http('https://testnet.sapphire.oasis.io'),
})

interface ChainGasBalance {
  label: string
  symbol: string
  value: bigint | null
  faucetUrl: string
  error?: string
}

const INITIAL_GAS_BALANCES: ChainGasBalance[] = [
  {
    label: 'Ethereum Sepolia',
    symbol: 'ETH',
    value: null,
    faucetUrl: 'https://www.alchemy.com/faucets/ethereum-sepolia',
  },
  {
    label: 'Oasis Sapphire Testnet',
    symbol: 'TEST',
    value: null,
    faucetUrl: 'https://faucet.testnet.oasis.io/',
  },
]

function formatGasBalance(value: bigint | null): string {
  if (value === null) {
    return '--'
  }

  const asNumber = Number(formatEther(value))
  if (!Number.isFinite(asNumber)) {
    return formatEther(value)
  }

  return asNumber.toFixed(4)
}

interface ChainIndicator {
  label: string
  iconPath: string
}

function resolveChainIndicator(chainId: number | null, chainName: string | null): ChainIndicator {
  if (chainId === 11155111) {
    return {
      label: 'Ethereum Sepolia',
      iconPath: '/chains/ethereum.svg',
    }
  }

  if (chainId === 1) {
    return {
      label: 'Ethereum Mainnet',
      iconPath: '/chains/ethereum.svg',
    }
  }

  if (chainId === 23294 || chainId === 23295) {
    return {
      label: 'Oasis Sapphire Testnet',
      iconPath: '/chains/oasis-sapphire.svg',
    }
  }

  if (chainName?.toLowerCase().includes('sapphire')) {
    return {
      label: chainName.toLowerCase().includes('testnet') ? chainName : 'Oasis Sapphire Testnet',
      iconPath: '/chains/oasis-sapphire.svg',
    }
  }

  return {
    label: chainName ?? 'Unknown Network',
    iconPath: '/chains/ethereum.svg',
  }
}

export function Navbar() {
  const { isConnected, address, chainId, chainName, connect, disconnect } = useWallet({ autoSwitchToSepolia: false })
  const location = useLocation()
  const navRef = useRef<HTMLElement | null>(null)
  const gasBalanceFetchedAtRef = useRef<number>(0)
  const gasBalanceFetchedAddressRef = useRef<string | null>(null)
  const chainIndicator = resolveChainIndicator(chainId, chainName)
  const [isGasBalanceLoading, setIsGasBalanceLoading] = useState(false)
  const [gasBalances, setGasBalances] = useState<ChainGasBalance[]>(INITIAL_GAS_BALANCES)

  const navItems = [
    { path: '/', label: 'HOME' },
    { path: '/builder', label: 'BUILDER' },
    { path: '/explorer', label: 'EXPLORER' },
    { path: '/dashboard', label: 'DASHBOARD' },
    { path: '/leaderboard', label: 'LEADERBOARD' },
    ...(DOCS_ENABLED ? [{ path: '/docs', label: 'DOCS' }] : []),
  ]

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/'
    return location.pathname.startsWith(path)
  }

  useLayoutEffect(() => {
    const navElement = navRef.current
    if (!navElement) return

    const applyOffset = () => {
      const { height } = navElement.getBoundingClientRect()
      document.documentElement.style.setProperty('--app-nav-offset', `${Math.ceil(height)}px`)
    }

    applyOffset()

    const observer = new ResizeObserver(applyOffset)
    observer.observe(navElement)
    window.addEventListener('resize', applyOffset)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', applyOffset)
    }
  }, [])

  useEffect(() => {
    if (!isConnected || !address) {
      gasBalanceFetchedAtRef.current = 0
      gasBalanceFetchedAddressRef.current = null
      setGasBalances(INITIAL_GAS_BALANCES)
      return
    }

    if (gasBalanceFetchedAddressRef.current !== address) {
      gasBalanceFetchedAtRef.current = 0
      setGasBalances(INITIAL_GAS_BALANCES)
    }
  }, [address, isConnected])

  const loadGasBalances = useCallback(async () => {
    if (!address) {
      return
    }

    const now = Date.now()
    if (
      gasBalanceFetchedAddressRef.current === address
      && now - gasBalanceFetchedAtRef.current < GAS_BALANCE_REFRESH_MS
    ) {
      return
    }

    setIsGasBalanceLoading(true)

    try {
      const [sepoliaResult, sapphireResult] = await Promise.allSettled([
        publicClient.getBalance({ address }),
        sapphirePublicClient.getBalance({ address }),
      ])

      setGasBalances([
        {
          label: 'Ethereum Sepolia',
          symbol: 'ETH',
          value: sepoliaResult.status === 'fulfilled' ? sepoliaResult.value : null,
          faucetUrl: 'https://www.alchemy.com/faucets/ethereum-sepolia',
          error: sepoliaResult.status === 'rejected' ? 'UNAVAILABLE' : undefined,
        },
        {
          label: 'Oasis Sapphire Testnet',
          symbol: 'TEST',
          value: sapphireResult.status === 'fulfilled' ? sapphireResult.value : null,
          faucetUrl: 'https://faucet.testnet.oasis.io/',
          error: sapphireResult.status === 'rejected' ? 'UNAVAILABLE' : undefined,
        },
      ])

      gasBalanceFetchedAtRef.current = now
      gasBalanceFetchedAddressRef.current = address
    } finally {
      setIsGasBalanceLoading(false)
    }
  }, [address])

  const lowBalanceChains = gasBalances.filter(
    (item) => item.value !== null && item.value < LOW_GAS_BALANCE_WEI,
  )

  return (
    <nav
      ref={navRef}
      className="fixed top-0 left-0 right-0 z-50 h-auto md:h-[70px] flex items-center justify-between md:justify-between gap-2 px-3 sm:px-4 md:px-8 py-2 md:py-0 flex-wrap md:flex-nowrap bg-[var(--color-bg-panel)] backdrop-blur-md border-b border-neutral-800 shadow-[0_0_40px_rgba(124,58,237,0.4)]"
    >
      <Link to="/" className="order-1 flex items-center gap-2.5 no-underline group flex-shrink-0">
        <img
          src="/logo/antisoon-logo-horizontal.svg"
          alt="AntiSoon"
          className="hidden sm:block h-6 md:h-7 w-auto transition-all duration-200 ease-linear group-hover:drop-shadow-[0_0_15px_var(--color-primary-glow)]"
        />
        <img
          src="/logo/antisoon-logo-compact.svg"
          alt="AntiSoon"
          className="sm:hidden h-7 w-auto transition-all duration-200 ease-linear group-hover:drop-shadow-[0_0_15px_var(--color-primary-glow)]"
        />
        <span className="hidden sm:inline pb-0.5 font-mono text-[0.7rem] text-[var(--color-text-dim)]">
          beta
        </span>
      </Link>

      <div className="hidden md:flex navbar-links md:order-2 md:ml-5">
        {navItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={cn(
              "nav-link",
              isActive(item.path) && "active"
            )}
          >
            [{item.label}]
          </Link>
        ))}
      </div>

      <div className="order-3 w-full flex md:hidden gap-1 overflow-x-auto pl-5 pr-1 flex-nowrap items-center pb-1">
        {navItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={cn(
              "nav-link whitespace-nowrap shrink-0 py-2 px-3",
              isActive(item.path) && "active"
            )}
          >
            [{item.label}]
          </Link>
        ))}
      </div>

      <div className="order-2 md:order-3 flex gap-2 sm:gap-4 items-center flex-shrink-0 ml-auto">
        {isConnected && (
          <Button
            asChild
            variant="outline"
            size="sm"
            className={cn(
              "hidden sm:inline-flex font-mono text-[0.75rem] no-underline",
              "text-[var(--color-secondary)] border-[var(--color-secondary)]/50",
              "bg-[var(--color-secondary-dim)]",
              "hover:bg-[rgba(59,130,246,0.22)] hover:text-[var(--color-secondary)]",
              "hover:border-[var(--color-secondary)] hover:shadow-[0_0_18px_var(--color-secondary-glow)]",
              "transition-all duration-200 ease-linear"
            )}
          >
            <Link to="/create-project">+ CREATE</Link>
          </Button>
        )}
        
        <div className="relative group">
          <Button
            onClick={isConnected ? disconnect : connect}
            onMouseEnter={() => {
              if (!isConnected) return
              void loadGasBalances()
            }}
            variant="outline"
            size="sm"
            className={cn(
              'font-mono text-[0.8rem]',
              isConnected
                ? 'text-[var(--color-primary)] border-[var(--color-primary)]/60 bg-[var(--color-primary-dim)] hover:bg-[rgba(124,58,237,0.22)] hover:text-[var(--color-primary)] hover:border-[var(--color-primary)] hover:shadow-[0_0_18px_var(--color-primary-glow)]'
                : 'text-[var(--color-text)] border-white/20 hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] hover:shadow-[0_0_15px_var(--color-primary-dim)]',
              'transition-all duration-200 ease-linear',
            )}
          >
            {isConnected
              ? (
                <span className="inline-flex items-center gap-2">
                  <span>[{address?.slice(0, 6)}...{address?.slice(-4)}]</span>
                  <span
                    data-testid="navbar-chain-icon"
                    title={chainIndicator.label}
                    className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-current/40 overflow-hidden"
                  >
                    <img
                      src={chainIndicator.iconPath}
                      alt={chainIndicator.label}
                      className="h-full w-full object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                  </span>
                </span>
              )
              : (
                <>
                  <span className="sm:hidden">[CONN]</span>
                  <span className="hidden sm:inline">[ CONNECT ]</span>
                </>
              )}
          </Button>

          {isConnected ? (
            <div className="pointer-events-none invisible absolute right-0 top-full z-50 w-[280px] rounded-sm border border-neutral-800 bg-[var(--color-bg-panel)]/95 p-3 opacity-0 shadow-[0_0_24px_rgba(124,58,237,0.22)] backdrop-blur-md transition-opacity duration-150 group-hover:pointer-events-auto group-hover:visible group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:visible group-focus-within:opacity-100">
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-text-dim)] mb-2">
                Gas Balances
              </p>

              <div className="space-y-1.5">
                {gasBalances.map((item) => (
                  <div key={item.label} className="flex items-center justify-between text-[11px] font-mono">
                    <span className="text-[var(--color-text-dim)]">{item.label}</span>
                    <span className="text-[var(--color-text)]">
                      {item.error ? item.error : `${formatGasBalance(item.value)} ${item.symbol}`}
                    </span>
                  </div>
                ))}
              </div>

              {isGasBalanceLoading ? (
                <p className="mt-2 text-[10px] font-mono text-[var(--color-text-dim)]">Refreshing balances...</p>
              ) : null}

              {lowBalanceChains.length > 0 ? (
                <div className="mt-2 rounded-sm border border-[var(--color-warning)]/40 bg-[rgba(245,158,11,0.08)] px-2 py-1.5">
                  <p className="text-[10px] font-mono text-[var(--color-warning)] mb-1">
                    Low gas detected, top up via faucet:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {lowBalanceChains.map((item) => (
                      <a
                        key={item.label}
                        href={item.faucetUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] font-mono text-[var(--color-secondary)] underline decoration-dotted hover:text-[var(--color-primary)]"
                        onClick={(event) => {
                          event.stopPropagation()
                        }}
                      >
                        {item.label} Faucet
                      </a>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </nav>
  )
}
