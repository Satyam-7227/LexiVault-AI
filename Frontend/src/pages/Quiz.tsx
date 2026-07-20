import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { BookOpen, Brain, Trophy } from 'lucide-react'
import Shell from '../components/Shell'
import { api } from '../api'

export default function Quiz() {
  const [questions, setQuestions] = useState<{ wordId: string; word: string; choices: string[] }[]>([])
  const [answers, setAnswers] = useState<number[]>([])
  const [quizId, setQuizId] = useState('')
  const [result, setResult] = useState<{ score: number; total: number } | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [current, setCurrent] = useState(0)
  const [revealed, setRevealed] = useState(false)

  useEffect(() => {
    api.quiz()
      .then(q => {
        setQuestions(q.questions)
        setQuizId(q.quizId)
        setAnswers(Array(q.questions.length).fill(-1))
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  async function submit() {
    try {
      setResult(await api.submitQuiz(quizId, questions.map((q, i) => ({ wordId: q.wordId, selectedIndex: answers[i] }))))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not submit quiz.')
    }
  }

  function selectChoice(choiceIndex: number) {
    if (revealed) return
    setAnswers(a => a.map((v, j) => j === current ? choiceIndex : v))
    setRevealed(true)
  }

  function next() {
    if (current < questions.length - 1) { setCurrent(c => c + 1); setRevealed(false) }
    else submit()
  }

  if (loading) return <Shell><div style={{ padding: 60, display: 'flex', justifyContent: 'center' }}><div className="spinner" style={{ width: 36, height: 36 }} /></div></Shell>

  if (error) return (
    <Shell>
      <div className="empty-state">
        <Trophy size={48} />
        <h2>Quiz room is almost ready</h2>
        <p>{error}</p>
      </div>
    </Shell>
  )

  if (result) return (
    <Shell>
      <div className="result-card">
        <Trophy size={48} style={{ color: 'var(--accent-yellow)', margin: '0 auto 16px' }} />
        <p className="eyebrow">Quiz Complete</p>
        <div className="result-score">{result.score}/{result.total}</div>
        <p className="result-label">
          {result.score === result.total ? '🎉 Perfect score!' : result.score >= result.total / 2 ? '👍 Good work!' : '📚 Keep studying!'}
        </p>
        <p style={{ color: 'var(--text-muted)', marginTop: 12, fontSize: '0.875rem' }}>Review missed words in your notebook.</p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 28 }}>
          <NavLink to="/vocabulary" className="btn btn-secondary">Open vocabulary</NavLink>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>Take another quiz</button>
        </div>
      </div>
    </Shell>
  )

  const q = questions[current]
  const chosen = answers[current]

  return (
    <Shell>
      <div className="page-header">
        <div>
          <p className="eyebrow">Recall Practice</p>
          <h1>Quiz Room</h1>
          <p>Choose the best meaning for each word.</p>
        </div>
      </div>

      <div className="quiz-container">
        {/* Progress */}
        <div className="quiz-progress">
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>
            Question {current + 1} of {questions.length}
          </span>
          <div className="quiz-progress-bar">
            <div className="quiz-progress-fill" style={{ width: `${((current + 1) / questions.length) * 100}%` }} />
          </div>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            {answers.filter(a => a !== -1).length} answered
          </span>
        </div>

        <div className="quiz-card">
          <div className="quiz-word">What does <em>{q.word}</em> mean?</div>
          <p className="quiz-question">Select the correct definition</p>

          <div className="quiz-choices">
            {q.choices.map((c, idx) => {
              let cls = ''
              if (revealed && chosen === idx) cls = 'selected'
              return (
                <button key={c} className={`quiz-choice ${cls}`}
                  onClick={() => selectChoice(idx)}>
                  <span className="quiz-choice-key">{String.fromCharCode(65 + idx)}</span>
                  <span>{c}</span>
                </button>
              )
            })}
          </div>

          {revealed && (
            <button className="btn btn-primary" style={{ marginTop: 20, width: '100%' }} onClick={next}>
              {current < questions.length - 1 ? 'Next question →' : 'Submit quiz'}
            </button>
          )}
        </div>
      </div>
    </Shell>
  )
}
