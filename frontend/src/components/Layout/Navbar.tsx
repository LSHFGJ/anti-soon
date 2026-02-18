import { Link, useLocation } from 'react-router-dom'
import { useWallet } from '../../hooks/useWallet'

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
    <nav style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      height: '70px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 2rem',
      background: 'rgba(10, 10, 10, 0.95)',
      backdropFilter: 'blur(10px)',
      borderBottom: '1px solid var(--color-bg-light)',
      zIndex: 1000,
    }}>
      <Link to="/" className="navbar-logo">
        <span style={{
          fontFamily: 'var(--font-display)',
          fontSize: '1.25rem',
          fontWeight: 'bold',
          color: 'var(--color-primary)',
        }}>
          ANTI-SOON
        </span>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.7rem',
          color: 'var(--color-text-dim)',
        }}>
          v2.0
        </span>
      </Link>

      <div className="navbar-links">
        {navItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={`nav-link ${isActive(item.path) ? 'active' : ''}`}
          >
            [{item.label}]
          </Link>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
        {isConnected && (
          <Link
            to="/create-project"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.75rem',
              color: 'var(--color-secondary)',
              textDecoration: 'none',
              padding: '0.5rem 1rem',
              border: '1px solid var(--color-secondary)',
            }}
          >
            + CREATE
          </Link>
        )}
        
        <button
          onClick={isConnected ? disconnect : connect}
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.8rem',
            color: isConnected ? 'var(--color-primary)' : 'var(--color-text)',
            background: 'transparent',
            border: isConnected ? '1px solid var(--color-primary)' : '1px solid var(--color-text-dim)',
            padding: '0.5rem 1rem',
            cursor: 'pointer',
          }}
        >
          {isConnected 
            ? `[${address?.slice(0, 6)}...${address?.slice(-4)}]` 
            : '[ CONNECT ]'
          }
        </button>
      </div>
    </nav>
  )
}
