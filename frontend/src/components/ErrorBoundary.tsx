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
        <div className="error-boundary-container">
          <h3 className="error-boundary-title">
            <span>⚠</span> // ERROR_DETECTED
          </h3>
          <p className="error-boundary-desc">
            An unexpected error occurred in the PoC Builder.
          </p>
          {this.state.error && (
            <pre className="error-boundary-pre">
              {this.state.error.message}
            </pre>
          )}
          <button
            onClick={this.handleReset}
            className="error-boundary-btn"
          >
            [ TRY_AGAIN ]
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
