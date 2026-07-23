import { useEffect, useMemo, useState } from 'react'
import { BookOpen, Download, FileText, Pencil, Search, Star, Trash2, X, Check } from 'lucide-react'
import Shell from '../components/Shell'
import { api, exportWordsToCSV, Word } from '../api'

const FILTERS = ['All', 'Favorites', 'Needs Review', 'Easy', 'Medium', 'Hard'] as const
type Filter = typeof FILTERS[number]

export default function Vocabulary() {
  const [words, setWords] = useState<Word[]>([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('All')
  const [error, setError] = useState('')

  // Inline note editing
  const [editingNote, setEditingNote] = useState<string | null>(null)  // word id
  const [noteValue, setNoteValue] = useState('')

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

  async function deleteWord(w: Word) {
    if (!confirm(`Remove "${w.word}" from your vault? This cannot be undone.`)) return
    try {
      await api.deleteWord(w.id)
      setWords(prev => prev.filter(x => x.id !== w.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed.')
    }
  }

  function startEditNote(w: Word) {
    setEditingNote(w.id)
    setNoteValue(w.notes || '')
  }

  async function saveNote(w: Word) {
    try {
      await api.patchWord(w.id, { notes: noteValue })
      setWords(prev => prev.map(x => x.id === w.id ? { ...x, notes: noteValue } : x))
    } catch { /* ignore */ }
    setEditingNote(null)
  }

  function cancelEditNote() {
    setEditingNote(null)
    setNoteValue('')
  }

  return (
    <Shell>
      <div className="page-header">
        <div>
          <p className="eyebrow">Personal Knowledge Base</p>
          <h1>Vocabulary Notebook</h1>
          <p>Every word you save, grouped by when you learned it.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div className="badge">{words.length} words</div>
          {words.length > 0 && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => exportWordsToCSV(filtered.length > 0 ? filtered : words)}
              title="Export vocabulary as CSV"
              style={{ gap: 6 }}
            >
              <Download size={14} /> Export CSV
            </button>
          )}
        </div>
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
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <span className={`pill ${w.difficulty.toLowerCase()}`}>{w.difficulty}</span>
                        <button className="btn btn-icon btn-ghost"
                          onClick={() => toggleFavorite(w)}
                          style={{ color: w.is_favorite ? 'var(--accent-yellow)' : 'var(--text-muted)', padding: 4 }}>
                          <Star size={13} fill={w.is_favorite ? 'currentColor' : 'none'} />
                        </button>
                        <button className="btn btn-icon btn-ghost"
                          onClick={() => deleteWord(w)}
                          style={{ color: 'var(--text-muted)', padding: 4 }}
                          title="Remove from vault">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    <div className="word-card-meaning">{w.meaning}</div>
                    <div className="word-card-phonetic" style={{ marginTop: 2, fontStyle: 'italic' }}>{w.exampleSentence}</div>

                    {/* Inline note section */}
                    {editingNote === w.id ? (
                      <div style={{ marginTop: 8 }}>
                        <textarea
                          className="input"
                          value={noteValue}
                          autoFocus
                          onChange={e => setNoteValue(e.target.value)}
                          rows={2}
                          placeholder="Your personal note…"
                          style={{ fontSize: '0.75rem', padding: '7px 10px', resize: 'vertical', width: '100%', boxSizing: 'border-box', marginBottom: 6 }}
                        />
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-primary btn-sm" style={{ gap: 4, flex: 1 }} onClick={() => saveNote(w)}>
                            <Check size={12} /> Save note
                          </button>
                          <button className="btn btn-secondary btn-sm" onClick={cancelEditNote}>
                            <X size={12} />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        style={{ marginTop: 6, cursor: 'pointer' }}
                        onClick={() => startEditNote(w)}
                        title="Click to edit note"
                      >
                        {w.notes ? (
                          <div style={{
                            fontSize: '0.72rem', color: 'var(--text-secondary)',
                            background: 'var(--bg-overlay)', borderRadius: 6, padding: '5px 8px',
                            display: 'flex', gap: 6, alignItems: 'start',
                          }}>
                            <FileText size={11} style={{ flexShrink: 0, marginTop: 2, color: 'var(--brand)' }} />
                            <span>{w.notes}</span>
                          </div>
                        ) : (
                          <div style={{
                            fontSize: '0.68rem', color: 'var(--text-muted)',
                            display: 'flex', alignItems: 'center', gap: 4,
                            opacity: 0.6,
                          }}>
                            <Pencil size={10} /> Add a note
                          </div>
                        )}
                      </div>
                    )}

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
          <p>Save words from the Reader and they will appear here.</p>
        </div>
      )}
    </Shell>
  )
}
