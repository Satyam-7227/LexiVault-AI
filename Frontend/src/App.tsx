import { Navigate, Route, Routes } from 'react-router-dom'
import Landing    from './pages/Landing'
import Auth       from './pages/Auth'
import Dashboard  from './pages/Dashboard'
import Library    from './pages/Library'
import Reader     from './pages/Reader'
import Vocabulary from './pages/Vocabulary'
import Quiz       from './pages/Quiz'
import Analytics  from './pages/Analytics'

const isLoggedIn = () => Boolean(localStorage.getItem('lexivault_token'))

function Protected({ children }: { children: React.ReactNode }) {
  return isLoggedIn() ? <>{children}</> : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={isLoggedIn() ? <Navigate to="/dashboard" /> : <Landing />} />
      <Route path="/login" element={isLoggedIn() ? <Navigate to="/dashboard" /> : <Auth />} />

      {/* Protected */}
      <Route path="/dashboard"  element={<Protected><Dashboard /></Protected>} />
      <Route path="/library"    element={<Protected><Library /></Protected>} />
      <Route path="/reader/:documentId" element={<Protected><Reader /></Protected>} />
      <Route path="/vocabulary" element={<Protected><Vocabulary /></Protected>} />
      <Route path="/quiz"       element={<Protected><Quiz /></Protected>} />
      <Route path="/analytics"  element={<Protected><Analytics /></Protected>} />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  )
}
