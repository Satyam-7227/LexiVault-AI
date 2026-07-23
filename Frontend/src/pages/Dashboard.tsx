import { ChangeEvent, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Document, Page, pdfjs } from 'react-pdf'
import { BookOpen, Brain, Clock, FileUp, Flame, RotateCcw, Search, Sparkles, Trophy } from 'lucide-react'
import Shell from '../components/Shell'
import { api, DashboardStats, DocumentInfo, Explanation, TodayReading } from '../api'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

// Use local worker to avoid CORS issues with CDN
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

const cleanWord = (v: string) => v.trim().match(/[A-Za-z'-]+/)?.[0] || ''

const GREETING = () => {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats>({ wordsLearned: 0, reviseToday: 0, newWordsSinceQuiz: 0, lastQuizScore: null, reviewWords: [] })
  const [documents, setDocuments] = useState<DocumentInfo[]>([])
  const [doc, setDoc] = useState<DocumentInfo | null>(null)
  const [fileUrl, setFileUrl] = useState('')
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(0)
  const [word, setWord] = useState('')
  const [explanation, setExplanation] = useState<Explanation | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [msgType, setMsgType] = useState<'notice' | 'success'>('notice')
  // FSRS review
  const [reviewIdx, setReviewIdx] = useState(0)
  const [reviewFlipped, setReviewFlipped] = useState(false)
  // Reading stats
  const [streak, setStreak] = useState(0)
  const [todayReading, setTodayReading] = useState<TodayReading>({ today_seconds: 0, today_minutes: 0 })
  const DAILY_GOAL_MINUTES = 30
  const navigate = useNavigate()
  const token = localStorage.getItem('lexivault_token') || ''

  const refresh = () =>
    Promise.all([
      api.dashboard().then(setStats),
      api.documents().then(setDocuments),
    ]).catch(e => showMsg(e.message, 'notice'))

  useEffect(() => {
    refresh()
    api.analyticsOverview().then(d => setStreak(d.streak_days)).catch(() => {})
    api.todayReading().then(setTodayReading).catch(() => {})
  }, [])

  // Load PDF blob when doc changes
  useEffect(() => {
    let active = true; let objectUrl = ''
    if (!doc) { setFileUrl(''); return }
    fetch(api.fileUrl(doc.id), { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.blob() : Promise.reject())
      .then(blob => { objectUrl = URL.createObjectURL(blob); if (active) setFileUrl(objectUrl) })
      .catch(() => showMsg('Unable to load this PDF.', 'notice'))
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [doc?.id, token])

  function showMsg(msg: string, type: 'notice' | 'success') {
    setMessage(msg); setMsgType(type)
    setTimeout(() => setMessage(''), 5000)
  }

  async function upload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    setLoading(true)
    try {
      const uploaded = await api.upload(file)
      setDocuments(items => [uploaded, ...items])
      setDoc(uploaded)
      showMsg('PDF uploaded. Select a word or use the lookup box.', 'notice')
    } catch (err) {
      showMsg(err instanceof Error ? err.message : 'Upload failed.', 'notice')
    } finally { setLoading(false) }
  }

  async function lookup(candidate = word) {
    const selected = cleanWord(candidate)
    if (!selected) { showMsg('Enter or select a single English word.', 'notice'); return }
    setWord(selected); setLoading(true)
    try { setExplanation(await api.explain(selected)) }
    catch (err) { showMsg(err instanceof Error ? err.message : 'AI request failed.', 'notice') }
    finally { setLoading(false) }
  }

  async function save() {
    if (!explanation) return
    setLoading(true)
    try {
      await api.save(explanation, doc?.id)
      showMsg(`"${explanation.word}" saved to your vocabulary.`, 'success')
      setExplanation(null); refresh()
    } catch (err) {
      showMsg(err instanceof Error ? err.message : 'Unable to save word.', 'notice')
    } finally { setLoading(false) }
  }

  function captureSelection() {
    const selected = cleanWord(window.getSelection()?.toString() || '')
    if (selected) lookup(selected)
  }

  // FSRS review handlers
  async function handleReview(rating: 1 | 2 | 3 | 4) {
    const w = stats.reviewWords[reviewIdx]
    if (!w) return
    try {
      await api.submitReview(w.id, rating)
      if (reviewIdx + 1 < stats.reviewWords.length) {
        setReviewIdx(i => i + 1); setReviewFlipped(false)
      } else {
        refresh(); setReviewIdx(0); setReviewFlipped(false)
      }
    } catch { /* ignore */ }
  }

  const reviewWord = stats.reviewWords[reviewIdx]

  return (
    <Shell>
      {/* Page header */}
      <div className="page-header">
        <div>
          <p className="eyebrow">Your Learning Space</p>
          <h1>{GREETING()}, {localStorage.getItem('lexivault_name')?.split(' ')[0] || 'Learner'}.</h1>
          <p>Read, discover, and keep every important word.</p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/quiz')}>
          <Trophy size={16} /> Quiz room
        </button>
      </div>

      {/* Stats */}
      <div className="stat-grid">
        {[
          { icon: <BookOpen size={18} />, label: 'Words learned',   value: stats.wordsLearned },
          { icon: <RotateCcw size={18} />, label: 'Due for review', value: stats.reviseToday },
          { icon: <Brain size={18} />,    label: 'New since quiz',  value: `${stats.newWordsSinceQuiz}/5` },
          { icon: <Trophy size={18} />,   label: 'Last quiz',       value: stats.lastQuizScore !== null ? `${stats.lastQuizScore}/5` : '—' },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-card-icon">{s.icon}</div>
            <div className="stat-card-value">{s.value}</div>
            <div className="stat-card-label">{s.label}</div>
          </div>
        ))}

        {/* Reading streak card */}
        <div className="stat-card" style={{ position: 'relative', overflow: 'hidden' }}>
          <div className="stat-card-icon" style={{ color: 'var(--accent-yellow)' }}><Flame size={18} /></div>
          <div className="stat-card-value" style={{ color: streak > 0 ? 'var(--accent-yellow)' : undefined }}>
            {streak} {streak === 1 ? 'day' : 'days'}
          </div>
          <div className="stat-card-label">Vocab streak</div>
        </div>

        {/* Today's reading goal card */}
        <div className="stat-card" style={{ position: 'relative', overflow: 'hidden' }}>
          <div className="stat-card-icon" style={{ color: 'var(--accent-blue)' }}><Clock size={18} /></div>
          <div className="stat-card-value">
            {todayReading.today_minutes.toFixed(0)}<span style={{ fontSize: '0.9rem', fontWeight: 500 }}>/{DAILY_GOAL_MINUTES}m</span>
          </div>
          <div className="stat-card-label">Today's goal</div>
          {/* Mini progress bar */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, height: 3,
            background: 'var(--bg-elevated)',
          }}>
            <div style={{
              height: '100%',
              width: `${Math.min((todayReading.today_minutes / DAILY_GOAL_MINUTES) * 100, 100)}%`,
              background: todayReading.today_minutes >= DAILY_GOAL_MINUTES ? 'var(--accent-green)' : 'var(--accent-blue)',
              borderRadius: 4, transition: 'width 0.6s ease',
            }} />
          </div>
        </div>
      </div>

      {/* FSRS Inline Review Section */}
      {stats.reviewWords.length > 0 && (
        <div className="review-section">
          <div className="review-section-header">
            <div>
              <p className="eyebrow">Today's Review</p>
              <h2 style={{ fontSize: '1.1rem', marginTop: 4 }}>
                {stats.reviewWords.length} word{stats.reviewWords.length > 1 ? 's' : ''} due
              </h2>
            </div>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
              {reviewIdx + 1} / {stats.reviewWords.length}
            </span>
          </div>

          {reviewWord && (
            <div
              className={`review-card-flip ${reviewFlipped ? 'flipped' : ''}`}
              onClick={() => !reviewFlipped && setReviewFlipped(true)}
              style={{ maxWidth: 560 }}
            >
              <div className="review-card-inner">
                <div className="review-card-front">
                  <span className={`pill ${reviewWord.difficulty.toLowerCase()}`} style={{ marginBottom: 12 }}>
                    {reviewWord.difficulty}
                  </span>
                  <div className="review-word">{reviewWord.word}</div>
                  {reviewWord.phonetic && <div className="review-phonetic">{reviewWord.phonetic}</div>}
                  <div className="review-hint">Click to reveal meaning</div>
                </div>

                <div className="review-card-back" onClick={e => e.stopPropagation()}>
                  <div className="review-meaning">{reviewWord.meaning}</div>
                  <div className="review-ratings">
                    {([
                      { rating: 1 as const, label: 'Again',  cls: 'again' },
                      { rating: 2 as const, label: 'Hard',   cls: 'hard' },
                      { rating: 3 as const, label: 'Good',   cls: 'good' },
                      { rating: 4 as const, label: 'Easy',   cls: 'easy' },
                    ]).map(r => (
                      <button key={r.rating} className={`review-rating-btn ${r.cls}`}
                        onClick={() => handleReview(r.rating)}>
                        {r.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* PDF Workspace */}
      <div className="workspace" style={{ marginTop: 28 }}>
        {/* Viewer */}
        <div className="viewer-card">
          <div className="viewer-header">
            <div>
              <h2>Study document</h2>
              <p>{doc?.custom_name || doc?.original_name || 'Upload a PDF to begin'}</p>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {documents.length > 0 && (
                <select
                  style={{ fontSize: '0.78rem', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px', color: 'var(--text-primary)' }}
                  value={doc?.id || ''}
                  onChange={e => setDoc(documents.find(d => d.id === e.target.value) || null)}
                >
                  <option value="">Choose PDF</option>
                  {documents.map(d => <option key={d.id} value={d.id}>{d.custom_name || d.original_name}</option>)}
                </select>
              )}
              <label className="upload-label">
                <FileUp size={15} /> {loading ? 'Working…' : 'Upload'}
                <input type="file" accept="application/pdf" onChange={upload} />
              </label>
            </div>
          </div>

          <div className="pdf-wrap" onMouseUp={captureSelection}>
            {fileUrl ? (
              <Document file={fileUrl}
                onLoadSuccess={({ numPages }) => { setPages(numPages); setPage(1) }}
                loading={<div className="spinner" />}>
                <Page pageNumber={page} width={560} />
              </Document>
            ) : (
              <div className="pdf-empty">
                <FileUp size={40} />
                <h3>Bring your study material</h3>
                <p>Upload a PDF. Select any word to look it up with AI.</p>
              </div>
            )}
          </div>

          {pages > 1 && (
            <div className="pager">
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
              <span>Page {page} of {pages}</span>
              <button disabled={page === pages} onClick={() => setPage(p => p + 1)}>Next →</button>
            </div>
          )}
        </div>

        {/* AI Assistant */}
        <div className="assistant-card">
          <div className="assistant-header">
            <div className="spark-icon"><Sparkles size={16} /></div>
            <div>
              <h2>AI Word Assistant</h2>
              <p>Powered locally by Ollama</p>
            </div>
          </div>

          <div className="assistant-body">
            <div className="lookup-bar">
              <input value={word} onChange={e => setWord(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && lookup()}
                placeholder="Search a word…" />
              <button onClick={() => lookup()} disabled={loading}>
                <Search size={17} />
              </button>
            </div>

            {message && <p className={msgType === 'success' ? 'success-msg' : 'notice'}>{message}</p>}

            {explanation ? (
              <div className="explanation-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                  <div>
                    <div className="explanation-word">{explanation.word}</div>
                    {explanation.phonetic && <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{explanation.phonetic}</div>}
                    {explanation.partOfSpeech && <div style={{ fontSize: '0.72rem', color: 'var(--brand)', marginTop: 2 }}>{explanation.partOfSpeech}</div>}
                  </div>
                  <span className={`pill ${explanation.difficulty.toLowerCase()}`}>{explanation.difficulty}</span>
                </div>

                <div className="explanation-section">
                  <h4>Meaning</h4><p>{explanation.meaning}</p>
                </div>
                <div className="explanation-section">
                  <h4>Simple words</h4><p>{explanation.simpleExplanation}</p>
                </div>
                <div className="explanation-section">
                  <h4>Example</h4><p style={{ fontStyle: 'italic' }}>{explanation.exampleSentence}</p>
                </div>
                <div>
                  <h4 style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: 8 }}>Synonyms</h4>
                  <div className="synonym-chips">
                    {explanation.synonyms.map(s => <span key={s} className="synonym-chip">{s}</span>)}
                  </div>
                </div>
                {explanation.cached && (
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>✓ Already in your vault</p>
                )}
                {!explanation.cached && (
                  <button className="btn btn-primary" onClick={save} disabled={loading} style={{ width: '100%' }}>
                    Save to vocabulary
                  </button>
                )}
              </div>
            ) : (
              <div className="empty-assistant">
                <Brain size={36} />
                <h3>Discover a new word</h3>
                <p>Click a word in your PDF, or type it above.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </Shell>
  )
}
