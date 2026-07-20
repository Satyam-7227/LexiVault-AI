import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { BookOpen, Brain, BarChart2, ChevronDown, ChevronUp, Sparkles, FileUp, Zap, Trophy } from 'lucide-react'

const fadeUp = { hidden: { opacity: 0, y: 30 }, visible: { opacity: 1, y: 0 } }
const stagger = { visible: { transition: { staggerChildren: 0.12 } } }

const FEATURES = [
  { icon: <FileUp size={22} />, title: 'PDF Library', desc: 'Upload any PDF. Scroll through it naturally. Your reading progress is saved forever — pick up exactly where you left off.' },
  { icon: <Sparkles size={22} />, title: 'AI Word Explanations', desc: 'Select any word and get an instant, context-aware explanation powered by a local AI model. No data leaves your machine.' },
  { icon: <Brain size={22} />, title: 'Spaced Repetition', desc: 'Words you save are scheduled for smart review using FSRS — the same algorithm behind the world\'s best flashcard apps.' },
  { icon: <Trophy size={22} />, title: 'Multi-type Quizzes', desc: 'Test yourself with MCQs, fill-in-the-blanks, matching, and more. Each quiz adapts to your vocabulary vault.' },
  { icon: <BarChart2 size={22} />, title: 'Analytics Dashboard', desc: 'See your daily streak, quiz accuracy, weakest words, and a GitHub-style heatmap of your learning activity.' },
  { icon: <Zap size={22} />, title: 'PDF Highlights', desc: 'Every word you save is highlighted in the PDF with difficulty-based colors. Click any highlight for an instant popup.' },
]

const STEPS = [
  { num: '1', title: 'Upload a PDF', desc: 'Any textbook, paper, or article. Up to 20 MB.' },
  { num: '2', title: 'Select any word', desc: 'Click or highlight a word while reading.' },
  { num: '3', title: 'Learn with AI', desc: 'Get meaning, phonetics, synonyms, and an example — instantly.' },
  { num: '4', title: 'Revise forever', desc: 'FSRS schedules reviews so words stick long-term.' },
]

const FAQS = [
  { q: 'Is this free?', a: 'Yes — completely free. LexiVault AI runs entirely on your local machine using Ollama. No subscriptions, no API keys needed.' },
  { q: 'Is my data private?', a: 'Your PDFs and vocabulary stay on your computer. The AI model runs locally via Ollama, so nothing is sent to external servers.' },
  { q: 'Which AI model does it use?', a: 'By default, qwen2.5:3b via Ollama. You can change this in the backend settings.' },
  { q: 'What kind of PDFs work best?', a: 'Text-based PDFs (textbooks, articles, papers). Scanned image PDFs without OCR will not work.' },
  { q: 'How does spaced repetition work?', a: 'When you review a word and rate it (Easy/Good/Hard/Again), the next review is scheduled using the FSRS algorithm — harder words come back sooner.' },
]

export default function Landing() {
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  return (
    <div className="landing">
      {/* Nav */}
      <nav className="landing-nav">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="brand-mark" style={{ width: 32, height: 32, borderRadius: 9 }}>
            <BookOpen size={16} />
          </div>
          <span style={{ fontWeight: 800, fontSize: '1rem' }}>LexiVault <span style={{ color: 'var(--brand)' }}>AI</span></span>
        </div>
        <div className="nav-links">
          <a href="#features">Features</a>
          <a href="#how">How it works</a>
          <a href="#faq">FAQ</a>
          <Link to="/login" className="btn btn-secondary btn-sm">Sign in</Link>
          <Link to="/login" className="btn btn-primary btn-sm">Get started free</Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="hero">
        <div className="hero-glow" />
        <motion.div initial="hidden" animate="visible" variants={stagger}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <motion.div variants={fadeUp} className="hero-badge">
            <Sparkles size={12} /> Powered by local AI — completely private
          </motion.div>
          <motion.h1 variants={fadeUp}>
            Turn every PDF into a<br />
            <span className="gradient-text">vocabulary advantage.</span>
          </motion.h1>
          <motion.p variants={fadeUp}>
            LexiVault AI lets you read, highlight, and learn new words from any PDF —
            backed by spaced repetition, smart quizzes, and a beautiful reader that remembers your progress.
          </motion.p>
          <motion.div variants={fadeUp} className="hero-cta">
            <Link to="/login" className="btn btn-primary btn-lg">
              Start learning free →
            </Link>
            <a href="#features" className="btn btn-secondary btn-lg">See features</a>
          </motion.div>
        </motion.div>
      </section>

      {/* Features */}
      <section id="features" className="features-section">
        <div className="section-heading">
          <p className="eyebrow">Everything you need</p>
          <h2>Features built for serious learners</h2>
          <p>Every feature works together to create a complete vocabulary learning system.</p>
        </div>
        <motion.div className="features-grid"
          initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger}>
          {FEATURES.map(f => (
            <motion.div key={f.title} variants={fadeUp} className="feature-card">
              <div className="feature-icon">{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* How it works */}
      <section id="how" className="how-it-works">
        <div className="section-heading">
          <p className="eyebrow">Simple workflow</p>
          <h2>From PDF to fluent in four steps</h2>
        </div>
        <motion.div className="steps"
          initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger}>
          {STEPS.map(s => (
            <motion.div key={s.num} variants={fadeUp} className="step">
              <div className="step-num">{s.num}</div>
              <h3>{s.title}</h3>
              <p>{s.desc}</p>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* Stats */}
      <section style={{ padding: '80px 8%', textAlign: 'center', background: 'var(--bg-base)' }}>
        <div className="section-heading">
          <p className="eyebrow">Why it works</p>
          <h2>Science-backed learning</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24, maxWidth: 700, margin: '0 auto' }}>
          {[
            { stat: '90%', label: 'Retention rate with spaced repetition vs 20% passive reading' },
            { stat: '5×',  label: 'Faster vocabulary growth reading in context vs word lists' },
            { stat: '100%', label: 'Private — your data never leaves your machine' },
          ].map(s => (
            <div key={s.stat} style={{
              background: 'var(--bg-surface)', border: '1px solid var(--border)',
              borderRadius: 16, padding: '28px 20px',
            }}>
              <div style={{ fontSize: '2.5rem', fontWeight: 800, background: 'var(--brand-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{s.stat}</div>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginTop: 8 }}>{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="faq-section">
        <div className="section-heading" style={{ textAlign: 'left' }}>
          <p className="eyebrow">Questions</p>
          <h2>Frequently asked</h2>
        </div>
        {FAQS.map((faq, i) => (
          <div key={i} className="faq-item" onClick={() => setOpenFaq(openFaq === i ? null : i)}>
            <div className="faq-question">
              {faq.q}
              {openFaq === i ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </div>
            {openFaq === i && <div className="faq-answer">{faq.a}</div>}
          </div>
        ))}
      </section>

      {/* CTA banner */}
      <section style={{ padding: '80px 8%', textAlign: 'center', background: 'var(--bg-surface)', borderTop: '1px solid var(--border)' }}>
        <h2 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: 16 }}>Ready to build your vault?</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 32, maxWidth: 500, margin: '0 auto 32px' }}>
          Free, private, and running on your own machine. No subscription required.
        </p>
        <Link to="/login" className="btn btn-primary btn-lg">
          Get started — it's free →
        </Link>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className="brand-mark" style={{ width: 28, height: 28, borderRadius: 7 }}>
            <BookOpen size={14} />
          </div>
          <span style={{ fontWeight: 700 }}>LexiVault AI</span>
        </div>
        <span>© {new Date().getFullYear()} — All data stays on your machine.</span>
        <div style={{ display: 'flex', gap: 20 }}>
          <a href="#features" style={{ color: 'var(--text-muted)' }}>Features</a>
          <a href="#faq" style={{ color: 'var(--text-muted)' }}>FAQ</a>
          <Link to="/login" style={{ color: 'var(--text-muted)' }}>Sign in</Link>
        </div>
      </footer>
    </div>
  )
}
