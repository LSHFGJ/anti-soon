import { Link, useLocation } from 'react-router-dom'
import { useWallet } from '../../hooks/useWallet'
import { Button } from '@/components/ui/button'
import {
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuLink,
  navigationMenuTriggerStyle,
} from '@/components/ui/navigation-menu'
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
    <nav className="fixed top-0 left-0 right-0 z-50 h-[70px] flex items-center justify-between px-8 bg-[rgba(10,10,10,0.95)] backdrop-blur-sm border-b border-[var(--color-bg-light)]">
      <Link to="/" className="flex items-baseline gap-2 no-underline group">
        <span className="font-['Syncopate',sans-serif] text-xl font-bold text-[var(--color-primary)] transition-all duration-200 group-hover:drop-shadow-[0_0_10px_rgba(0,255,157,0.5)]">
          ANTI-SOON
        </span>
        <span className="font-['JetBrains_Mono',monospace] text-[0.7rem] text-[var(--color-text-dim)]">
          v2.0
        </span>
      </Link>

      <NavigationMenu className="hidden md:flex">
        <NavigationMenuList className="flex gap-1">
          {navItems.map((item) => (
            <NavigationMenuItem key={item.path}>
              <Link to={item.path}>
                <NavigationMenuLink
                  className={cn(
                    navigationMenuTriggerStyle(),
                    "font-['JetBrains_Mono',monospace] text-[0.8rem] px-4 py-2",
                    "text-[var(--color-text-dim)] border border-transparent",
                    "hover:text-[var(--color-primary)] hover:bg-transparent",
                    "transition-all duration-200",
                    isActive(item.path) && [
                      "text-[var(--color-primary)]",
                      "border-[var(--color-primary)]",
                      "bg-[rgba(0,255,157,0.1)]",
                    ]
                  )}
                >
                  [{item.label}]
                </NavigationMenuLink>
              </Link>
            </NavigationMenuItem>
          ))}
        </NavigationMenuList>
      </NavigationMenu>

      <div className="flex md:hidden gap-1 overflow-x-auto">
        {navItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={cn(
              "font-['JetBrains_Mono',monospace] text-[0.7rem] px-2 py-1",
              "text-[var(--color-text-dim)] border border-transparent",
              "hover:text-[var(--color-primary)]",
              "transition-all duration-200 whitespace-nowrap",
              isActive(item.path) && [
                "text-[var(--color-primary)]",
                "border-[var(--color-primary)]",
                "bg-[rgba(0,255,157,0.1)]",
              ]
            )}
          >
            [{item.label.slice(0, 3)}]
          </Link>
        ))}
      </div>

      <div className="flex gap-4 items-center">
        {isConnected && (
          <Link to="/create-project">
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "font-['JetBrains_Mono',monospace] text-[0.75rem]",
                "text-[var(--color-secondary)] border-[var(--color-secondary)]",
                "bg-transparent hover:bg-[var(--color-secondary)] hover:text-[var(--color-bg)]",
                "hover:border-[var(--color-secondary)]",
                "transition-all duration-200"
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
              ? "text-[var(--color-primary)] border-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-[var(--color-bg)]"
              : "text-[var(--color-text)] border-[var(--color-text-dim)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]",
            "bg-transparent",
            "transition-all duration-200"
          )}
        >
          {isConnected 
            ? `[${address?.slice(0, 6)}...${address?.slice(-4)}]` 
            : '[ CONNECT ]'
          }
        </Button>
      </div>
    </nav>
  )
}
