import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Document, Page, pdfjs } from 'react-pdf'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  ArrowLeft, Bookmark, BookmarkCheck, BookmarkPlus, BookOpen,
  ChevronRight, Clock, ExternalLink, Filter, RotateCcw,
  Search, Sparkles, Trash2, X
} from 'lucide-react'
import { api, Annotation, Bookmark as BookmarkType, DocumentInfo, Explanation } from '../api'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

// Local worker — no CORS
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

const cleanWord = (v: string) => v.trim().match(/[A-Za-z'-]+/)?.[0] || ''
const PAGE_GAP = 16

// Difficulty highlight colors (CSS rgba)
const DIFF_COLORS: Record<string, string> = {
  Easy:   'rgba(16,185,129,0.38)',
  Medium: 'rgba(245,158,11,0.38)',
  Hard:   'rgba(239,68,68,0.38)',
}

type CachedEntry = Explanation & { color: string; id?: string; savedInDb?: boolean }
type HighlightFilter = 'All' | 'Easy' | 'Medium' | 'Hard'
type SidebarTab = 'info' | 'bookmarks'

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return s > 0 ? `${m}m ${s}s` : `${m}m`
}

export default function Reader() {
  const { documentId } = useParams<{ documentId: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = localStorage.getItem('lexivault_token') || ''

  // Document state
  const [docInfo, setDocInfo] = useState<DocumentInfo | null>(null)
  const [fileUrl, setFileUrl]   = useState('')
  const [numPages, setNumPages] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageWidth, setPageWidth]     = useState(700)
  const [jumpTo, setJumpTo]           = useState('')

  // AI panel
  const [panelOpen, setPanelOpen]     = useState(false)
  const [word, setWord]               = useState('')
  const [explanation, setExplanation] = useState<Explanation | null>(null)
  const [aiLoading, setAiLoading]     = useState(false)
  const [aiMsg, setAiMsg]             = useState('')
  const [savedMsg, setSavedMsg]       = useState('')
  const [noteInput, setNoteInput]     = useState('')

  // Highlight system — keyed by lowercase word
  const [cachedMap, setCachedMap] = useState<Record<string, CachedEntry>>({})
  const [hlFilter, setHlFilter]   = useState<HighlightFilter>('All')

  // Popup for clicking highlighted words
  const [popupData, setPopupData] = useState<{
    word: string; entry: CachedEntry; x: number; y: number
  } | null>(null)

  // Recently looked up
  const [recentWords, setRecentWords] = useState<string[]>([])

  // Bookmarks
  const [bookmarks, setBookmarks]       = useState<BookmarkType[]>([])
  const [bookmarkNote, setBookmarkNote] = useState('')
  const [sidebarTab, setSidebarTab]     = useState<SidebarTab>('info')

  // Annotations (DB)
  const [annotations, setAnnotations] = useState<Annotation[]>([])

  // Reading session timer
  const sessionStartRef = useRef<number>(Date.now())
  const startPageRef    = useRef<number>(1)

  // Refs
  const scrollRef  = useRef<HTMLDivElement>(null)
  const saveTimer  = useRef<ReturnType<typeof setTimeout>>()
  const didJump    = useRef(false)

  // ── Virtualizer ──────────────────────────────────────────────────────────
  const estimatePageHeight = useCallback(
    () => Math.round(pageWidth * 1.4142) + PAGE_GAP,
    [pageWidth],
  )
  const virtualizer = useVirtualizer({
    count:            numPages,
    getScrollElement: () => scrollRef.current,
    estimateSize:     estimatePageHeight,
    overscan:         2,
  })

  // ── Build highlight pattern from cachedMap + filter ──────────────────────
  const activeWords = Object.entries(cachedMap)
    .filter(([, e]) => hlFilter === 'All' || e.difficulty === hlFilter)
    .map(([k]) => k)

  // ── Text renderer — apply colored highlights ─────────────────────────────
  const textRenderer = useCallback((textItem: any) => {
    const str = textItem.str
    if (activeWords.length === 0) return str

    const pattern = activeWords
      .sort((a, b) => b.length - a.length)
      .map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|')
    if (!pattern) return str

    const regex = new RegExp(`(${pattern})`, 'gi')
    return str.replace(regex, (match: string) => {
      const entry = cachedMap[match.toLowerCase()]
      const color = entry?.color || 'rgba(99,102,241,0.35)'
      return `<mark class="highlight-word" data-word="${match}" style="background:${color};border-radius:3px;padding:1px 0;cursor:pointer;">${match}</mark>`
    })
  }, [activeWords, cachedMap])

  // ── Click handler for highlighted words ──────────────────────────────────
  useEffect(() => {
    const container = scrollRef.current
    if (!container) return

    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('.word-popup') && !target.matches('.highlight-word')) {
        setPopupData(null)
      }
      if (target.matches('.highlight-word')) {
        const w = target.getAttribute('data-word')
        if (w) {
          const entry = cachedMap[w.toLowerCase()]
          if (entry) {
            const rect = target.getBoundingClientRect()
            setPopupData({ word: w, entry, x: rect.left + rect.width / 2, y: rect.bottom + 8 })
          } else {
            setWord(w)
            setPanelOpen(true)
            handleLookup(w)
          }
        }
      }
    }

    container.addEventListener('click', onClick)
    return () => container.removeEventListener('click', onClick)
  }, [scrollRef, cachedMap])

  // ── Load document info ────────────────────────────────────────────────────
  useEffect(() => {
    if (!documentId) return
    api.document(documentId).then(setDocInfo).catch(console.error)

    let objectUrl = ''
    fetch(api.fileUrl(documentId), { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.blob() : Promise.reject('Fetch failed'))
      .then(blob => { objectUrl = URL.createObjectURL(blob); setFileUrl(objectUrl) })
      .catch(() => setAiMsg('Unable to load PDF.'))
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [documentId, token])

  // ── Load saved vocab → populate highlight map (PERSISTENT HIGHLIGHTS) ────
  useEffect(() => {
    if (!documentId) return
    // Load ALL user vocab (not just this doc) so all known words are highlighted
    api.vocabulary().then(words => {
      const map: Record<string, CachedEntry> = {}
      words.forEach(w => {
        map[w.word.toLowerCase()] = {
          word: w.word,
          meaning: w.meaning,
          simpleExplanation: w.simpleExplanation,
          synonyms: w.synonyms || [],
          exampleSentence: w.exampleSentence,
          difficulty: w.difficulty,
          phonetic: w.phonetic,
          partOfSpeech: w.partOfSpeech,
          color: DIFF_COLORS[w.difficulty] || DIFF_COLORS.Medium,
          id: w.id,
          savedInDb: true,
        }
      })
      setCachedMap(map)
    }).catch(console.error)
  }, [documentId])

  // ── Load bookmarks ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!documentId) return
    api.bookmarks(documentId).then(setBookmarks).catch(console.error)
  }, [documentId])

  // ── Load annotations ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!documentId) return
    api.annotations(documentId).then(setAnnotations).catch(console.error)
  }, [documentId])

  // ── Reading session tracker — log on unmount ──────────────────────────────
  useEffect(() => {
    if (!documentId) return
    sessionStartRef.current = Date.now()
    startPageRef.current = currentPage

    return () => {
      const durationSeconds = Math.floor((Date.now() - sessionStartRef.current) / 1000)
      if (durationSeconds >= 5) {
        api.logReadingSession({
          document_id: documentId,
          duration_seconds: durationSeconds,
          pages_read: Math.abs(currentPage - startPageRef.current),
        }).catch(() => {})
      }
    }
  }, [documentId])

  // ── Jump to saved page once PDF loads ─────────────────────────────────────
  useEffect(() => {
    if (!docInfo || numPages === 0 || didJump.current) return
    const target = parseInt(searchParams.get('page') || String(docInfo.last_opened_page || 1))
    if (target > 1 && target <= numPages) {
      setTimeout(() => {
        virtualizer.scrollToIndex(target - 1, { align: 'start' })
        setCurrentPage(target)
      }, 100)
    }
    didJump.current = true
  }, [docInfo, numPages])

  // ── Responsive page width ──────────────────────────────────────────────────
  useEffect(() => {
    const update = () => {
      if (!scrollRef.current) return
      const avail = scrollRef.current.clientWidth - 48
      setPageWidth(Math.min(Math.max(avail, 400), 860))
    }
    update()
    const ro = new ResizeObserver(update)
    if (scrollRef.current) ro.observe(scrollRef.current)
    return () => ro.disconnect()
  }, [])

  // ── IntersectionObserver — track visible page ─────────────────────────────
  useEffect(() => {
    if (!numPages || !scrollRef.current) return
    const observer = new IntersectionObserver(
      entries => {
        const best = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        if (!best) return
        const pg = parseInt(best.target.getAttribute('data-page') || '1')
        setCurrentPage(pg)
        clearTimeout(saveTimer.current)
        saveTimer.current = setTimeout(() => {
          if (documentId && numPages > 0)
            api.updateProgress(documentId, pg, numPages).catch(() => {})
        }, 1000)
      },
      { root: scrollRef.current, threshold: 0.3 },
    )
    scrollRef.current.querySelectorAll('[data-page]').forEach(el => observer.observe(el))
    return () => observer.disconnect()
  }, [numPages, virtualizer.getVirtualItems().length, documentId])

  // ── Text selection → lookup ───────────────────────────────────────────────
  const captureSelection = useCallback(() => {
    const sel = cleanWord(window.getSelection()?.toString() || '')
    if (!sel) return
    setWord(sel)
    setPanelOpen(true)
    handleLookup(sel)
  }, [])

  async function handleLookup(candidate = word) {
    const sel = cleanWord(candidate)
    if (!sel) return
    setWord(sel); setAiLoading(true); setAiMsg(''); setExplanation(null); setNoteInput('')

    const lowerSel = sel.toLowerCase()

    // Add to recently looked up (max 5, no duplicates)
    setRecentWords(prev => [lowerSel, ...prev.filter(w => w !== lowerSel)].slice(0, 5))

    // Serve from cache if available
    if (cachedMap[lowerSel]) {
      setExplanation(cachedMap[lowerSel])
      setAiLoading(false)
      setPanelOpen(true)
      return
    }

    try {
      const exp = await api.explain(sel)
      setExplanation(exp)
      setCachedMap(prev => ({
        ...prev,
        [lowerSel]: {
          ...exp,
          color: DIFF_COLORS[exp.difficulty] || DIFF_COLORS.Medium,
          savedInDb: false,
        }
      }))
    }
    catch (e) { setAiMsg(e instanceof Error ? e.message : 'AI error.') }
    finally { setAiLoading(false) }
  }

  async function handleSave() {
    if (!explanation || !documentId) return
    setAiLoading(true)
    try {
      // Pass note directly in the save call — no separate PATCH needed
      const saved = await api.save(explanation, documentId, noteInput.trim() || undefined)

      // Auto-create annotation record
      await api.createAnnotation({
        document_id: documentId,
        vocabulary_id: saved.id,
        word: saved.word,
        page_number: currentPage,
        text_start_offset: 0,
        text_end_offset: 0,
        surrounding_text: '',
        note: noteInput.trim(),
      }).catch(() => {})

      // Update local highlight map
      const color = DIFF_COLORS[saved.difficulty] || DIFF_COLORS.Medium
      setCachedMap(prev => ({
        ...prev,
        [saved.word.toLowerCase()]: {
          ...explanation,
          color,
          id: saved.id,
          savedInDb: true,
        }
      }))
      setSavedMsg(`"${explanation.word}" saved!`)
      setTimeout(() => setSavedMsg(''), 3000)
      setExplanation(null)
      setNoteInput('')
    } catch (e) { setAiMsg(e instanceof Error ? e.message : 'Save failed.') }
    finally { setAiLoading(false) }
  }

  async function handleRemoveWord(wordKey: string) {
    const entry = cachedMap[wordKey]
    if (!entry?.id) return
    try {
      await api.deleteWord(entry.id)
      setCachedMap(prev => {
        const next = { ...prev }
        delete next[wordKey]
        return next
      })
      setPopupData(null)
      setSavedMsg(`"${entry.word}" removed from vault.`)
      setTimeout(() => setSavedMsg(''), 3000)
    } catch { /* ignore */ }
  }

  function handleJump(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return
    const v = parseInt(jumpTo)
    if (v >= 1 && v <= numPages) {
      virtualizer.scrollToIndex(v - 1, { align: 'start' })
      setCurrentPage(v)
    }
  }

  async function addBookmark() {
    if (!documentId) return
    try {
      const bm = await api.createBookmark({
        document_id: documentId,
        page_number: currentPage,
        note: bookmarkNote.trim(),
      })
      setBookmarks(prev => {
        const exists = prev.find(b => b.page_number === currentPage)
        if (exists) return prev.map(b => b.page_number === currentPage ? bm : b)
        return [...prev, bm].sort((a, b) => a.page_number - b.page_number)
      })
      setBookmarkNote('')
      setSavedMsg(`Bookmark added on page ${currentPage}!`)
      setTimeout(() => setSavedMsg(''), 2500)
    } catch { /* ignore */ }
  }

  async function removeBookmark(id: string) {
    try {
      await api.deleteBookmark(id)
      setBookmarks(prev => prev.filter(b => b.id !== id))
    } catch { /* ignore */ }
  }

  function jumpToBookmark(pageNum: number) {
    virtualizer.scrollToIndex(pageNum - 1, { align: 'start' })
    setCurrentPage(pageNum)
  }

  const currentPageHasBookmark = bookmarks.some(b => b.page_number === currentPage)
  const progress = numPages > 0 ? Math.round((currentPage / numPages) * 100) : 0
  const virtualItems = virtualizer.getVirtualItems()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-base)', overflow: 'hidden' }}>

      {/* ── Top bar ────────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '0 16px', height: 56, flexShrink: 0,
        background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)',
      }}>
        <button className="btn btn-ghost btn-icon" onClick={() => navigate('/library')}>
          <ArrowLeft size={18} />
        </button>

        {/* Title */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {docInfo?.custom_name || docInfo?.original_name || 'Loading…'}
          </div>
        </div>

        {/* Highlight filter pills */}
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <Filter size={13} style={{ color: 'var(--text-muted)', marginRight: 2 }} />
          {(['All', 'Easy', 'Medium', 'Hard'] as HighlightFilter[]).map(f => (
            <button
              key={f}
              onClick={() => setHlFilter(f)}
              style={{
                padding: '3px 8px', borderRadius: 20, fontSize: '0.68rem', fontWeight: 600,
                border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                background: hlFilter === f
                  ? (f === 'All' ? 'var(--brand)' : f === 'Easy' ? 'var(--accent-green)' : f === 'Medium' ? 'var(--accent-yellow)' : 'var(--accent-red)')
                  : 'var(--bg-elevated)',
                color: hlFilter === f ? '#fff' : 'var(--text-muted)',
              }}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Bookmark current page */}
        <button
          className="btn btn-ghost btn-icon"
          title={currentPageHasBookmark ? 'Bookmarked' : 'Bookmark this page'}
          onClick={() => { setSidebarTab('bookmarks'); if (!currentPageHasBookmark) addBookmark() }}
          style={{ color: currentPageHasBookmark ? 'var(--accent-yellow)' : undefined }}
        >
          {currentPageHasBookmark ? <BookmarkCheck size={18} /> : <BookmarkPlus size={18} />}
        </button>

        <button
          className="btn btn-ghost btn-icon"
          title="AI Word Assistant"
          onClick={() => setPanelOpen(p => !p)}
          style={{ color: panelOpen ? 'var(--brand)' : undefined }}>
          <Sparkles size={18} />
        </button>
      </div>

      {/* ── Body ──────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* Scrollable PDF canvas */}
        <div
          ref={scrollRef}
          onMouseUp={captureSelection}
          style={{
            flex: 1,
            overflowY: 'auto',
            overflowX: 'hidden',
            background: 'var(--bg-base)',
            padding: '24px 0',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          {fileUrl ? (
            <Document
              file={fileUrl}
              onLoadSuccess={({ numPages: n }) => { setNumPages(n) }}
              loading={
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 400 }}>
                  <div className="spinner" style={{ width: 40, height: 40 }} />
                </div>
              }
              error={
                <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
                  <p style={{ fontWeight: 700, color: 'var(--text-secondary)' }}>Failed to render PDF</p>
                  <p style={{ fontSize: '0.82rem', marginTop: 8 }}>Make sure the PDF is text-based and under 20 MB.</p>
                </div>
              }
            >
              <div style={{ height: virtualizer.getTotalSize(), width: pageWidth, position: 'relative' }}>
                {virtualItems.map(vi => (
                  <div
                    key={vi.index}
                    data-page={vi.index + 1}
                    style={{
                      position: 'absolute',
                      top: vi.start,
                      left: 0,
                      width: '100%',
                      paddingBottom: PAGE_GAP,
                    }}
                  >
                    <div style={{ boxShadow: 'var(--shadow-md)', borderRadius: 4, overflow: 'hidden', lineHeight: 0, position: 'relative' }}>
                      <Page
                        pageNumber={vi.index + 1}
                        width={pageWidth}
                        renderTextLayer={true}
                        renderAnnotationLayer={true}
                        customTextRenderer={textRenderer}
                        loading={
                          <div style={{ height: Math.round(pageWidth * 1.4142), background: 'var(--bg-elevated)', display: 'grid', placeItems: 'center' }}>
                            <div className="spinner" />
                          </div>
                        }
                      />
                      {/* Bookmark indicator on page */}
                      {bookmarks.some(b => b.page_number === vi.index + 1) && (
                        <div style={{
                          position: 'absolute', top: 8, right: 8,
                          background: 'var(--accent-yellow)', color: '#000',
                          borderRadius: 6, padding: '2px 8px', fontSize: '0.65rem',
                          fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4,
                        }}>
                          <Bookmark size={10} /> {bookmarks.find(b => b.page_number === vi.index + 1)?.note || 'Bookmark'}
                        </div>
                      )}
                    </div>
                    <div style={{ textAlign: 'center', padding: '6px 0', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                      Page {vi.index + 1}
                    </div>
                  </div>
                ))}
              </div>
            </Document>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
              {aiMsg ? (
                <div style={{ textAlign: 'center', padding: 40, maxWidth: 360 }}>
                  <BookOpen size={40} style={{ color: 'var(--brand)', opacity: 0.3, margin: '0 auto 12px' }} />
                  <p style={{ fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8 }}>Could not load PDF</p>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{aiMsg}</p>
                </div>
              ) : (
                <div className="spinner" style={{ width: 40, height: 40 }} />
              )}
            </div>
          )}
        </div>

        {/* ── Right sidebar ──────────────────────────────────────────────── */}
        <div className="reader-sidebar" style={{ width: 340, flexShrink: 0 }}>

          {/* Sidebar tab bar */}
          <div className="reader-sidebar-header" style={{ padding: 0 }}>
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
              {(['info', 'bookmarks'] as SidebarTab[]).map(tab => (
                <button
                  key={tab}
                  onClick={() => setSidebarTab(tab)}
                  style={{
                    flex: 1, padding: '14px 0', border: 'none', cursor: 'pointer',
                    background: 'transparent', fontSize: '0.78rem', fontWeight: 600,
                    color: sidebarTab === tab ? 'var(--brand)' : 'var(--text-muted)',
                    borderBottom: sidebarTab === tab ? '2px solid var(--brand)' : '2px solid transparent',
                    transition: 'all 0.15s', textTransform: 'capitalize',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}
                >
                  {tab === 'info' ? <BookOpen size={13} /> : <Bookmark size={13} />}
                  {tab === 'info' ? 'Document' : 'Bookmarks'}
                  {tab === 'bookmarks' && bookmarks.length > 0 && (
                    <span style={{
                      background: 'var(--accent-yellow)', color: '#000',
                      borderRadius: 10, padding: '1px 6px', fontSize: '0.62rem', fontWeight: 700
                    }}>{bookmarks.length}</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* ── INFO TAB ─────────────────────────────────────────────────── */}
          {sidebarTab === 'info' && (
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto', flex: 1 }}>
              {/* Progress */}
              <div className="chart-card" style={{ padding: 14 }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 4 }}>Reading progress</div>
                <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--brand)' }}>{progress}%</div>
                <div className="reader-progress-bar" style={{ marginTop: 6 }}>
                  <div className="reader-progress-fill" style={{ width: `${progress}%` }} />
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>
                  Page {currentPage} of {numPages}
                </div>
              </div>

              {/* Stats row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div className="chart-card" style={{ padding: 12 }}>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: 2 }}>Words saved</div>
                  <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{docInfo?.word_count || 0}</div>
                </div>
                <div className="chart-card" style={{ padding: 12 }}>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: 2 }}>Highlights</div>
                  <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{Object.keys(cachedMap).length}</div>
                </div>
              </div>

              {/* Jump to page */}
              <div>
                <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Jump to page</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input className="input" type="number" min={1} max={numPages || 1}
                    value={jumpTo}
                    onChange={e => setJumpTo(e.target.value)}
                    style={{ padding: '7px 10px', fontSize: '0.82rem' }}
                    onKeyDown={handleJump} />
                  <button className="btn btn-secondary btn-sm" onClick={() => handleJump({ key: 'Enter' } as any)}>
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>

              {/* Recently looked up */}
              {recentWords.length > 0 && (
                <div>
                  <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <RotateCcw size={11} /> Recent lookups
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {recentWords.map(w => (
                      <button
                        key={w}
                        onClick={() => { setWord(w); setPanelOpen(true); handleLookup(w) }}
                        style={{
                          padding: '3px 10px', borderRadius: 20, fontSize: '0.72rem',
                          border: '1px solid var(--border)', background: 'var(--bg-elevated)',
                          color: 'var(--text-secondary)', cursor: 'pointer',
                          transition: 'all 0.15s',
                        }}
                      >{w}</button>
                    ))}
                  </div>
                </div>
              )}

              {/* Highlight legend */}
              <div>
                <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Highlight legend</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {[{ label: 'Easy', color: DIFF_COLORS.Easy }, { label: 'Medium', color: DIFF_COLORS.Medium }, { label: 'Hard', color: DIFF_COLORS.Hard }].map(d => (
                    <div key={d.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      <div style={{ width: 16, height: 10, borderRadius: 2, background: d.color, flexShrink: 0 }} />
                      {d.label}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── BOOKMARKS TAB ─────────────────────────────────────────────── */}
          {sidebarTab === 'bookmarks' && (
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto', flex: 1 }}>
              {/* Add bookmark form */}
              <div className="chart-card" style={{ padding: 12 }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  Bookmark page {currentPage}
                </div>
                <input
                  className="input"
                  placeholder="Add a note (optional)…"
                  value={bookmarkNote}
                  onChange={e => setBookmarkNote(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addBookmark()}
                  style={{ fontSize: '0.78rem', padding: '7px 10px', marginBottom: 8 }}
                />
                <button className="btn btn-primary btn-sm" style={{ width: '100%' }} onClick={addBookmark}>
                  <BookmarkPlus size={13} /> Bookmark current page
                </button>
              </div>

              {/* Bookmark list */}
              {bookmarks.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                  <Bookmark size={28} style={{ opacity: 0.3, margin: '0 auto 8px', display: 'block' }} />
                  No bookmarks yet
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {bookmarks.map(bm => (
                    <div key={bm.id} className="chart-card" style={{
                      padding: 10, display: 'flex', alignItems: 'center', gap: 8,
                      cursor: 'pointer',
                    }} onClick={() => jumpToBookmark(bm.page_number)}>
                      <div style={{
                        width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                        background: 'rgba(245,158,11,0.15)', display: 'grid', placeItems: 'center',
                        color: 'var(--accent-yellow)',
                      }}>
                        <Bookmark size={14} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: '0.78rem' }}>Page {bm.page_number}</div>
                        {bm.note && <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bm.note}</div>}
                      </div>
                      <button
                        className="btn btn-ghost btn-icon btn-sm"
                        style={{ flexShrink: 0 }}
                        onClick={e => { e.stopPropagation(); removeBookmark(bm.id) }}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── AI Panel (shown when open, overlays sidebar bottom) ───────── */}
          {panelOpen && (
            <div style={{
              borderTop: '1px solid var(--border)',
              padding: 14, display: 'flex', flexDirection: 'column', gap: 10,
              maxHeight: '55%', overflowY: 'auto', flexShrink: 0,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Sparkles size={14} style={{ color: 'var(--brand)' }} />
                  <span style={{ fontWeight: 700, fontSize: '0.82rem' }}>Word Lookup</span>
                </div>
                <button className="btn btn-ghost btn-icon btn-sm" onClick={() => { setPanelOpen(false); setExplanation(null) }}>
                  <X size={14} />
                </button>
              </div>

              <div className="lookup-bar" style={{ margin: 0 }}>
                <input value={word} onChange={e => setWord(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleLookup()}
                  placeholder="Type a word…" style={{ fontSize: '0.8rem' }} />
                <button onClick={() => handleLookup()} disabled={aiLoading}>
                  <Search size={14} />
                </button>
              </div>

              {aiLoading && <div className="spinner" style={{ alignSelf: 'center' }} />}
              {aiMsg && <p className="notice" style={{ fontSize: '0.75rem' }}>{aiMsg}</p>}
              {savedMsg && <p className="success-msg" style={{ fontSize: '0.75rem' }}>{savedMsg}</p>}

              {explanation && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: '1.05rem' }}>{explanation.word}</div>
                      {explanation.phonetic && <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{explanation.phonetic}</div>}
                      {explanation.partOfSpeech && <div style={{ fontSize: '0.65rem', color: 'var(--brand)', marginTop: 2, fontWeight: 600 }}>{explanation.partOfSpeech}</div>}
                    </div>
                    <span className={`pill ${explanation.difficulty.toLowerCase()}`}>{explanation.difficulty}</span>
                  </div>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>{explanation.meaning}</p>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic', margin: 0 }}>{explanation.exampleSentence}</p>

                  {!explanation.cached && (
                    <>
                      {/* Note field */}
                      <div>
                        <div style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>Your note (optional)</div>
                        <textarea
                          className="input"
                          placeholder="Add a personal note…"
                          value={noteInput}
                          onChange={e => setNoteInput(e.target.value)}
                          rows={2}
                          style={{ fontSize: '0.75rem', padding: '7px 10px', resize: 'vertical', width: '100%', boxSizing: 'border-box' }}
                        />
                      </div>
                      <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={aiLoading}>
                        Save to vocabulary
                      </button>
                    </>
                  )}
                  {explanation.cached && (
                    <p style={{ fontSize: '0.68rem', color: 'var(--accent-green)' }}>✓ Already in your vault</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Floating Word Popup ─────────────────────────────────────────────── */}
      {popupData && (
        <div className="word-popup" style={{
          position: 'fixed',
          top: popupData.y,
          left: popupData.x,
          transform: 'translateX(-50%)',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-strong)',
          borderRadius: 10,
          boxShadow: 'var(--shadow-xl)',
          padding: 14,
          width: 300,
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}>
          <button
            className="btn btn-ghost btn-icon btn-sm"
            style={{ position: 'absolute', top: 8, right: 8 }}
            onClick={() => setPopupData(null)}
          >
            <X size={13} />
          </button>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', paddingRight: 20 }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: '1rem' }}>{popupData.entry.word}</div>
              {popupData.entry.phonetic && <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{popupData.entry.phonetic}</div>}
              {popupData.entry.partOfSpeech && <div style={{ fontSize: '0.62rem', color: 'var(--brand)', fontWeight: 600 }}>{popupData.entry.partOfSpeech}</div>}
            </div>
            <span className={`pill ${popupData.entry.difficulty.toLowerCase()}`}>{popupData.entry.difficulty}</span>
          </div>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>{popupData.entry.meaning}</p>
          {popupData.entry.exampleSentence && (
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontStyle: 'italic', margin: 0 }}>"{popupData.entry.exampleSentence}"</p>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
            <button
              className="btn btn-secondary btn-sm"
              style={{ flex: 1, fontSize: '0.7rem', gap: 4 }}
              onClick={() => navigate('/vocabulary')}
            >
              <ExternalLink size={11} /> Open in Vault
            </button>
            {popupData.entry.savedInDb && (
              <button
                className="btn btn-sm"
                style={{
                  flex: 1, fontSize: '0.7rem', gap: 4,
                  background: 'rgba(239,68,68,0.15)', color: 'var(--accent-red)',
                  border: '1px solid rgba(239,68,68,0.25)',
                }}
                onClick={() => handleRemoveWord(popupData.word.toLowerCase())}
              >
                <Trash2 size={11} /> Remove
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
