import { ChangeEvent, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen, Clock, ExternalLink, FileUp, MoreVertical, Pencil, Timer, Trash2, X } from 'lucide-react'
import { Document, Page, pdfjs } from 'react-pdf'
import Shell from '../components/Shell'
import { api, DocumentInfo, ReadingStats } from '../api'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

function timeAgo(dateStr: string | null) {
  if (!dateStr) return 'Never opened'
  const diff = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 30) return `${days} days ago`
  return new Date(dateStr).toLocaleDateString()
}

function ThumbnailCapture({ docId, token, onCapture }: { docId: string; token: string; onCapture: () => void }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    let objectUrl = ''
    fetch(`http://localhost:8000/api/documents/${docId}/file`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.blob() : Promise.reject())
      .then(blob => { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl) })
      .catch(() => { })
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [docId, token])

  function captureThumb(canvas: HTMLCanvasElement | null) {
    if (!canvas) return
    const dataUrl = canvas.toDataURL('image/png', 0.7)
    api.saveThumbnail(docId, dataUrl).then(onCapture).catch(() => { })
  }

  if (!url) return null
  return (
    <div style={{ display: 'none' }}>
      <Document file={url}>
        <Page pageNumber={1} width={280} canvasRef={captureThumb} renderTextLayer={false} renderAnnotationLayer={false} />
      </Document>
    </div>
  )
}

export default function Library() {
  const [docs, setDocs] = useState<DocumentInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [menuOpen, setMenuOpen] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [thumbQueue, setThumbQueue] = useState<string[]>([])
  const [readingStats, setReadingStats] = useState<ReadingStats>({})
  const navigate = useNavigate()
  const token = localStorage.getItem('lexivault_token') || ''

  const refresh = () =>
    api.documents()
      .then(data => { setDocs(data); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })

  useEffect(() => {
    refresh()
    api.readingStats().then(setReadingStats).catch(() => {})
  }, [])

  function formatReadingTime(docId: string) {
    const stats = readingStats[docId]
    if (!stats || stats.total_seconds < 60) return null
    const m = Math.floor(stats.total_seconds / 60)
    const h = Math.floor(m / 60)
    if (h > 0) return `${h}h ${m % 60}m read`
    return `${m}m read`
  }

  // Queue docs without thumbnails for capture
  useEffect(() => {
    const needsThumb = docs.filter(d => !d.thumbnail_url).map(d => d.id)
    if (needsThumb.length > 0) setThumbQueue(needsThumb.slice(0, 3))
  }, [docs])

  async function upload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    setUploading(true)
    try {
      const uploaded = await api.upload(file)
      setDocs(prev => [uploaded, ...prev])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.')
    } finally { setUploading(false) }
  }

  async function deleteDoc(id: string) {
    if (!confirm('Delete this document and all its annotations?')) return
    try {
      await api.deleteDocument(id)
      setDocs(prev => prev.filter(d => d.id !== id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed.')
    }
    setMenuOpen(null)
  }

  async function saveRename(id: string) {
    if (!renameValue.trim()) return
    try {
      await api.renameDocument(id, renameValue.trim())
      setDocs(prev => prev.map(d => d.id === id ? { ...d, custom_name: renameValue.trim() } : d))
    } catch { /* ignore */ }
    setRenaming(null)
  }

  return (
    <Shell>
      {/* Hidden thumbnail captures */}
      {thumbQueue.map(id => (
        <ThumbnailCapture key={id} docId={id} token={token}
          onCapture={() => { setThumbQueue(q => q.filter(i => i !== id)); refresh() }} />
      ))}

      <div className="page-header">
        <div>
          <p className="eyebrow">Your Documents</p>
          <h1>My Library</h1>
          <p>All your uploaded PDFs, with reading progress and word counts.</p>
        </div>
        <label className="btn btn-primary" style={{ cursor: 'pointer' }}>
          <FileUp size={16} /> {uploading ? 'Uploading…' : 'Upload PDF'}
          <input type="file" accept="application/pdf" style={{ display: 'none' }} onChange={upload} />
        </label>
      </div>

      {error && <p className="error-msg" style={{ marginBottom: 20 }}>{error}</p>}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}>
          <div className="spinner" style={{ width: 36, height: 36 }} />
        </div>
      ) : docs.length === 0 ? (
        <div className="empty-state">
          <BookOpen size={48} />
          <h2>Your library is empty</h2>
          <p>Upload your first PDF to start building your vocabulary vault.</p>
          <label className="btn btn-primary btn-lg" style={{ cursor: 'pointer', marginTop: 8 }}>
            <FileUp size={16} /> Upload PDF
            <input type="file" accept="application/pdf" style={{ display: 'none' }} onChange={upload} />
          </label>
        </div>
      ) : (
        <div className="library-grid">
          {docs.map(doc => {
            const title = doc.custom_name || doc.original_name
            const isMenuOpen = menuOpen === doc.id
            const isRenaming = renaming === doc.id

            return (
              <div key={doc.id} className="doc-card">
                {/* Thumbnail */}
                <div className="doc-card-thumb"
                  onClick={() => navigate(`/reader/${doc.id}`)}>
                  {doc.thumbnail_url ? (
                    <img
                      src={`http://localhost:8000${doc.thumbnail_url}`}
                      alt={title}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={e => (e.currentTarget.style.display = 'none')}
                    />
                  ) : (
                    <div className="thumb-placeholder">
                      <BookOpen size={36} style={{ opacity: 0.3 }} />
                      <span>No preview</span>
                    </div>
                  )}
                  {/* Progress bar at bottom of thumbnail */}
                  <div className="doc-card-progress">
                    <div className="doc-card-progress-bar" style={{ width: `${doc.progress_percent}%` }} />
                  </div>
                </div>

                {/* Body */}
                <div className="doc-card-body">
                  {isRenaming ? (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input className="input" value={renameValue} autoFocus
                        onChange={e => setRenameValue(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') saveRename(doc.id); if (e.key === 'Escape') setRenaming(null) }}
                        style={{ fontSize: '0.82rem', padding: '6px 10px' }}
                      />
                      <button className="btn btn-sm btn-primary" onClick={() => saveRename(doc.id)}>Save</button>
                      <button className="btn btn-sm btn-secondary" onClick={() => setRenaming(null)}><X size={12} /></button>
                    </div>
                  ) : (
                    <div className="doc-card-title" title={title}>{title}</div>
                  )}

                  <div className="doc-card-meta">
                    <span className="doc-card-chip">
                      <BookOpen size={11} /> {doc.word_count} word{doc.word_count !== 1 ? 's' : ''}
                    </span>
                    {doc.total_pages > 0 && (
                      <span className="doc-card-chip">
                        📄 {doc.last_opened_page}/{doc.total_pages}
                      </span>
                    )}
                    {formatReadingTime(doc.id) && (
                      <span className="doc-card-chip">
                        <Timer size={11} /> {formatReadingTime(doc.id)}
                      </span>
                    )}
                  </div>

                  <div className="doc-card-chip">
                    <Clock size={11} /> {timeAgo(doc.last_opened_at)}
                  </div>
                </div>

                {/* Actions */}
                <div className="doc-card-actions" style={{ position: 'relative' }}>
                  <button className="btn btn-primary btn-sm"
                    onClick={() => navigate(`/reader/${doc.id}`)}>
                    <ExternalLink size={13} />
                    {doc.last_opened_page > 1 ? 'Continue Reading' : 'Open'}
                  </button>

                  <button className="btn btn-secondary btn-icon btn-sm"
                    onClick={() => setMenuOpen(isMenuOpen ? null : doc.id)}>
                    <MoreVertical size={15} />
                  </button>

                  {isMenuOpen && (
                    <div style={{
                      position: 'absolute', bottom: '110%', right: 0,
                      background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                      borderRadius: 12, padding: 8, minWidth: 160, zIndex: 20,
                      boxShadow: 'var(--shadow-md)',
                    }}>
                      <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'start', gap: 8, fontSize: '0.82rem' }}
                        onClick={() => { setRenaming(doc.id); setRenameValue(doc.custom_name || doc.original_name); setMenuOpen(null) }}>
                        <Pencil size={14} /> Rename
                      </button>
                      <button className="btn btn-danger" style={{ width: '100%', justifyContent: 'start', gap: 8, fontSize: '0.82rem', marginTop: 4 }}
                        onClick={() => deleteDoc(doc.id)}>
                        <Trash2 size={14} /> Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Shell>
  )
}
