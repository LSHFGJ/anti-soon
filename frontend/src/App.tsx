import { Suspense, lazy } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Navbar } from './components/Layout/Navbar'
import { ToastProvider } from './components/ToastProvider'
import { DOCS_ENABLED } from './config'
import { CreateProject } from './pages/CreateProject'
import { Dashboard } from './pages/Dashboard'
import { Docs } from './pages/Docs'
import { Explorer } from './pages/Explorer'
import { Landing } from './pages/Landing'
import { Leaderboard } from './pages/Leaderboard'
import { ProjectDetail } from './pages/ProjectDetail'
import { SubmissionDetail } from './pages/SubmissionDetail'
import { Web3Provider } from './providers/Web3Provider'

const Builder = lazy(() => import('./pages/Builder'))

const BuilderRouteFallback = () => (
  <div className="container py-8 px-4 text-[var(--color-text-dim)]" />
)

function DocsRoute() {
  if (!DOCS_ENABLED) {
    return <Navigate to="/" replace />
  }

  return <Docs />
}

function AppShell() {
  const location = useLocation()
  const isBuilderRoute = location.pathname.startsWith('/builder')

  return (
    <div className="app-container flex flex-col min-h-screen">
      <Navbar />
      <main
        className={`flex-1 min-h-0 ${isBuilderRoute ? 'pb-0' : 'pb-12'}`}
        style={{ paddingTop: 'var(--app-nav-offset, 70px)' }}
      >
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route
            path="/builder"
            element={(
              <Suspense fallback={<BuilderRouteFallback />}>
                <Builder />
              </Suspense>
            )}
          />
          <Route
            path="/builder/:projectId"
            element={(
              <Suspense fallback={<BuilderRouteFallback />}>
                <Builder />
              </Suspense>
            )}
          />
          <Route path="/docs" element={<DocsRoute />} />
          <Route path="/docs/*" element={<Navigate to="/docs" replace />} />
          <Route path="/explorer" element={<Explorer />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/create-project" element={<CreateProject />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/project/:id" element={<ProjectDetail />} />
          <Route path="/submission/:id" element={<SubmissionDetail />} />
        </Routes>
      </main>
            <footer className="flex-shrink-0 py-3 text-center text-[var(--color-text-dim)] text-xs font-mono border-t border-[rgba(153,153,153,0.2)]">
              AntiSoon &copy; 2026 · MIT License · Convergence
            </footer>
      <ToastProvider />
    </div>
  )
}

function App() {
  return (
    <Web3Provider>
      <BrowserRouter>
        <AppShell />
      </BrowserRouter>
    </Web3Provider>
  )
}

export default App
