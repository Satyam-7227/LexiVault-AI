const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api'

// ── Types ──────────────────────────────────────────────────────────────────
export type Difficulty = 'Easy' | 'Medium' | 'Hard'

export type Explanation = {
  word: string
  meaning: string
  simpleExplanation: string
  synonyms: string[]
  exampleSentence: string
  difficulty: Difficulty
  phonetic: string
  partOfSpeech: string
  cached?: boolean
}

export type Word = Explanation & {
  id: string
  saved_at: string
  needs_revision: boolean
  revision_count: number
  document_id?: string
  source_page?: number
  notes: string
  tags: string[]
  is_favorite: boolean
  next_review_at?: string
  stability?: number
}

export type DocumentInfo = {
  id: string
  original_name: string
  custom_name: string | null
  uploaded_at: string
  last_opened_at: string | null
  last_opened_page: number
  total_pages: number
  progress_percent: number
  thumbnail_url: string | null
  word_count: number
}

export type Annotation = {
  id: string
  document_id: string
  vocabulary_id: string
  word: string
  page_number: number
  text_start_offset: number
  text_end_offset: number
  surrounding_text: string
  highlight_color: string
  created_at: string
}

export type DashboardStats = {
  wordsLearned: number
  reviseToday: number
  newWordsSinceQuiz: number
  lastQuizScore: number | null
  reviewWords: { id: string; word: string; meaning: string; difficulty: Difficulty; phonetic: string }[]
}

export type AnalyticsOverview = {
  total_words: number
  revise_today: number
  words_this_week: number
  words_this_month: number
  streak_days: number
  quiz_accuracy: number
  last_quiz_score: number | null
  last_quiz_total: number | null
}

// ── HTTP helper ────────────────────────────────────────────────────────────
const headers = () => ({ Authorization: `Bearer ${localStorage.getItem('lexivault_token') || ''}` })

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { ...headers(), ...(options.headers || {}) },
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.detail || 'Something went wrong.')
  return data
}

// ── API client ─────────────────────────────────────────────────────────────
export const api = {
  // Auth
  register: (body: { name: string; email: string; password: string }) =>
    request<{ token: string; user: { name: string; email: string } }>('/auth/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }),
  login: (body: { email: string; password: string }) =>
    request<{ token: string; user: { name: string; email: string } }>('/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }),
  me: () => request<{ id: string; name: string; email: string }>('/auth/me'),

  // Dashboard
  dashboard: () => request<DashboardStats>('/dashboard'),

  // Documents
  documents: () => request<DocumentInfo[]>('/documents'),
  document: (id: string) => request<DocumentInfo>(`/documents/${id}`),
  upload: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return request<DocumentInfo>('/documents', { method: 'POST', body: form })
  },
  updateProgress: (id: string, current_page: number, total_pages: number) =>
    request<{ ok: boolean }>(`/documents/${id}/progress`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current_page, total_pages }),
    }),
  renameDocument: (id: string, name: string) =>
    request<{ ok: boolean }>(`/documents/${id}/rename`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
    }),
  saveThumbnail: (id: string, thumbnail: string) =>
    request<{ ok: boolean; thumbnail_url: string }>(`/documents/${id}/thumbnail`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ thumbnail }),
    }),
  deleteDocument: (id: string) => request<{ ok: boolean }>(`/documents/${id}`, { method: 'DELETE' }),
  fileUrl: (id: string) => `${BASE}/documents/${id}/file`,
  thumbnailUrl: (id: string) => `${BASE}/documents/${id}/thumbnail`,

  // Vocabulary
  explain: (word: string, context?: string) =>
    request<Explanation>('/ai/explain', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ word, context }),
    }),
  save: (word: Explanation, documentId?: string) =>
    request<Word>('/vocabulary', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...word, documentId }),
    }),
  vocabulary: (params?: { search?: string; tag?: string; favorites_only?: boolean; document_id?: string }) => {
    const q = new URLSearchParams()
    if (params?.search) q.set('search', params.search)
    if (params?.tag) q.set('tag', params.tag)
    if (params?.favorites_only) q.set('favorites_only', 'true')
    if (params?.document_id) q.set('document_id', params.document_id)
    return request<Word[]>(`/vocabulary?${q.toString()}`)
  },
  patchWord: (id: string, patch: { notes?: string; tags?: string[]; is_favorite?: boolean; phonetic?: string; part_of_speech?: string }) =>
    request<Word>(`/vocabulary/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
    }),
  reviewQueue: () => request<Word[]>('/vocabulary/review'),
  submitReview: (id: string, rating: 1 | 2 | 3 | 4) =>
    request<{ ok: boolean; next_review_at: string; interval_days: number }>(`/vocabulary/${id}/review`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rating }),
    }),

  // Annotations
  annotations: (documentId: string) => request<Annotation[]>(`/annotations?document_id=${documentId}`),
  createAnnotation: (body: {
    document_id: string; vocabulary_id: string; word: string; page_number: number;
    text_start_offset: number; text_end_offset: number; surrounding_text: string;
  }) =>
    request<Annotation>('/annotations', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }),
  deleteAnnotation: (id: string) => request<{ ok: boolean }>(`/annotations/${id}`, { method: 'DELETE' }),

  // Quiz
  quiz: (documentId?: string) => {
    const q = documentId ? `?document_id=${documentId}` : ''
    return request<{ quizId: string; questions: { wordId: string; word: string; choices: string[] }[] }>(`/quiz${q}`)
  },
  submitQuiz: (quizId: string, answers: { wordId: string; selectedIndex: number }[]) =>
    request<{ score: number; total: number }>('/quiz/submit', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quizId, answers }),
    }),

  // Analytics
  analyticsOverview: () => request<AnalyticsOverview>('/analytics/overview'),
  analyticsHeatmap: () => request<{ date: string; count: number }[]>('/analytics/heatmap'),
  analyticsDifficulty: () => request<Record<string, number>>('/analytics/difficulty'),
  analyticsDocuments: () => request<{ document_id: string; document_name: string; word_count: number; progress_percent: number }[]>('/analytics/documents'),
  analyticsWeakest: () => request<{ id: string; word: string; difficulty: string; revision_count: number; needs_revision: boolean }[]>('/analytics/weakest'),
  analyticsQuizTrend: () => request<{ date: string; score: number; total: number; accuracy: number }[]>('/analytics/quiz-trend'),
}
