import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: ErrorInfo) => void
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('PoCBuilder ErrorBoundary caught an error:', error, errorInfo)
    this.props.onError?.(error, errorInfo)
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div style={{
          padding: '2rem',
          border: '1px solid var(--color-error)',
          background: 'rgba(255, 0, 0, 0.05)',
          color: 'var(--color-text)',
          fontFamily: 'var(--font-mono)'
        }}>
          <h3 style={{ 
            color: 'var(--color-error)', 
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <span>⚠</span> // ERROR_DETECTED
          </h3>
          <p style={{ 
            marginBottom: '1rem', 
            fontSize: '0.9rem',
            color: 'var(--color-text-dim)'
          }}>
            An unexpected error occurred in the PoC Builder.
          </p>
          {this.state.error && (
            <pre style={{
              background: 'rgba(0, 0, 0, 0.3)',
              padding: '1rem',
              borderRadius: '4px',
              fontSize: '0.8rem',
              color: 'var(--color-error)',
              overflow: 'auto',
              maxHeight: '200px',
              marginBottom: '1rem'
            }}>
              {this.state.error.message}
            </pre>
          )}
          <button
            onClick={this.handleReset}
            style={{
              background: 'transparent',
              border: '1px solid var(--color-primary)',
              color: 'var(--color-primary)',
              padding: '0.5rem 1.5rem',
              cursor: 'pointer',
              fontFamily: 'var(--font-mono)'
            }}
          >
            [ TRY_AGAIN ]
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
