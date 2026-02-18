import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Navbar } from './components/Layout/Navbar'
import { Landing } from './pages/Landing'
import { Builder } from './pages/Builder'
import { Explorer } from './pages/Explorer'
import { Leaderboard } from './pages/Leaderboard'
import { ProjectDetail } from './pages/ProjectDetail'
import { SubmissionDetail } from './pages/SubmissionDetail'
import { CreateProject } from './pages/CreateProject'
import { Dashboard } from './pages/Dashboard'

function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <div style={{ paddingTop: '70px' }}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/builder" element={<Builder />} />
          <Route path="/explorer" element={<Explorer />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/create-project" element={<CreateProject />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/project/:id" element={<ProjectDetail />} />
          <Route path="/submission/:id" element={<SubmissionDetail />} />
        </Routes>
      </div>
      <footer style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        padding: '0.5rem',
        textAlign: 'center',
        color: 'var(--color-text-dim)',
        fontSize: '0.75rem',
        background: 'var(--color-bg)',
        borderTop: '1px solid rgba(153, 153, 153, 0.2)',
        zIndex: 10,
        pointerEvents: 'none',
      }}>
        ANTI-SOON &copy; 2026 // DECENTRALIZED_VERIFICATION_NETWORK
      </footer>
    </BrowserRouter>
  )
}

export default App
