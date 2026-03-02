import { useLayoutEffect, useRef } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useWallet } from '../../hooks/useWallet'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface ChainIndicator {
  label: string
  iconPath: string
}

function resolveChainIndicator(chainId: number | null, chainName: string | null): ChainIndicator {
  if (chainId === 11155111) {
    return {
      label: 'Sepolia',
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
      label: 'Oasis Sapphire',
      iconPath: '/chains/oasis-sapphire.svg',
    }
  }

  if (chainName?.toLowerCase().includes('sapphire')) {
    return {
      label: chainName,
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
  const chainIndicator = resolveChainIndicator(chainId, chainName)

  const navItems = [
    { path: '/', label: 'HOME' },
    { path: '/builder', label: 'BUILDER' },
    { path: '/explorer', label: 'EXPLORER' },
    { path: '/dashboard', label: 'DASHBOARD' },
    { path: '/leaderboard', label: 'LEADERBOARD' },
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

      <div className="hidden md:flex navbar-links md:order-2">
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

      <div className="order-3 w-full flex md:hidden gap-1 overflow-x-auto px-1 flex-nowrap items-center pb-1">
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
        
        <Button
          onClick={isConnected ? disconnect : connect}
          variant="outline"
          size="sm"
          className={cn(
            "font-mono text-[0.8rem]",
            isConnected
              ? "text-[var(--color-primary)] border-[var(--color-primary)]/60 bg-[var(--color-primary-dim)] hover:bg-[rgba(124,58,237,0.22)] hover:text-[var(--color-primary)] hover:border-[var(--color-primary)] hover:shadow-[0_0_18px_var(--color-primary-glow)]"
              : "text-[var(--color-text)] border-white/20 hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] hover:shadow-[0_0_15px_var(--color-primary-dim)]",
            "transition-all duration-200 ease-linear"
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
            )
          }
        </Button>
      </div>
    </nav>
  )
}
