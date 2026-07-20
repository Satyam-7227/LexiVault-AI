const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api'
export type Explanation = { word:string; meaning:string; simpleExplanation:string; synonyms:string[]; exampleSentence:string; difficulty:'Easy'|'Medium'|'Hard' }
export type Word = Explanation & { id:string; saved_at:string; needs_revision:boolean; revision_count:number; document_id?:string }
export type DocumentInfo = { id:string; original_name:string; uploaded_at:string }
const headers = () => ({ Authorization: `Bearer ${localStorage.getItem('lexivault_token') || ''}` })
async function request<T>(path:string, options:RequestInit = {}):Promise<T> { const response = await fetch(`${BASE}${path}`, { ...options, headers: { ...headers(), ...(options.headers || {}) } }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.detail || 'Something went wrong.'); return data }
export const api = {
  register: (body:{name:string,email:string,password:string}) => request<{token:string,user:{name:string,email:string}}>('/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),
  login: (body:{email:string,password:string}) => request<{token:string,user:{name:string,email:string}}>('/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),
  dashboard: () => request<{wordsLearned:number;reviseToday:number;newWordsSinceQuiz:number;lastQuizScore:number|null}>('/dashboard'),
  documents: () => request<DocumentInfo[]>('/documents'),
  upload: (file:File) => { const form=new FormData(); form.append('file',file); return request<DocumentInfo>('/documents',{method:'POST',body:form}) },
  explain: (word:string) => request<Explanation>('/ai/explain',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({word})}),
  save: (word:Explanation, documentId?:string) => request<Word>('/vocabulary',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...word,documentId})}),
  vocabulary: (search='') => request<Word[]>(`/vocabulary?search=${encodeURIComponent(search)}`),
  quiz: () => request<{quizId:string;questions:{wordId:string;word:string;choices:string[]}[]}>('/quiz'),
  submitQuiz: (quizId:string,answers:{wordId:string;selectedIndex:number}[]) => request<{score:number;total:number}>('/quiz/submit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({quizId,answers})}),
  fileUrl: (id:string) => `${BASE}/documents/${id}/file`
}
