import { useEffect, useState } from 'react'
import { BarChart2, BookOpen, Brain, Calendar, TrendingUp, Zap } from 'lucide-react'
import {
  BarChart, Bar, LineChart, Line,
  PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts'
import Shell from '../components/Shell'
import { api, AnalyticsOverview } from '../api'

const COLORS = { Easy: '#10b981', Medium: '#f59e0b', Hard: '#ef4444' }
const BRAND = '#6366f1'

function HeatmapChart({ data }: { data: { date: string; count: number }[] }) {
  const map = new Map(data.map(d => [d.date, d.count]))
  const max = Math.max(...data.map(d => d.count), 1)

  // Build last 365 days
  const days: { date: string; count: number; level: number }[] = []
  for (let i = 364; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    const count = map.get(key) || 0
    const level = count === 0 ? 0 : Math.ceil((count / max) * 5)
    days.push({ date: key, count, level })
  }

  return (
    <div>
      <div className="heatmap-grid">
        {days.map(d => (
          <div key={d.date} className="heatmap-cell" data-level={d.level}
            title={`${d.date}: ${d.count} word${d.count !== 1 ? 's' : ''}`} />
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
        Less
        {[0, 1, 2, 3, 4, 5].map(l => (
          <div key={l} className="heatmap-cell" data-level={l} />
        ))}
        More
      </div>
    </div>
  )
}

export default function Analytics() {
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null)
  const [heatmap, setHeatmap] = useState<{ date: string; count: number }[]>([])
  const [difficulty, setDifficulty] = useState<Record<string, number>>({})
  const [quizTrend, setQuizTrend] = useState<{ date: string; accuracy: number }[]>([])
  const [weakest, setWeakest] = useState<{ id: string; word: string; difficulty: string; revision_count: number }[]>([])
  const [docStats, setDocStats] = useState<{ document_name: string; word_count: number; progress_percent: number }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.analyticsOverview(),
      api.analyticsHeatmap(),
      api.analyticsDifficulty(),
      api.analyticsQuizTrend(),
      api.analyticsWeakest(),
      api.analyticsDocuments(),
    ]).then(([ov, hm, diff, qt, wk, ds]) => {
      setOverview(ov); setHeatmap(hm); setDifficulty(diff)
      setQuizTrend(qt.map(q => ({ date: new Date(q.date).toLocaleDateString('en', { month: 'short', day: 'numeric' }), accuracy: q.accuracy })))
      setWeakest(wk); setDocStats(ds)
    }).catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const pieData = Object.entries(difficulty).map(([name, value]) => ({ name, value }))
  const statCards = overview ? [
    { icon: <BookOpen size={18} />, label: 'Total words',     value: overview.total_words },
    { icon: <Zap size={18} />,      label: 'Day streak',      value: `${overview.streak_days}🔥` },
    { icon: <TrendingUp size={18}/>, label: 'Words this week', value: overview.words_this_week },
    { icon: <Brain size={18} />,    label: 'Quiz accuracy',   value: `${overview.quiz_accuracy}%` },
  ] : []

  if (loading) return (
    <Shell>
      <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}>
        <div className="spinner" style={{ width: 36, height: 36 }} />
      </div>
    </Shell>
  )

  return (
    <Shell>
      <div className="page-header">
        <div>
          <p className="eyebrow">Your Progress</p>
          <h1>Analytics</h1>
          <p>Track your vocabulary growth and learning habits.</p>
        </div>
      </div>

      {/* Overview stat cards */}
      <div className="stat-grid" style={{ marginBottom: 24 }}>
        {statCards.map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-card-icon">{s.icon}</div>
            <div className="stat-card-value">{s.value}</div>
            <div className="stat-card-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Heatmap — full width */}
      <div className="chart-card analytics-wide" style={{ marginBottom: 20 }}>
        <div className="chart-title">
          <Calendar size={16} style={{ display: 'inline', marginRight: 8 }} />
          Learning Activity
          <span className="chart-subtitle">— last 12 months</span>
        </div>
        <HeatmapChart data={heatmap} />
      </div>

      <div className="analytics-grid">
        {/* Quiz trend */}
        <div className="chart-card">
          <div className="chart-title"><TrendingUp size={16} style={{ display: 'inline', marginRight: 8 }} />Quiz Accuracy Trend</div>
          {quizTrend.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={quizTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8 }} />
                <Line type="monotone" dataKey="accuracy" stroke={BRAND} strokeWidth={2} dot={{ fill: BRAND, r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty-state" style={{ padding: '30px 0' }}>
              <p style={{ fontSize: '0.82rem' }}>Take quizzes to see your accuracy trend.</p>
            </div>
          )}
        </div>

        {/* Difficulty donut */}
        <div className="chart-card">
          <div className="chart-title"><BarChart2 size={16} style={{ display: 'inline', marginRight: 8 }} />Word Difficulty</div>
          {pieData.length > 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
              <ResponsiveContainer width={160} height={160}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={48} outerRadius={72} dataKey="value">
                    {pieData.map(entry => (
                      <Cell key={entry.name} fill={COLORS[entry.name as keyof typeof COLORS] || BRAND} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {pieData.map(d => (
                  <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem' }}>
                    <div style={{ width: 10, height: 10, borderRadius: 3, background: COLORS[d.name as keyof typeof COLORS] || BRAND }} />
                    <span style={{ color: 'var(--text-secondary)' }}>{d.name}</span>
                    <strong style={{ color: 'var(--text-primary)' }}>{d.value}</strong>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="empty-state" style={{ padding: '30px 0' }}>
              <p style={{ fontSize: '0.82rem' }}>Save words to see your difficulty breakdown.</p>
            </div>
          )}
        </div>

        {/* Per document bar chart */}
        {docStats.length > 0 && (
          <div className="chart-card analytics-wide">
            <div className="chart-title">Words per Document</div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={docStats} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                <YAxis dataKey="document_name" type="category" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} width={140} />
                <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8 }} />
                <Bar dataKey="word_count" fill={BRAND} radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Weakest words */}
        {weakest.length > 0 && (
          <div className="chart-card analytics-wide">
            <div className="chart-title">Weakest Words — Need More Practice</div>
            <div style={{ display: 'grid', gap: 8 }}>
              {weakest.map(w => (
                <div key={w.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 14px', background: 'var(--bg-elevated)',
                  borderRadius: 10, border: '1px solid var(--border)',
                }}>
                  <span className={`pill ${w.difficulty.toLowerCase()}`}>{w.difficulty}</span>
                  <strong style={{ color: 'var(--text-primary)', flex: 1 }}>{w.word}</strong>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    {w.revision_count} review{w.revision_count !== 1 ? 's' : ''}
                  </span>
                  <span className="revision-badge">Needs revision</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Shell>
  )
}
