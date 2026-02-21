import { Link, useLocation } from 'react-router-dom'
import { useWallet } from '../../hooks/useWallet'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function Navbar() {
  const { isConnected, address, connect, disconnect } = useWallet()
  const location = useLocation()

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

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 h-auto md:h-[70px] flex items-center justify-between md:justify-between gap-2 px-3 sm:px-4 md:px-8 py-2 md:py-0 flex-wrap md:flex-nowrap bg-[var(--color-bg-panel)] backdrop-blur-md border-b border-neutral-800 shadow-[0_0_40px_rgba(124,58,237,0.4)]">
      <Link to="/" className="order-1 flex items-baseline gap-2 no-underline group flex-shrink-0">
        <span className="font-['Syncopate',sans-serif] text-base sm:text-lg md:text-xl font-bold text-[var(--color-primary)] transition-all duration-300 group-hover:drop-shadow-[0_0_15px_var(--color-primary-glow)]">
          ANTI-SOON
        </span>
        <span className="hidden sm:inline font-['JetBrains_Mono',monospace] text-[0.7rem] text-[var(--color-text-dim)]">
          v2.0
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
          <Link to="/create-project">
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "hidden sm:inline-flex font-['JetBrains_Mono',monospace] text-[0.75rem]",
                "text-[var(--color-secondary)] border-[var(--color-secondary)]/50",
                "bg-[var(--color-secondary-dim)] hover:bg-[var(--color-secondary)] hover:text-[var(--color-bg)]",
                "hover:border-[var(--color-secondary)] hover:shadow-[0_0_15px_var(--color-secondary-glow)]",
                "transition-all duration-300"
              )}
            >
              + CREATE
            </Button>
          </Link>
        )}
        
        <Button
          onClick={isConnected ? disconnect : connect}
          variant="outline"
          size="sm"
          className={cn(
            "font-['JetBrains_Mono',monospace] text-[0.8rem]",
            isConnected
              ? "text-[var(--color-primary)] border-[var(--color-primary)]/50 bg-[var(--color-primary-dim)] hover:bg-[var(--color-primary)] hover:text-[var(--color-bg)] hover:shadow-[0_0_15px_var(--color-primary-glow)]"
              : "text-[var(--color-text)] border-white/20 hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] hover:shadow-[0_0_15px_var(--color-primary-dim)]",
            "transition-all duration-300"
          )}
        >
          {isConnected 
            ? `[${address?.slice(0, 6)}...${address?.slice(-4)}]` 
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
