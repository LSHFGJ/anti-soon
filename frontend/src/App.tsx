import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Web3Provider } from './providers/Web3Provider'
import { Navbar } from './components/Layout/Navbar'
import { ToastProvider } from './components/ToastProvider'
import { Landing } from './pages/Landing'
import { Explorer } from './pages/Explorer'
import { Leaderboard } from './pages/Leaderboard'
import { ProjectDetail } from './pages/ProjectDetail'
import { SubmissionDetail } from './pages/SubmissionDetail'
import { CreateProject } from './pages/CreateProject'
import { Dashboard } from './pages/Dashboard'

const Builder = lazy(() => import('./pages/Builder'))

const BuilderRouteFallback = () => (
  <div className="container py-8 px-4 text-[var(--color-text-dim)]">
    Loading builder...
  </div>
)

function App() {
  return (
    <Web3Provider>
      <BrowserRouter>
        <div className="app-container flex flex-col min-h-screen">
          <Navbar />
          <main className="flex-1 pt-[70px] pb-12">
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
              <Route path="/explorer" element={<Explorer />} />
              <Route path="/leaderboard" element={<Leaderboard />} />
              <Route path="/create-project" element={<CreateProject />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/project/:id" element={<ProjectDetail />} />
              <Route path="/submission/:id" element={<SubmissionDetail />} />
            </Routes>
          </main>
          <footer className="flex-shrink-0 py-3 text-center text-[var(--color-text-dim)] text-xs font-mono border-t border-[rgba(153,153,153,0.2)]">
            ANTI-SOON &copy; 2026 // DECENTRALIZED_VERIFICATION_NETWORK
          </footer>
          <ToastProvider />
        </div>
      </BrowserRouter>
    </Web3Provider>
  )
}

export default App
