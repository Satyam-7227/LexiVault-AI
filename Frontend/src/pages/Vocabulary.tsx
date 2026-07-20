import { useEffect, useMemo, useState } from 'react'
import { BookOpen, Search, Star } from 'lucide-react'
import Shell from '../components/Shell'
import { api, Word } from '../api'

const FILTERS = ['All', 'Favorites', 'Needs Review', 'Easy', 'Medium', 'Hard'] as const
type Filter = typeof FILTERS[number]

export default function Vocabulary() {
  const [words, setWords] = useState<Word[]>([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('All')
  const [error, setError] = useState('')

  useEffect(() => {
    api.vocabulary({ search })
      .then(setWords)
      .catch(e => setError(e.message))
  }, [search])

  const filtered = useMemo(() => {
    switch (filter) {
      case 'Favorites':    return words.filter(w => w.is_favorite)
      case 'Needs Review': return words.filter(w => w.needs_revision)
      case 'Easy':         return words.filter(w => w.difficulty === 'Easy')
      case 'Medium':       return words.filter(w => w.difficulty === 'Medium')
      case 'Hard':         return words.filter(w => w.difficulty === 'Hard')
      default:             return words
    }
  }, [words, filter])

  const groups = useMemo(() =>
    filtered.reduce<Record<string, Word[]>>((acc, w) => {
      const key = new Date(w.saved_at).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
      (acc[key] ??= []).push(w); return acc
    }, {}),
    [filtered]
  )

  async function toggleFavorite(w: Word) {
    try {
      await api.patchWord(w.id, { is_favorite: !w.is_favorite })
      setWords(prev => prev.map(x => x.id === w.id ? { ...x, is_favorite: !x.is_favorite } : x))
    } catch { /* ignore */ }
  }

  return (
    <Shell>
      <div className="page-header">
        <div>
          <p className="eyebrow">Personal Knowledge Base</p>
          <h1>Vocabulary Notebook</h1>
          <p>Every word you save, grouped by when you learned it.</p>
        </div>
        <div className="badge">{words.length} words</div>
      </div>

      {/* Filters + Search */}
      <div className="vocab-filters">
        <div className="search-bar">
          <Search size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search your saved words…" />
        </div>
        {FILTERS.map(f => (
          <button key={f} className={`filter-chip ${filter === f ? 'active' : ''}`}
            onClick={() => setFilter(f)}>{f}</button>
        ))}
      </div>

      {error && <p className="error-msg">{error}</p>}

      {Object.keys(groups).length > 0 ? (
        <div className="vocab-groups">
          {Object.entries(groups).map(([date, items]) => (
            <div key={date}>
              <div className="vocab-group-label">{date} · {items.length} word{items.length > 1 ? 's' : ''}</div>
              <div className="word-grid">
                {items.map(w => (
                  <div key={w.id} className={`word-card ${w.is_favorite ? 'favorited' : ''}`}>
                    <div className="word-card-header">
                      <div>
                        <div className="word-card-title">{w.word}</div>
                        {w.phonetic && <div className="word-card-phonetic">{w.phonetic}</div>}
                      </div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span className={`pill ${w.difficulty.toLowerCase()}`}>{w.difficulty}</span>
                        <button className="btn btn-icon btn-ghost"
                          onClick={() => toggleFavorite(w)}
                          style={{ color: w.is_favorite ? 'var(--accent-yellow)' : 'var(--text-muted)', padding: 4 }}>
                          <Star size={14} fill={w.is_favorite ? 'currentColor' : 'none'} />
                        </button>
                      </div>
                    </div>

                    <div className="word-card-meaning">{w.meaning}</div>
                    <div className="word-card-phonetic" style={{ marginTop: 2 }}>{w.exampleSentence}</div>

                    {(w.tags?.length ?? 0) > 0 && (
                      <div className="word-card-tags">
                        {w.tags?.map(t => <span key={t} className="tag-chip">{t}</span>)}
                      </div>
                    )}
                    {w.needs_revision && <span className="revision-badge">Needs revision</span>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <BookOpen size={48} />
          <h2>Your vault is waiting.</h2>
          <p>Save words from the Dashboard and they will appear here.</p>
        </div>
      )}
    </Shell>
  )
}
