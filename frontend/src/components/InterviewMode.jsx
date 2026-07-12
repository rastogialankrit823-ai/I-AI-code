import { Book, Brain, CheckCircle2, ChevronRight, Clock, Code2, HelpCircle, Layers, Loader2, MessageSquare, Play, RefreshCcw, Send, Trophy, XCircle, Zap } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { askClarifyQuestion, discussLLD, getReviewQuestions, judgeDSASession, judgeLLDSession, requestCodingHint, runCodeOnServer } from '../api.js'
import { pickLLDProblem } from '../data/lldProblems.js'
import { pickProblem } from '../data/interviewProblems.js'
import CodeEditor from './CodeEditor.jsx'

// ── Helpers ────────────────────────────────────────────────────────────────

function normalizeOut(s) {
  return String(s || '').trim().replace(/\r\n/g, '\n')
}

function outputsMatch(actual, expected) {
  // Exact match after trim
  if (normalizeOut(actual) === normalizeOut(expected)) return true
  // Canonical match: no quotes, no whitespace, case-insensitive
  const canon = (s) => String(s || '').toLowerCase().replace(/["']/g, '').replace(/\s+/g, '')
  if (canon(actual) === canon(expected)) return true
  // Number comparison
  const a = Number(String(actual).trim()), e = Number(String(expected).trim())
  if (!isNaN(a) && !isNaN(e) && isFinite(a) && isFinite(e)) return a === e
  return false
}

// ── Sub-components ─────────────────────────────────────────────────────────

function Timer({ secondsLeft }) {
  const m = Math.floor(secondsLeft / 60).toString().padStart(2, '0')
  const s = (secondsLeft % 60).toString().padStart(2, '0')
  return (
    <div className={`iv-timer ${secondsLeft < 5 * 60 ? 'urgent' : ''}`}>
      <Clock size={13} /> {m}:{s}
    </div>
  )
}

function ScoreRing({ value, label }) {
  const color = value >= 70 ? '#3ddb96' : value >= 45 ? '#ffb86c' : '#ff5f5f'
  return (
    <div className="iv-score-ring" style={{ borderColor: color }}>
      <b style={{ color }}>{value}%</b>
      <small>{label}</small>
    </div>
  )
}

function TestResults({ results, running }) {
  if (running) return (
    <div className="iv-test-results">
      <div className="iv-test-header"><Loader2 size={12} className="spin" /> Running test cases...</div>
    </div>
  )
  if (!results?.length) return null
  const passed = results.filter(r => r.passed).length
  return (
    <div className="iv-test-results">
      <div className="iv-test-header">
        Test Cases — <span className="iv-test-pass">{passed}/{results.length} passed</span>
      </div>
      {results.map((r, i) => (
        <div key={i} className={`iv-test-case ${r.passed ? 'pass' : 'fail'}`}>
          <div className="iv-test-case-header">
            {r.passed ? <CheckCircle2 size={13} className="iv-pass-icon" /> : <XCircle size={13} className="iv-fail-icon" />}
            <span>Test {i + 1}</span>
            {r.runtime != null && <small>{r.runtime}ms</small>}
          </div>
          <div className="iv-test-io">
            <div><span>Input:</span><code>{r.input.length > 60 ? r.input.slice(0, 60) + '…' : r.input}</code></div>
            <div><span>Expected:</span><code>{r.expected}</code></div>
            {!r.passed && <div className="iv-test-actual"><span>Got:</span><code>{r.actual || r.error || '(no output)'}</code></div>}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function InterviewMode({ modelMode = 'main' }) {
  const [stage, setStage] = useState('loading_dsa')
  const [topic, setTopic] = useState('random')
  const [difficulty, setDifficulty] = useState('Random')

  // DSA
  const [dsaProblem, setDsaProblem] = useState(null)
  const [clarifyInput, setClarifyInput] = useState('')
  const [clarifyQA, setClarifyQA] = useState([])
  const [clarifyLeft, setClarifyLeft] = useState(3)
  const [code, setCode] = useState('')
  const [hints, setHints] = useState([])
  const [secondsLeft, setSecondsLeft] = useState(15 * 60)
  const [testResults, setTestResults] = useState([])
  const [testRunning, setTestRunning] = useState(false)
  const [reviewQuestions, setReviewQuestions] = useState([])
  const [reviewAnswers, setReviewAnswers] = useState(['', '', ''])
  const [dsaScore, setDsaScore] = useState(null)

  // LLD
  const [lldProblem, setLldProblem] = useState(null)
  const [lldConvo, setLldConvo] = useState([])
  const [lldCurrentQ, setLldCurrentQ] = useState('')
  const [lldAnswer, setLldAnswer] = useState('')
  const [lldFeedbacks, setLldFeedbacks] = useState([])   // [{text, score}]
  const [lldScore, setLldScore] = useState(null)

  const [busy, setBusy] = useState(false)
  const [busyMsg, setBusyMsg] = useState('')
  const [errMsg, setErrMsg] = useState('')

  // Refs to avoid stale closures in timer
  const codeRef = useRef('')
  const dsaProblemRef = useRef(null)
  const hintsDoneRef = useRef(0)
  const elapsedRef = useRef(0)
  const timerRef = useRef(null)

  useEffect(() => { codeRef.current = code }, [code])
  useEffect(() => { dsaProblemRef.current = dsaProblem }, [dsaProblem])

  // ── Load DSA problem (from hardcoded list) ────────────────────────────────
  const loadProblem = async (t = topic, d = difficulty) => {
    setStage('loading_dsa')
    setBusy(true); setBusyMsg('Picking problem...')
    setErrMsg(''); setClarifyQA([]); setClarifyLeft(3)
    setCode(''); setHints([]); hintsDoneRef.current = 0
    setSecondsLeft(15 * 60); setTestResults([])
    setReviewQuestions([]); setReviewAnswers(['', '', ''])
    setDsaScore(null); setLldScore(null); setLldConvo([]); setLldFeedbacks([])

    // Small delay so spinner shows, then pick from hardcoded list
    await new Promise(r => setTimeout(r, 200))
    const q = pickProblem(t, d)
    setDsaProblem(q)
    setCode(q.starter_code || '')
    setStage('dsa_problem')
    setBusy(false); setBusyMsg('')
  }

  useEffect(() => { loadProblem() }, [])

  // ── Timer ─────────────────────────────────────────────────────────────────
  const stopTimer = () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null } }

  const startTimer = () => {
    stopTimer()
    elapsedRef.current = 0
    timerRef.current = setInterval(() => {
      elapsedRef.current += 1
      const elapsed = elapsedRef.current
      if ((elapsed === 5 * 60 || elapsed === 10 * 60) && hintsDoneRef.current < 2) {
        hintsDoneRef.current += 1
        triggerHint(elapsed / 60)
      }
      setSecondsLeft(prev => {
        if (prev <= 1) { stopTimer(); moveToDSAReview(); return 0 }
        return prev - 1
      })
    }, 1000)
  }

  useEffect(() => () => stopTimer(), [])

  const triggerHint = async (elapsedMin) => {
    try {
      const h = await requestCodingHint(dsaProblemRef.current, codeRef.current, Math.round(elapsedMin), modelMode)
      setHints(prev => [...prev, { text: h.hint, time: Math.round(elapsedMin) }])
    } catch {}
  }

  // ── Run test cases ─────────────────────────────────────────────────────────
  const runTests = async (codeToRun, problem) => {
    if (!problem?.test_cases?.length || !codeToRun?.trim()) return []
    setTestRunning(true)
    const results = []
    for (const tc of problem.test_cases) {
      const fullCode = codeToRun + '\n\n' + problem.harness
      const expected = tc.expected.trim()
      try {
        const t0 = Date.now()
        const res = await runCodeOnServer(fullCode, 'DSA', tc.input, 'python', modelMode)
        const runtime = Date.now() - t0
        const actual = (res.output || '').trim()
        const error = (res.error || '').trim()
        results.push({
          input: tc.input, expected,
          actual: error ? '' : actual,
          error: error ? error.split('\n').slice(-2).join(' ') : '',
          passed: !error && outputsMatch(actual, expected),
          runtime,
        })
      } catch (err) {
        results.push({ input: tc.input, expected, actual: '', error: err.message, passed: false })
      }
    }
    setTestResults(results)
    setTestRunning(false)
    return results
  }

  const handleRunTests = () => {
    if (!code.trim() || testRunning) return
    runTests(code, dsaProblem)
  }

  // ── DSA: Clarify ──────────────────────────────────────────────────────────
  const sendClarify = async () => {
    if (!clarifyInput.trim() || clarifyLeft <= 0 || busy) return
    const q = clarifyInput.trim(); setClarifyInput(''); setBusy(true)
    try {
      const res = await askClarifyQuestion(dsaProblem, q, modelMode)
      setClarifyQA(prev => [...prev, { q, a: res.answer }])
      setClarifyLeft(prev => prev - 1)
    } catch { setClarifyQA(prev => [...prev, { q, a: 'Could not get answer — try again.' }]) }
    finally { setBusy(false) }
  }

  // ── Start coding ──────────────────────────────────────────────────────────
  const startCoding = () => { setStage('dsa_coding'); startTimer() }

  // ── Done coding → run all tests → review questions ─────────────────────────
  const moveToDSAReview = async () => {
    stopTimer()
    const currentCode = codeRef.current
    const currentProblem = dsaProblemRef.current
    setBusy(true); setBusyMsg('Running all test cases...')
    await runTests(currentCode, currentProblem)
    setBusyMsg('Generating follow-up questions...')
    try {
      const res = await getReviewQuestions(currentProblem, currentCode, modelMode)
      setReviewQuestions(res.questions || [])
    } catch {
      setReviewQuestions(['What is the time complexity of your solution?', 'Are there any edge cases your solution might miss?', 'How would you optimize this further?'])
    }
    setBusy(false); setBusyMsg('')
    setStage('dsa_review')
  }

  // ── Submit review → judge → load LLD (hardcoded) ──────────────────────────
  const submitDSAReview = async () => {
    if (busy) return
    setBusy(true); setBusyMsg('Judging DSA phase...')
    try {
      const qna = reviewQuestions.map((q, i) => ({ q, a: reviewAnswers[i] || '' }))
      const score = await judgeDSASession(dsaProblem, code, qna, modelMode)
      setDsaScore(score)
      // Pick LLD problem from hardcoded list — no network call needed
      const lld = pickLLDProblem()
      setLldProblem(lld)
      setLldCurrentQ(lld.questions[0])   // first of 5 predefined questions
      setLldConvo([]); setLldFeedbacks([])
      setStage('lld_discuss')
    } catch (err) { setErrMsg(`Error: ${err.message}`) }
    finally { setBusy(false); setBusyMsg('') }
  }

  // ── LLD discussion — evaluate each answer against reference solution ────────
  const sendLLDAnswer = async () => {
    if (!lldAnswer.trim() || busy) return
    const ans = lldAnswer.trim(); setLldAnswer(''); setBusy(true)
    const updatedConvo = [...lldConvo, { q: lldCurrentQ, a: ans }]
    setLldConvo(updatedConvo)
    try {
      const res = await discussLLD(lldProblem, updatedConvo, modelMode)
      setLldFeedbacks(prev => [...prev, { text: res.brief_feedback || '', score: res.answer_score ?? null }])
      if (res.is_done) {
        setBusyMsg('Judging LLD phase...')
        const lScore = await judgeLLDSession(lldProblem, updatedConvo, modelMode)
        setLldScore(lScore)
        setStage('complete')
      } else {
        setLldCurrentQ(res.next_question || '')
      }
    } catch (err) { setErrMsg(`LLD error: ${err.message}`) }
    finally { setBusy(false); setBusyMsg('') }
  }

  // ── Loading screen ─────────────────────────────────────────────────────────
  if (stage === 'loading_dsa') return (
    <div className="iv-loading">
      <Loader2 size={34} className="spin" />
      <p>{busyMsg || 'Loading...'}</p>
    </div>
  )

  // ── Complete screen ────────────────────────────────────────────────────────
  if (stage === 'complete') {
    const overall = dsaScore && lldScore
      ? Math.round((dsaScore.score + lldScore.score) / 2)
      : (dsaScore?.score ?? lldScore?.score ?? 0)
    return (
      <section className="iv-complete">
        <div className="iv-complete-header">
          <Trophy size={26} /> <h2>Interview Complete</h2>
          <div className="iv-overall">{overall}%</div>
        </div>
        <div className="iv-phase-cards">
          <div className="iv-phase-card">
            <h3><Code2 size={15} /> DSA Phase</h3>
            {dsaScore && <>
              <div className="iv-rings-row">
                <ScoreRing value={dsaScore.logic} label="Logic" />
                <ScoreRing value={dsaScore.code_quality} label="Code" />
                <ScoreRing value={dsaScore.communication} label="Comm." />
                <ScoreRing value={dsaScore.score} label="Overall" />
              </div>
              {testResults.length > 0 && (
                <div className="iv-complete-tests">
                  {testResults.filter(r => r.passed).length}/{testResults.length} test cases passed
                </div>
              )}
              <div className="iv-verdict">{dsaScore.verdict}</div>
              <p className="iv-feedback">{dsaScore.feedback}</p>
            </>}
          </div>
          <div className="iv-phase-card">
            <h3><Layers size={15} /> LLD Phase</h3>
            {lldScore && <>
              <div className="iv-rings-row">
                <ScoreRing value={lldScore.class_design} label="Classes" />
                <ScoreRing value={lldScore.concurrency} label="Concurr." />
                <ScoreRing value={lldScore.scalability} label="Scale" />
                <ScoreRing value={lldScore.score} label="Overall" />
              </div>
              <div className="iv-verdict">{lldScore.verdict}</div>
              <p className="iv-feedback">{lldScore.feedback}</p>
            </>}
          </div>
        </div>
        <button className="primary-btn" onClick={() => loadProblem()} style={{ marginTop: 18 }}>
          <RefreshCcw size={14} /> Start New Interview
        </button>
      </section>
    )
  }

  // ── Main shell ─────────────────────────────────────────────────────────────
  return (
    <section className="iv-shell">

      {/* Top bar */}
      <div className="iv-topbar">
        <div className="iv-breadcrumb">
          <span className={`iv-pill ${['dsa_problem','dsa_coding','dsa_review'].includes(stage) ? 'active' : 'done'}`}>
            <Code2 size={12} /> DSA
          </span>
          <ChevronRight size={12} style={{ color: 'var(--muted)' }} />
          <span className={`iv-pill ${stage.startsWith('lld') ? 'active' : stage === 'complete' ? 'done' : ''}`}>
            <Layers size={12} /> System Design
          </span>
        </div>

        <div className="iv-topbar-right">
          {stage === 'dsa_problem' && (
            <>
              <select className="interview-select" value={topic} onChange={e => setTopic(e.target.value)} disabled={busy}>
                <option value="random">Any Topic</option>
                {['arrays','strings','linked lists','trees','graphs','binary search','dynamic programming'].map(t => (
                  <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                ))}
              </select>
              <select className="interview-select" value={difficulty} onChange={e => setDifficulty(e.target.value)} disabled={busy}>
                <option value="Random">Any Difficulty</option>
                <option>Easy</option><option>Medium</option>
              </select>
              <button className="ghost-btn" onClick={() => loadProblem(topic, difficulty)} disabled={busy}>
                <RefreshCcw size={13} /> New Problem
              </button>
            </>
          )}
          {(stage === 'dsa_coding' || stage === 'dsa_review') && <Timer secondsLeft={secondsLeft} />}
          {stage === 'dsa_coding' && (
            <button className="ghost-btn" onClick={handleRunTests} disabled={testRunning || !code.trim()}>
              {testRunning ? <Loader2 size={12} className="spin" /> : <Play size={12} />}
              {testRunning ? 'Testing...' : `Run ${dsaProblem?.test_cases?.length ?? ''} Tests`}
            </button>
          )}
          {busy && <span className="iv-busy-label"><Loader2 size={12} className="spin" /> {busyMsg}</span>}
        </div>
      </div>

      {errMsg && (
        <div className="iv-error-bar">{errMsg} <button onClick={() => setErrMsg('')}>✕</button></div>
      )}

      {/* ── DSA: Problem + Clarify ── */}
      {stage === 'dsa_problem' && dsaProblem && (
        <div className="iv-dsa-problem">
          <div className="iv-problem-card">
            <div className="iv-problem-title">
              <Book size={15} />
              <h3>{dsaProblem.title}</h3>
              <span className={`iv-diff-badge ${dsaProblem.difficulty.toLowerCase()}`}>{dsaProblem.difficulty}</span>
              <span className="iv-topic-badge">{dsaProblem.topic}</span>
            </div>
            <p className="iv-problem-text">{dsaProblem.problem}</p>

            {dsaProblem.examples?.length > 0 && (
              <div className="iv-section">
                <b>Examples</b>
                {dsaProblem.examples.map((ex, i) => (
                  <div key={i} className="iv-example">
                    <code>Input: {ex.input}</code>
                    <code>Output: {ex.output}</code>
                    {ex.explanation && <small>{ex.explanation}</small>}
                  </div>
                ))}
              </div>
            )}

            {dsaProblem.constraints?.length > 0 && (
              <div className="iv-section">
                <b>Constraints</b>
                <ul className="iv-constraints">
                  {dsaProblem.constraints.map((c, i) => <li key={i}>{c}</li>)}
                </ul>
              </div>
            )}
          </div>

          <div className="iv-clarify">
            <div className="iv-clarify-header">
              <HelpCircle size={13} />
              <span>Clarifying Questions</span>
              <span className="iv-clarify-count">{clarifyLeft}/3 left</span>
            </div>
            {clarifyQA.map((qa, i) => (
              <div key={i} className="iv-clarify-pair">
                <div className="iv-clarify-q">You: {qa.q}</div>
                <div className="iv-clarify-a">Interviewer: {qa.a}</div>
              </div>
            ))}
            {clarifyLeft > 0 && (
              <div className="iv-clarify-input">
                <input
                  value={clarifyInput}
                  onChange={e => setClarifyInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sendClarify()}
                  placeholder="Ask about edge cases, input format, constraints..."
                  disabled={busy}
                />
                <button className="assistant-send-btn" onClick={sendClarify} disabled={busy || !clarifyInput.trim()}>
                  <Send size={13} />
                </button>
              </div>
            )}
          </div>

          <button className="primary-btn iv-start-btn" onClick={startCoding} disabled={busy}>
            Start Coding — 15 min (Python) <ChevronRight size={14} />
          </button>
        </div>
      )}

      {/* ── DSA: Coding ── */}
      {stage === 'dsa_coding' && (
        <div className="iv-coding">
          {/* Left: problem + test results + hints */}
          <div className="iv-coding-left">
            <details className="iv-problem-compact" open>
              <summary><Book size={12} /> {dsaProblem?.title}</summary>
              <p>{dsaProblem?.problem}</p>
              {dsaProblem?.examples?.map((ex, i) => (
                <div key={i} className="iv-example">
                  <code>In: {ex.input}</code><code>Out: {ex.output}</code>
                </div>
              ))}
            </details>

            <TestResults results={testResults} running={testRunning} />

            {hints.length > 0 && (
              <div className="iv-hints">
                {hints.map((h, i) => (
                  <div key={i} className="iv-hint-card">
                    <Zap size={12} />
                    <div>
                      <span className="iv-hint-text">{h.text}</span>
                      <small>@ {h.time} min</small>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right: full CodeEditor (same as DSA mode) */}
          <div className="iv-coding-right">
            {testResults.length > 0 && (
              <div className={`iv-test-summary-bar ${testResults.every(r => r.passed) ? 'all-pass' : 'some-fail'}`}>
                {testResults.every(r => r.passed)
                  ? <><CheckCircle2 size={13} /> All {testResults.length} tests passing</>
                  : <><XCircle size={13} /> {testResults.filter(r => r.passed).length}/{testResults.length} tests passing — check results on the left</>
                }
              </div>
            )}
            <div className="iv-editor-wrap">
              <CodeEditor
                code={code}
                setCode={setCode}
                title="solution.py"
                language="python"
              />
            </div>
            <div className="iv-coding-actions">
              <button className="ghost-btn" onClick={handleRunTests} disabled={testRunning || !code.trim()}>
                {testRunning ? <Loader2 size={12} className="spin" /> : <Play size={12} />}
                {testRunning ? 'Running...' : `Run ${dsaProblem?.test_cases?.length ?? ''} Tests`}
              </button>
              <button className="primary-btn" onClick={moveToDSAReview} disabled={busy || testRunning}>
                {busy ? <><Loader2 size={13} className="spin" /> {busyMsg}</> : <>Done Coding <ChevronRight size={14} /></>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── DSA: Review ── */}
      {stage === 'dsa_review' && (
        <div className="iv-review">
          <div className="iv-review-left">
            <div className="iv-code-header"><Code2 size={13} /> Your Code</div>
            <pre className="iv-code-preview">{code || '(no code written)'}</pre>
            <TestResults results={testResults} running={testRunning} />
          </div>
          <div className="iv-review-qs">
            <div className="iv-review-header"><MessageSquare size={14} /> <b>Follow-up Questions</b></div>
            {reviewQuestions.map((q, i) => (
              <div key={i} className="iv-review-block">
                <div className="iv-review-q">Q{i + 1}. {q}</div>
                <textarea
                  className="iv-review-answer"
                  rows={3}
                  value={reviewAnswers[i]}
                  onChange={e => setReviewAnswers(prev => { const n = [...prev]; n[i] = e.target.value; return n })}
                  placeholder="Your answer..."
                />
              </div>
            ))}
            <button className="primary-btn" onClick={submitDSAReview} disabled={busy || reviewAnswers.every(a => !a.trim())}>
              {busy
                ? <><Loader2 size={14} className="spin" /> {busyMsg}</>
                : <><CheckCircle2 size={14} /> Submit & Go to System Design <ChevronRight size={14} /></>
              }
            </button>
          </div>
        </div>
      )}

      {/* ── LLD: Discussion ── */}
      {stage === 'lld_discuss' && lldProblem && (
        <div className="iv-lld">
          <div className="iv-lld-left">
            <div className="iv-lld-problem">
              <div className="iv-problem-title">
                <Layers size={15} />
                <h3>{lldProblem.title}</h3>
                <span className="iv-diff-badge lld">LLD</span>
              </div>
              <p className="iv-problem-text">{lldProblem.problem}</p>
              {lldProblem.requirements?.length > 0 && (
                <div className="iv-section">
                  <b>Requirements</b>
                  <ul className="iv-constraints">
                    {lldProblem.requirements.map((r, i) => <li key={i}>{r}</li>)}
                  </ul>
                </div>
              )}
            </div>
            {dsaScore && (
              <div className="iv-dsa-mini">
                <Code2 size={12} /> DSA: <b>{dsaScore.score}%</b>
                {testResults.length > 0 && (
                  <span className={`iv-test-badge ${testResults.every(r => r.passed) ? 'all-pass' : 'some-fail'}`} style={{ marginLeft: 6 }}>
                    {testResults.filter(r => r.passed).length}/{testResults.length} tests
                  </span>
                )}
                — {dsaScore.verdict}
              </div>
            )}
          </div>

          <div className="iv-lld-right">
            {/* Question progress bar */}
            <div className="iv-lld-progress">
              {lldProblem.questions.map((_, i) => (
                <div key={i} className={`iv-lld-progress-dot ${
                  i < lldConvo.length ? (lldFeedbacks[i]?.score >= 70 ? 'good' : lldFeedbacks[i]?.score >= 40 ? 'ok' : 'weak') : i === lldConvo.length ? 'current' : 'upcoming'
                }`} title={`Q${i + 1}`} />
              ))}
              <span className="iv-lld-progress-label">{lldConvo.length}/{lldProblem.questions.length} answered</span>
            </div>

            <div className="iv-lld-convo">
              {lldConvo.map((turn, i) => (
                <div key={i} className="iv-lld-turn">
                  <div className="iv-lld-interviewer"><Brain size={12} /> {turn.q}</div>
                  <div className="iv-lld-candidate">👤 {turn.a}</div>
                  {lldFeedbacks[i] && (
                    <div className="iv-lld-feedback">
                      <span>💬 {lldFeedbacks[i].text}</span>
                      {lldFeedbacks[i].score != null && (
                        <span className={`iv-lld-ans-score ${lldFeedbacks[i].score >= 70 ? 'good' : lldFeedbacks[i].score >= 40 ? 'ok' : 'weak'}`}>
                          {lldFeedbacks[i].score}%
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {lldCurrentQ && (
                <div className="iv-lld-current">
                  <Brain size={13} /> <b>{lldCurrentQ}</b>
                </div>
              )}
            </div>
            <div className="iv-lld-input">
              <textarea
                value={lldAnswer}
                onChange={e => setLldAnswer(e.target.value)}
                placeholder="Explain your design approach..."
                rows={5}
                disabled={busy}
              />
              <button className="primary-btn" onClick={sendLLDAnswer} disabled={busy || !lldAnswer.trim()}>
                {busy ? <><Loader2 size={14} className="spin" /> {busyMsg}</> : <>Send <Send size={13} /></>}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
