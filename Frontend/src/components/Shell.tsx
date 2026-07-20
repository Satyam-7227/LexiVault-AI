import { NavLink, useNavigate } from 'react-router-dom'
import { BookOpen, BarChart2, Brain, FileText, LayoutDashboard, LogOut, Moon, Sun } from 'lucide-react'
import { useTheme } from '../context/ThemeContext'

interface ShellProps { children: React.ReactNode }

export default function Shell({ children }: ShellProps) {
  const { theme, toggle } = useTheme()
  const navigate = useNavigate()
  const name = localStorage.getItem('lexivault_name') || 'Learner'

  const logout = () => {
    localStorage.removeItem('lexivault_token')
    localStorage.removeItem('lexivault_name')
    navigate('/login')
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        {/* Logo */}
        <div className="sidebar-logo">
          <div className="brand-mark">
            <BookOpen size={18} />
          </div>
          <span className="brand-name">Lexi<span>Vault</span></span>
        </div>

        <nav className="sidebar-nav">
          <div className="sidebar-section-label">Main</div>
          <NavLink to="/dashboard"><LayoutDashboard size={18} /><span>Dashboard</span></NavLink>
          <NavLink to="/library"><FileText size={18} /><span>My Library</span></NavLink>
          <NavLink to="/vocabulary"><BookOpen size={18} /><span>Vocabulary</span></NavLink>

          <div className="sidebar-section-label">Practice</div>
          <NavLink to="/quiz"><Brain size={18} /><span>Quiz Room</span></NavLink>
          <NavLink to="/analytics"><BarChart2 size={18} /><span>Analytics</span></NavLink>
        </nav>

        {/* Footer */}
        <div className="sidebar-footer">
          <button className="theme-toggle" onClick={toggle}>
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
          </button>

          <div className="sidebar-profile">
            <div className="avatar">{name[0].toUpperCase()}</div>
            <div className="sidebar-profile-info">
              <strong>{name}</strong>
              <span>Learner</span>
            </div>
            <button className="btn-ghost btn-icon" onClick={logout} title="Sign out">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      <section className="main-content">{children}</section>
    </div>
  )
}
