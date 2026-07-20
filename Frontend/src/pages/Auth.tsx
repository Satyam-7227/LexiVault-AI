import { FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen, Sparkles, Brain, Trophy } from 'lucide-react'
import { api } from '../api'

export default function Auth() {
  const [isRegister, setIsRegister] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function submit(e: FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      const result = isRegister
        ? await api.register({ name, email, password })
        : await api.login({ email, password })
      localStorage.setItem('lexivault_token', result.token)
      localStorage.setItem('lexivault_name', result.user.name)
      navigate('/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to continue.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-layout">
      {/* Brand panel */}
      <div className="auth-brand">
        <div className="eyebrow">Smarter Word Learning</div>
        <h1>Build a vocabulary<br />that stays with you.</h1>
        <p>
          LexiVault AI turns every PDF into a personal learning space —
          powered by private local AI, spaced repetition, and beautiful highlights.
        </p>
        <div className="auth-features">
          {[
            { icon: <Sparkles size={13} />, label: 'Local AI explanations' },
            { icon: <BookOpen size={13} />,  label: 'PDF highlights' },
            { icon: <Brain size={13} />,     label: 'Spaced repetition' },
            { icon: <Trophy size={13} />,    label: 'Smart quizzes' },
          ].map(f => (
            <div key={f.label} className="auth-feature-chip">
              {f.icon} {f.label}
            </div>
          ))}
        </div>
      </div>

      {/* Auth card */}
      <div className="auth-panel">
        <div className="auth-card">
          <h2>{isRegister ? 'Create your vault' : 'Welcome back'}</h2>
          <p>{isRegister ? 'Start collecting words that matter.' : 'Sign in to continue learning.'}</p>

          <form onSubmit={submit}>
            {isRegister && (
              <label>
                Full name
                <input className="input" value={name} onChange={e => setName(e.target.value)}
                  required minLength={2} placeholder="Your name" />
              </label>
            )}
            <label>
              Email address
              <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)}
                required placeholder="you@example.com" />
            </label>
            <label>
              Password
              <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)}
                required minLength={6} placeholder="At least 6 characters" />
            </label>
            {error && <p className="error-msg">{error}</p>}
            <button className="btn btn-primary btn-lg" disabled={loading} style={{ width: '100%' }}>
              {loading ? 'Please wait…' : isRegister ? 'Create account' : 'Sign in'}
            </button>
          </form>

          <div className="auth-divider">— or —</div>
          <button className="auth-switch" onClick={() => { setIsRegister(!isRegister); setError('') }}>
            {isRegister ? 'Already have an account? Sign in' : "New here? Create an account"}
          </button>
        </div>
      </div>
    </div>
  )
}
