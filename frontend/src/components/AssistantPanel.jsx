import { Bot, Brain, Bug, Lightbulb, Loader2, Rocket, Send, Zap } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { analyzeCode, chatWithBro, clearSessionMemory, compactContext, explainCode, getSessionMemory } from '../api.js'

const approxTokens = (msgs) => msgs.reduce((sum, m) => sum + (m.text || '').length, 0) / 4
const COMPACT_TOKEN_THRESHOLD = 6000

function parseFunctions(code) {
  const fns = []
  code.split('\n').forEach((line, idx) => {
    const m = line.match(/^\s*def\s+(\w+)\s*\(/)
    if (m) fns.push({ name: m[1], line: idx + 1 })
  })
  return fns
}

function calledFunctions(code, fns) {
  const body = code.split('\n').filter(l => !l.trim().startsWith('def ')).join('\n')
  return fns.filter(fn => new RegExp(`\\b${fn.name}\\s*\\(`).test(body))
}

// Time-based escalation so the status never looks frozen on slow CPU inference
function escalate(phase, secs) {
  if (secs < 8) return phase
  if (secs < 25) return `${phase} — model is writing`
  if (secs < 60) return `${phase} — long answer, hang tight`
  return `${phase} — CPU inference is slow, almost done`
}

export default function AssistantPanel({
  activeMode,
  code,
  context = '',
  modelMode = 'main',
  language = 'python',
  runOutput = '',
  runError = '',
  onOmniResult,
  onAddOmniCard,
}) {
  const [messages, setMessages] = useState([
    { role: 'bot', text: "Ready! Type 'explain' for overview, 'explain detail' for per-function deep dive, or ask anything." },
  ])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [phase, setPhase] = useState('')          // what the AI is doing right now
  const [elapsed, setElapsed] = useState(0)       // seconds since request started
  const [memCount, setMemCount] = useState(0)     // session-memory entries alive
  const startRef = useRef(0)
  const chatEndRef = useRef(null)

  // Poll session memory count (cheap endpoint; sweeps stale entries server-side)
  const refreshMem = () => {
    getSessionMemory().then(r => setMemCount(r?.stats?.entries ?? 0)).catch(() => {})
  }
  useEffect(() => {
    refreshMem()
    const t = setInterval(refreshMem, 60000)
    return () => clearInterval(t)
  }, [])

  const handleClearMem = async () => {
    try { await clearSessionMemory(); setMemCount(0) } catch {}
  }

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, busy, phase])

  // 1s ticker while busy — drives the visible timer
  useEffect(() => {
    if (!busy) { setElapsed(0); refreshMem(); return }
    startRef.current = Date.now()
    const t = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000))
    }, 1000)
    return () => clearInterval(t)
  }, [busy])

  const took = () => `${Math.max(1, Math.floor((Date.now() - startRef.current) / 1000))}s`

  const maybeCompact = async (currentMessages) => {
    if (approxTokens(currentMessages) < COMPACT_TOKEN_THRESHOLD) return currentMessages
    try {
      const apiMsgs = currentMessages.map(m => ({ role: m.role === 'bot' ? 'assistant' : 'user', content: m.text }))
      const data = await compactContext(apiMsgs, modelMode)
      return [{ role: 'bot', text: `[Context compacted]\n${data.summary || 'Context compacted.'}` }]
    } catch {
      return currentMessages.slice(-8)
    }
  }

  const pushBot = (text, timed = true) =>
    setMessages(m => [...m, { role: 'bot', text, took: timed ? took() : null }])

  const handleShallowExplain = async () => {
    if (!code?.trim()) return
    const fns = parseFunctions(code)
    const called = calledFunctions(code, fns)
    const targets = called.length > 0 ? called : fns
    const names = targets.map(f => f.name).join(', ') || 'the code'
    setPhase(`Reading ${targets.length || 1} function${targets.length !== 1 ? 's' : ''}`)
    const judgeData = await analyzeCode(
      code, '', '', activeMode, language, modelMode,
      `Shallow explanation: briefly explain in 2-3 sentences what each of these functions does: ${names}. Focus only on purpose and how they connect.`
    )
    if (judgeData.available !== false) {
      onOmniResult({ ...judgeData, issue_type: 'QUESTION' })
      pushBot(`Explanation shown above line ${judgeData.line || targets[0]?.line || 1} in the editor ↑`)
    }
  }

  const handleDetailExplain = async () => {
    if (!code?.trim()) return
    const fnCount = parseFunctions(code).length || 1
    setPhase(`Analyzing ${fnCount} function${fnCount !== 1 ? 's' : ''} in detail`)
    try {
      const cards = await explainCode('Explain this code in full detail', code, activeMode, modelMode)
      const list = Array.isArray(cards) ? cards : (cards?.available !== false ? [cards] : [])
      if (list.length === 0) { pushBot('No explanation generated.'); return }
      setPhase('Placing cards in editor')
      onOmniResult({ ...list[0], issue_type: 'QUESTION' })
      for (let i = 1; i < list.length; i++) {
        onAddOmniCard({ ...list[i], issue_type: 'QUESTION' })
      }
      pushBot(`${list.length} explanation card${list.length !== 1 ? 's' : ''} — see inline in editor ↑`)
    } catch (err) {
      pushBot(`Error: ${err.message}`)
    }
  }

  const send = async (custom) => {
    const rawText = (custom || input).trim()
    if (!rawText || busy) return
    setInput('')
    setBusy(true)
    setPhase('Thinking')

    const isExplain = /\bexplain\b/i.test(rawText)
    const isDetail  = isExplain && /\bdetail\b/i.test(rawText)

    let currentMsgs = [...messages, { role: 'user', text: rawText }]
    setMessages(currentMsgs)

    try {
      currentMsgs = await maybeCompact(currentMsgs)
      if (currentMsgs.length < messages.length + 1) {
        currentMsgs = [...currentMsgs, { role: 'user', text: rawText }]
        setMessages(currentMsgs)
      }

      if (isExplain && code?.trim()) {
        if (isDetail) await handleDetailExplain()
        else await handleShallowExplain()
        return
      }

      const hasRunError = Boolean(runError?.trim())
      const isErrorQuery = hasRunError && /fix|error|bug|fail|crash|wrong|tle|why/i.test(rawText)

      if (isErrorQuery) {
        setPhase('Tracing the error')
        try {
          const judgeData = await analyzeCode(code, runError, runOutput, activeMode, language, modelMode, rawText)
          if (judgeData.available !== false) {
            onOmniResult(judgeData)
            const line = judgeData.line || 1
            pushBot(`Error analysis shown at line ${line} in the editor ↑`)
            return
          }
        } catch { /* fall through to chat */ }
      }

      setPhase('Writing reply')
      const chatHistory = currentMsgs
        .filter(m => m.role === 'user' || m.role === 'bot')
        .slice(-6)
        .map(m => ({ role: m.role === 'bot' ? 'assistant' : 'user', content: m.text }))
      const data = await chatWithBro(rawText, activeMode, code, context, false, modelMode, chatHistory)
      const reply = data.reply || 'No response.'
      pushBot(reply)

      const lineCards = Array.isArray(data.cards) ? data.cards : []
      if (lineCards.length > 0 && code?.trim()) {
        onOmniResult({ ...lineCards[0], issue_type: 'QUESTION' })
        for (let i = 1; i < lineCards.length; i++) {
          onAddOmniCard({ ...lineCards[i], issue_type: 'QUESTION' })
        }
      }
    } catch (err) {
      pushBot(`Error: ${err.message}`)
    } finally {
      setBusy(false)
      setPhase('')
    }
  }

  const showHistory = messages.length > 1

  return (
    <div className="assistant-bar">
      {showHistory && (
        <div className="assistant-messages">
          {messages.map((msg, idx) => (
            <div key={idx} className={`chat-msg ${msg.role}`}>
              {msg.role === 'bot' && <Bot size={13} style={{ flexShrink: 0, marginTop: '2px' }} />}
              <p>
                {msg.text}
                {msg.took && <span className="msg-took">{msg.took}</span>}
              </p>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>
      )}

      {/* Live status strip — visible whenever the AI is working */}
      {busy && (
        <div className="assistant-status-strip">
          <Loader2 size={12} className="spin" />
          <span className="assistant-status-phase">{escalate(phase || 'Thinking', elapsed)}…</span>
          <span className="assistant-status-timer">{elapsed}s</span>
        </div>
      )}

      <div className="assistant-search-row">
        <input
          className="assistant-search-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
          placeholder="Ask AI to explain, debug, optimize, or generate tests..."
          disabled={busy}
        />
        <button
          className="assistant-send-btn"
          onClick={() => send()}
          disabled={busy || !input.trim()}
        >
          {busy ? <Loader2 size={14} className="spin" /> : <Send size={14} />}
        </button>
      </div>

      <div className="assistant-actions-row">
        <button className="assistant-action-btn" onClick={() => send('explain')} disabled={busy}>
          <Lightbulb size={12} /> Explain
        </button>
        <button className="assistant-action-btn" onClick={() => send('debug this')} disabled={busy}>
          <Bug size={12} /> Debug
        </button>
        <button className="assistant-action-btn" onClick={() => send('optimize this')} disabled={busy}>
          <Rocket size={12} /> Optimize
        </button>
        <button className="assistant-action-btn" onClick={() => send('list stress-test edge cases')} disabled={busy}>
          <Zap size={12} /> Stress Test
        </button>
        {memCount > 0 && (
          <button
            className="assistant-action-btn mem-chip"
            onClick={handleClearMem}
            title={`AI remembers ${memCount} recent item${memCount === 1 ? '' : 's'} from this session (runs, bugs, questions). Stale items auto-expire after 30 min. Click to clear now.`}
          >
            <Brain size={12} /> {memCount} ctx · clear
          </button>
        )}
      </div>
    </div>
  )
}
