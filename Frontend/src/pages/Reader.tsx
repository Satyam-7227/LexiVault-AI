import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Document, Page, pdfjs } from 'react-pdf'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ArrowLeft, BookOpen, ChevronRight, Search, Sparkles, X } from 'lucide-react'
import { api, DocumentInfo, Explanation } from '../api'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

// Local worker — no CORS
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

const cleanWord = (v: string) => v.trim().match(/[A-Za-z'-]+/)?.[0] || ''
const PAGE_GAP = 16   // px gap between pages

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

  // Refs
  const scrollRef  = useRef<HTMLDivElement>(null)   // the scrollable canvas
  const saveTimer  = useRef<ReturnType<typeof setTimeout>>()
  const didJump    = useRef(false)

  // ── Virtualizer ─────────────────────────────────────────────────────────
  // Estimate height from A4 aspect ratio + gap
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

  // ── Load document info ───────────────────────────────────────────────────
  useEffect(() => {
    if (!documentId) return
    api.document(documentId).then(setDocInfo).catch(console.error)

    let objectUrl = ''
    fetch(api.fileUrl(documentId), { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.blob() : Promise.reject('Fetch failed'))
      .then(blob => { objectUrl = URL.createObjectURL(blob); setFileUrl(objectUrl) })
      .catch(() => setAiMsg('Unable to load PDF. Make sure you uploaded a valid PDF.'))
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [documentId, token])

  // ── Jump to saved page once PDF loads ───────────────────────────────────
  useEffect(() => {
    if (!docInfo || numPages === 0 || didJump.current) return
    const target = parseInt(searchParams.get('page') || String(docInfo.last_opened_page || 1))
    if (target > 1 && target <= numPages) {
      // Small delay to let virtualizer settle
      setTimeout(() => {
        virtualizer.scrollToIndex(target - 1, { align: 'start' })
        setCurrentPage(target)
      }, 100)
    }
    didJump.current = true
  }, [docInfo, numPages])

  // ── Responsive page width ────────────────────────────────────────────────
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

  // ── IntersectionObserver — track visible page ────────────────────────────
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
    // Observe all rendered page wrappers
    scrollRef.current.querySelectorAll('[data-page]').forEach(el => observer.observe(el))
    return () => observer.disconnect()
  }, [numPages, virtualizer.getVirtualItems().length, documentId])

  // ── Text selection → lookup ──────────────────────────────────────────────
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
    setWord(sel); setAiLoading(true); setAiMsg(''); setExplanation(null)
    try { setExplanation(await api.explain(sel)) }
    catch (e) { setAiMsg(e instanceof Error ? e.message : 'AI error.') }
    finally { setAiLoading(false) }
  }

  async function handleSave() {
    if (!explanation) return
    setAiLoading(true)
    try {
      await api.save(explanation, documentId)
      setSavedMsg(`"${explanation.word}" saved!`)
      setTimeout(() => setSavedMsg(''), 3000)
      setExplanation(null)
    } catch (e) { setAiMsg(e instanceof Error ? e.message : 'Save failed.') }
    finally { setAiLoading(false) }
  }

  function handleJump(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return
    const v = parseInt(jumpTo)
    if (v >= 1 && v <= numPages) {
      virtualizer.scrollToIndex(v - 1, { align: 'start' })
      setCurrentPage(v)
    }
  }

  const progress = numPages > 0 ? Math.round((currentPage / numPages) * 100) : 0
  const virtualItems = virtualizer.getVirtualItems()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-base)', overflow: 'hidden' }}>

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '0 20px', height: 56, flexShrink: 0,
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

        <button
          className="btn btn-ghost btn-icon"
          title="AI Word Assistant"
          onClick={() => setPanelOpen(p => !p)}
          style={{ color: panelOpen ? 'var(--brand)' : undefined }}>
          <Sparkles size={18} />
        </button>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────── */}
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
              {/* Virtualizer container — must be inside Document for Page context */}
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
                    <div style={{ boxShadow: 'var(--shadow-md)', borderRadius: 4, overflow: 'hidden', lineHeight: 0 }}>
                      <Page
                        pageNumber={vi.index + 1}
                        width={pageWidth}
                        renderTextLayer={true}
                        renderAnnotationLayer={true}
                        loading={
                          <div style={{ height: Math.round(pageWidth * 1.4142), background: 'var(--bg-elevated)', display: 'grid', placeItems: 'center' }}>
                            <div className="spinner" />
                          </div>
                        }
                      />
                    </div>
                    {/* Page number label */}
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

        {/* ── Right sidebar ─────────────────────────────────────────────── */}
        <div className="reader-sidebar" style={{ width: 340, flexShrink: 0 }}>
          <div className="reader-sidebar-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <BookOpen size={16} style={{ color: 'var(--brand)' }} />
              <span style={{ fontWeight: 700, fontSize: '0.875rem' }}>Document Info</span>
            </div>
          </div>

          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto', flex: 1 }}>
            {/* Progress ring placeholder + info */}
            <div className="chart-card" style={{ padding: 16 }}>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 6 }}>Reading progress</div>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--brand)' }}>{progress}%</div>
              <div className="reader-progress-bar" style={{ marginTop: 8 }}>
                <div className="reader-progress-fill" style={{ width: `${progress}%` }} />
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 6 }}>
                Page {currentPage} of {numPages}
              </div>
            </div>

            <div className="chart-card" style={{ padding: 16 }}>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 4 }}>Words saved from this doc</div>
              <div style={{ fontWeight: 700 }}>{docInfo?.word_count || 0} words</div>
            </div>

            {/* Jump to page */}
            <div>
              <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Jump to page</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input className="input" type="number" min={1} max={numPages || 1}
                  value={jumpTo}
                  onChange={e => setJumpTo(e.target.value)}
                  style={{ padding: '8px 10px', fontSize: '0.82rem' }}
                  onKeyDown={handleJump} />
                <button className="btn btn-secondary btn-sm" onClick={() => handleJump({ key: 'Enter' } as any)}>
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </div>

          {/* AI panel (shown when open) */}
          {panelOpen && (
            <div style={{
              borderTop: '1px solid var(--border)',
              padding: 16, display: 'flex', flexDirection: 'column', gap: 12,
              maxHeight: '50%', overflowY: 'auto',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Sparkles size={15} style={{ color: 'var(--brand)' }} />
                  <span style={{ fontWeight: 700, fontSize: '0.875rem' }}>Word Lookup</span>
                </div>
                <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setPanelOpen(false)}>
                  <X size={15} />
                </button>
              </div>
              
              <div className="lookup-bar" style={{ margin: 0 }}>
                <input value={word} onChange={e => setWord(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleLookup()}
                  placeholder="Type a word…" style={{ fontSize: '0.82rem' }} />
                <button onClick={() => handleLookup()} disabled={aiLoading}>
                  <Search size={15} />
                </button>
              </div>

              {aiLoading && <div className="spinner" style={{ alignSelf: 'center' }} />}
              {aiMsg && <p className="notice" style={{ fontSize: '0.78rem' }}>{aiMsg}</p>}
              {savedMsg && <p className="success-msg" style={{ fontSize: '0.78rem' }}>{savedMsg}</p>}

              {explanation && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: '1.1rem' }}>{explanation.word}</div>
                      {explanation.phonetic && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{explanation.phonetic}</div>}
                      {explanation.partOfSpeech && <div style={{ fontSize: '0.68rem', color: 'var(--brand)', marginTop: 2, fontWeight: 600 }}>{explanation.partOfSpeech}</div>}
                    </div>
                    <span className={`pill ${explanation.difficulty.toLowerCase()}`}>{explanation.difficulty}</span>
                  </div>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{explanation.meaning}</p>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>{explanation.exampleSentence}</p>
                  {!explanation.cached && (
                    <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={aiLoading}>
                      Save to vocabulary
                    </button>
                  )}
                  {explanation.cached && <p style={{ fontSize: '0.72rem', color: 'var(--accent-green)' }}>✓ Already in your vault</p>}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
