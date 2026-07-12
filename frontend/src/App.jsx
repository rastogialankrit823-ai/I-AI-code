import { useCallback, useEffect, useRef, useState } from 'react'
import Sidebar from './components/Sidebar.jsx'
import TopBar from './components/TopBar.jsx'
import CodeEditor from './components/CodeEditor.jsx'
import BuildRunPanel from './components/BuildRunPanel.jsx'
import AssistantPanel from './components/AssistantPanel.jsx'
import SystemDesignMode from './components/SystemDesignMode.jsx'
import InterviewMode from './components/InterviewMode.jsx'
import ContextPanel from './components/ContextPanel.jsx'
import SplashScreen from './components/SplashScreen.jsx'
import { analyzeCode, analyzeComplexity, explainRunResult, generatePatch, getStarterCode, runCodeOnServer, runStressTest, validateSystemDesign, writeFsFile } from './api.js'

// ── WA helpers ────────────────────────────────────────────────────────────────
function normalizeOut(s) {
  return String(s || '').replace(/\s+/g, ' ').trim().toLowerCase()
}

// Aggressive canonical form: lowercase, no quotes, no whitespace.
// Makes "[1, 2]" equal "[1,2]" and '"abc"' equal 'abc'.
function canonOut(s) {
  return String(s || '').toLowerCase().replace(/["']/g, '').replace(/\s+/g, '')
}

function outputsMatch(actual, expected) {
  const act = String(actual ?? ''), exp = String(expected ?? '')
  if (!exp.trim()) return true
  if (normalizeOut(act) === normalizeOut(exp)) return true
  if (canonOut(act) === canonOut(exp)) return true
  // Numeric comparison (tolerates 5 vs 5.0)
  const na = Number(act.trim()), ne = Number(exp.trim())
  if (!isNaN(na) && !isNaN(ne) && isFinite(na) && isFinite(ne)) return na === ne
  // Programs often print extra lines (prompts, debug) — the answer usually
  // appears as the last line or as some exact line of the output.
  const lines = act.split('\n').map(l => l.trim()).filter(Boolean)
  const last = lines[lines.length - 1] || ''
  if (canonOut(last) === canonOut(exp)) return true
  const nl = Number(last)
  if (!isNaN(nl) && !isNaN(ne) && isFinite(nl) && isFinite(ne)) return nl === ne
  if (lines.some(l => canonOut(l) === canonOut(exp))) return true
  // Multi-line expected: compare against the same number of trailing lines
  const expLines = exp.split('\n').map(l => l.trim()).filter(Boolean)
  if (expLines.length > 1 && lines.length >= expLines.length) {
    const tail = lines.slice(-expLines.length)
    if (tail.every((l, i) => canonOut(l) === canonOut(expLines[i]))) return true
  }
  return false
}

// Strip trailing explanation text that problem statements attach to outputs,
// e.g. "Output: 5 (because ...)" or "Output: true\nExplanation: ..."
function stripExplanation(s) {
  return String(s || '')
    .replace(/\bexplanation\b\s*[:\-][\s\S]*$/i, '')
    .replace(/\s*\((?:because|since|as|the)\b[^)]*\)\s*$/i, '')
    .trim()
}

// Parse Input/Output example pairs from problem statement and match against current stdin.
// Returns the expected output string, or '' if none found (=> no verdict, never a guess).
function resolveExpectedOutput(problemContext, stdin) {
  if (!problemContext) return ''
  const ctx = problemContext

  // Input blocks: everything up to the matching Output
  const blockRe = /Input\s*[:\-]\s*([\s\S]*?)(?=Output\s*[:\-])/gi
  // Output blocks: may span multiple lines, ends at blank line or next section
  const outputRe = /Output\s*[:\-]\s*([\s\S]*?)(?=\n\s*\n|\n\s*(?:Input|Example|Constraints?|Explanation|Note)\b|$)/gi
  const inputs = [], outputs = []
  let m
  while ((m = blockRe.exec(ctx)) !== null) inputs.push(m[1].trim())
  while ((m = outputRe.exec(ctx)) !== null) outputs.push(m[1].trim())

  const clean = (s) => stripExplanation(String(s || '').replace(/[^\x20-\x7E\n]/g, '').trim())

  if (inputs.length > 0 && outputs.length > 0) {
    if (stdin.trim()) {
      const normStdin = normalizeOut(stdin)
      for (let i = 0; i < inputs.length; i++) {
        const normInput = normalizeOut(inputs[i])
        if (normStdin === normInput || normStdin.includes(normInput) || normInput.includes(normStdin)) {
          return clean(outputs[i] || '')
        }
      }
      // stdin doesn't match any example — we don't know the right answer,
      // so return '' (no verdict) instead of guessing example #1
      return ''
    }
    // No stdin: assume the code runs the first example
    return clean(outputs[0])
  }

  // Fallback: single "Output:" / "Expected:" / "Answer:" line
  const simple = ctx.match(/(?:Output|Expected|Answer)\s*[:\-]\s*([^\n]+)/i)
  return simple ? clean(simple[1]) : ''
}

// ── Mode context persistence ──────────────────────────────────────────────────
const CTX_TTL_MS = 10 * 60 * 1000 // 10 minutes

function saveCtxToStorage(mode, ctx) {
  try {
    localStorage.setItem(`ctx_${mode}`, JSON.stringify({ ts: Date.now(), ctx }))
  } catch {}
}

function loadCtxFromStorage(mode) {
  try {
    const raw = localStorage.getItem(`ctx_${mode}`)
    if (!raw) return null
    const { ts, ctx } = JSON.parse(raw)
    if (Date.now() - ts > CTX_TTL_MS) { localStorage.removeItem(`ctx_${mode}`); return null }
    return ctx
  } catch { return null }
}

export default function App() {
  const [booting, setBooting] = useState(true)
  const [activeMode, setActiveMode] = useState('DSA')
  const prevModeRef = useRef('DSA')

  // ── Multi-file tab management (VS Code-style) ─────────────────
  // tab: { id, name, content, path, savedContent } — dirty = content !== savedContent
  const [tabs, setTabs] = useState([{ id: 'main', name: 'main.py', content: '', path: null, savedContent: '' }])
  const [activeTabId, setActiveTabId] = useState('main')
  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0]
  const code = activeTab?.content ?? ''
  const editorTitle = activeTab?.name ?? 'main.py'

  const setCode = useCallback((newContent) => {
    setTabs(prev => prev.map(t => t.id === (activeTabId) ? { ...t, content: newContent } : t))
  }, [activeTabId])

  const setEditorTitle = useCallback((name) => {
    setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, name } : t))
  }, [activeTabId])

  const selectTab = useCallback((tabId) => setActiveTabId(tabId), [])

  const freshTab = () => ({ id: 'tab-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6), name: 'untitled.py', content: '', path: null, savedContent: '' })

  const closeTab = useCallback((tabId) => {
    setTabs(prev => {
      const idx = prev.findIndex(t => t.id === tabId)
      const next = prev.filter(t => t.id !== tabId)
      if (next.length === 0) {
        const fallback = { ...freshTab(), name: 'main.py' }
        setActiveTabId(fallback.id)
        return [fallback]
      }
      setActiveTabId(curId => curId === tabId ? (next[Math.max(0, idx - 1)]?.id || next[0].id) : curId)
      return next
    })
  }, [])

  const closeOtherTabs = useCallback((tabId) => {
    setTabs(prev => prev.filter(t => t.id === tabId))
    setActiveTabId(tabId)
  }, [])

  const closeTabsToRight = useCallback((tabId) => {
    setTabs(prev => {
      const idx = prev.findIndex(t => t.id === tabId)
      if (idx === -1) return prev
      const next = prev.slice(0, idx + 1)
      setActiveTabId(curId => next.some(t => t.id === curId) ? curId : tabId)
      return next
    })
  }, [])

  const closeAllTabs = useCallback(() => {
    const fallback = { ...freshTab(), name: 'main.py' }
    setTabs([fallback])
    setActiveTabId(fallback.id)
  }, [])

  const reorderTabs = useCallback((fromId, toId) => {
    if (fromId === toId) return
    setTabs(prev => {
      const from = prev.findIndex(t => t.id === fromId)
      const to = prev.findIndex(t => t.id === toId)
      if (from === -1 || to === -1) return prev
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }, [])

  const renameTab = useCallback((tabId, name) => {
    const clean = name.trim()
    if (!clean) return
    setTabs(prev => prev.map(t => t.id === tabId ? { ...t, name: clean } : t))
  }, [])

  const saveTab = useCallback(async (tabId) => {
    const tab = tabs.find(t => t.id === tabId)
    if (!tab) return
    if (tab.path) {
      try {
        await writeFsFile(tab.path, tab.content)
        setTabs(prev => prev.map(t => t.id === tabId ? { ...t, savedContent: t.content } : t))
      } catch { /* backend down — stay dirty */ }
    } else {
      // untitled: write into the workspace folder open in the sidebar
      const root = localStorage.getItem('fx_opened_root')
      if (root) {
        const path = `${root.replace(/\/$/, '')}/${tab.name}`
        try {
          await writeFsFile(path, tab.content)
          setTabs(prev => prev.map(t => t.id === tabId ? { ...t, path, savedContent: t.content } : t))
          window.dispatchEvent(new CustomEvent('fx-refresh'))
        } catch { /* backend down — stay dirty */ }
      } else {
        // no workspace open — mark clean so the dot clears
        setTabs(prev => prev.map(t => t.id === tabId ? { ...t, savedContent: t.content } : t))
      }
    }
  }, [tabs])

  const newTab = useCallback(() => {
    const t = freshTab()
    setTabs(prev => [...prev, t])
    setActiveTabId(t.id)
  }, [])

  const togglePinTab = useCallback((tabId) => {
    setTabs(prev => prev.map(t => t.id === tabId ? { ...t, pinned: !t.pinned } : t))
  }, [])

  // Cycle tabs relative to the active one (dir: +1 / -1)
  const cycleTab = useCallback((dir) => {
    setTabs(prev => {
      const idx = prev.findIndex(t => t.id === activeTabId)
      if (idx !== -1 && prev.length > 1) {
        setActiveTabId(prev[(idx + dir + prev.length) % prev.length].id)
      }
      return prev
    })
  }, [activeTabId])

  // ── VS Code-style keyboard shortcuts ────────────────────────────
  // ⌘/Ctrl+S save · ⌥T new · ⌥W close · Ctrl(+Shift)+Tab cycle · ⌥1-9 jump
  useEffect(() => {
    if (activeMode !== 'DSA') return
    const onKey = (e) => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key === 's') {
        e.preventDefault()
        saveTab(activeTabId)
      } else if (e.altKey && (e.key === 't' || e.code === 'KeyT')) {
        e.preventDefault()
        newTab()
      } else if (e.altKey && (e.key === 'w' || e.code === 'KeyW')) {
        e.preventDefault()
        closeTab(activeTabId)
      } else if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault()
        cycleTab(e.shiftKey ? -1 : 1)
      } else if (e.altKey && /^[1-9]$/.test(e.key)) {
        e.preventDefault()
        const idx = Number(e.key) - 1
        setTabs(prev => {
          if (prev[idx]) setActiveTabId(prev[idx].id)
          return prev
        })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activeMode, activeTabId, saveTab, newTab, closeTab, cycleTab])

  const [stdin, setStdin] = useState('')
  const [output, setOutput] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [runPanelOpen, setRunPanelOpen] = useState(false)

  // omniCards: array of { data, patch, isGeneratingPatch, idx }
  const [omniCards, setOmniCards] = useState([])
  const [showOmni, setShowOmni] = useState(false)

  const [systemContext, setSystemContext] = useState('')
  const [pseudocode, setPseudocode] = useState('')
  const [validation, setValidation] = useState(null)
  const [useInternet, setUseInternet] = useState(false)
  const [starterStatus, setStarterStatus] = useState('')
  const [runNote, setRunNote] = useState(null)
  const [complexity, setComplexity] = useState(null)
  const [stressResults, setStressResults] = useState(null)
  const [isStressRunning, setIsStressRunning] = useState(false)
  const [undoCode, setUndoCode] = useState(null)
  const [modelMode, setModelMode] = useState('main')
  const [problemContext, setProblemContext] = useState('')
  const language = 'python'
  const [runnerLabel, setRunnerLabel] = useState('runner')
  const [backgroundStatus, setBackgroundStatus] = useState('')
  const [verdict, setVerdict] = useState(null) // null | 'correct' | { expected, actual }

  // Currently opened external file (from FileExplorer)
  const [openedFile, setOpenedFile] = useState(null) // {name, path, ext, content}

  const isSystem = activeMode === 'System Design'
  const isInterview = activeMode === 'Interview'

  // ── Open file from sidebar FileExplorer ─────────────────────────────
  const handleSidebarFileOpen = (entry) => {
    setOpenedFile(entry)
    if (!isInterview && !isSystem) {
      // Check if file is already open in a tab
      const existing = tabs.find(t => t.path === entry.path)
      if (existing) { setActiveTabId(existing.id); return }
      // Open as a new tab
      const id = 'tab-' + Date.now()
      setTabs(prev => [...prev, { id, name: entry.name, content: entry.content || '', path: entry.path, savedContent: entry.content || '' }])
      setActiveTabId(id)
    }
    // LLD mode: SystemDesignMode reads openedFile prop and manages its own tabs
  }

  // ── Mode context persistence ──────────────────────────────────
  // On mode switch: save outgoing mode's context, restore incoming mode's context (if within TTL)
  useEffect(() => {
    const prev = prevModeRef.current
    if (prev === activeMode) return
    // Save outgoing context
    if (prev === 'System Design' && systemContext.trim()) {
      saveCtxToStorage('System Design', systemContext)
      setSystemContext('')         // clear in-memory
    } else if (prev === 'DSA' && problemContext.trim()) {
      saveCtxToStorage('DSA', problemContext)
      setProblemContext('')
    }
    // Restore incoming context
    if (activeMode === 'System Design') {
      const saved = loadCtxFromStorage('System Design')
      if (saved) { setSystemContext(saved); localStorage.removeItem('ctx_System Design') }
    } else if (activeMode === 'DSA') {
      const saved = loadCtxFromStorage('DSA')
      if (saved) { setProblemContext(saved); localStorage.removeItem('ctx_DSA') }
    }
    prevModeRef.current = activeMode
  }, [activeMode])

  // Schedule deletion of stale context after TTL
  useEffect(() => {
    const timer = setTimeout(() => {
      ['System Design', 'DSA', 'Interview'].forEach(m => {
        try {
          const raw = localStorage.getItem(`ctx_${m}`)
          if (raw) {
            const { ts } = JSON.parse(raw)
            if (Date.now() - ts > CTX_TTL_MS) localStorage.removeItem(`ctx_${m}`)
          }
        } catch {}
      })
    }, CTX_TTL_MS)
    return () => clearTimeout(timer)
  }, [])

  // ── helpers ──────────────────────────────────────────────────
  const clearOmni = () => { setOmniCards([]); setShowOmni(false) }

  // Replace all cards with a single new one (error/single-result flow)
  const handleOmniResult = (data) => {
    setOmniCards([{ data, patch: null, isGeneratingPatch: false, idx: 0 }])
    setShowOmni(true)
  }

  // Add a card without replacing others (explain-detail flow)
  const handleAddOmniCard = (data) => {
    setOmniCards(prev => {
      const idx = prev.length
      return [...prev, { data, patch: null, isGeneratingPatch: false, idx }]
    })
    setShowOmni(true)
  }

  const handleGenerateFix = async (cardIdx) => {
    const card = omniCards.find(c => c.idx === cardIdx)
    if (!card || !code) return
    setOmniCards(prev => prev.map(c => c.idx === cardIdx ? { ...c, isGeneratingPatch: true } : c))
    try {
      const patch = await generatePatch(code, card.data, language, modelMode)
      if (patch.available !== false) {
        setOmniCards(prev => prev.map(c => c.idx === cardIdx ? { ...c, patch, isGeneratingPatch: false } : c))
      } else {
        setOmniCards(prev => prev.map(c => c.idx === cardIdx ? { ...c, isGeneratingPatch: false } : c))
      }
    } catch {
      setOmniCards(prev => prev.map(c => c.idx === cardIdx ? { ...c, isGeneratingPatch: false } : c))
    }
  }

  const handleApplyPatch = (cardIdx, patch) => {
    if (!patch) return
    setUndoCode(code)
    const lines = code.split('\n')
    const action = String(patch.action || 'REPLACE').toUpperCase()
    let snippetLines = String(patch.code_snippet || '').split('\n')

    let start = Math.max(0, Math.min(lines.length - 1, (patch.start_line || 1) - 1))
    let end = Math.max(start, Math.min(lines.length - 1, (patch.end_line || patch.start_line || 1) - 1))

    if (action === 'REPLACE') {
      const belowSet = new Set(lines.slice(end + 1).map(l => l.trimEnd()))
      snippetLines = snippetLines.filter(l =>
        l.trim().startsWith('# Patch accepted:') || !belowSet.has(l.trimEnd())
      )
      if (snippetLines.length > end - start + 1) {
        const body = snippetLines.filter(l => !l.trim().startsWith('# Patch accepted:'))
        let pushed = 0
        for (let si = 0; si < body.length && start - pushed > 0; si++) {
          if (body[si].trimEnd() === (lines[start - pushed - 1] || '').trimEnd()) pushed++
          else break
        }
        start = Math.max(0, start - pushed)
      }
      const targetIndent = (lines[start] || '').match(/^(\s*)/)[1]
      const firstCode = snippetLines.find(l => !l.trim().startsWith('# Patch accepted:') && l.trim())
      if (firstCode) {
        const snippetIndent = firstCode.match(/^(\s*)/)[1]
        if (snippetIndent !== targetIndent) {
          const delta = targetIndent.length - snippetIndent.length
          snippetLines = snippetLines.map(l => {
            if (!l.trim()) return l
            if (l.trim().startsWith('# Patch accepted:')) return targetIndent + l.trim()
            if (delta > 0) return ' '.repeat(delta) + l
            if (delta < 0) return l.slice(-delta)
            return l
          })
        }
      }
    }

    if (action === 'INSERT') {
      // Auto-indent: match the indentation of the surrounding line
      const contextLine = lines[start] || lines[Math.max(0, start - 1)] || ''
      const targetIndent = contextLine.match(/^(\s*)/)[1]
      // Find base indent of the snippet
      const nonEmpty = snippetLines.filter(l => l.trim())
      if (nonEmpty.length > 0) {
        const snippetBase = nonEmpty[0].match(/^(\s*)/)[1]
        if (snippetBase !== targetIndent) {
          const delta = targetIndent.length - snippetBase.length
          snippetLines = snippetLines.map(l => {
            if (!l.trim()) return l
            if (delta > 0) return ' '.repeat(delta) + l
            if (delta < 0) return l.slice(-delta)
            return l
          })
        }
      }
      lines.splice(start, 0, ...snippetLines)
    }
    else if (action === 'DELETE') lines.splice(start, end - start + 1)
    else lines.splice(start, end - start + 1, ...snippetLines)

    setCode(lines.join('\n'))
    setSuccess(true)
    setError('')

    // Remove applied card; close omni view if no cards left
    setOmniCards(prev => {
      const next = prev.filter(c => c.idx !== cardIdx)
      if (next.length === 0) setShowOmni(false)
      return next
    })
  }

  const handleDismissOmni = (cardIdx) => {
    setOmniCards(prev => {
      const next = prev.filter(c => c.idx !== cardIdx)
      if (next.length === 0) setShowOmni(false)
      return next
    })
  }

  const undoAIChange = () => {
    if (undoCode === null) return
    setCode(undoCode)
    setUndoCode(null)
    clearOmni()
    setSuccess(false)
  }

  // ── starter ──────────────────────────────────────────────────
  const loadDynamicStarter = async () => {
    if (isInterview) return
    setStarterStatus('Generating dynamic starter...')
    try {
      const data = await getStarterCode(activeMode, language, isSystem ? systemContext : '', useInternet, modelMode)
      if (data.available === false) {
        setStarterStatus(data.error || 'Dynamic starter unavailable')
        if (!code.trim()) setCode('')
        return
      }
      if (!code.trim() || window.confirm('Replace current editor with dynamic starter?')) {
        setCode(data.code || '')
        if (data.title) setEditorTitle(data.title)
        if (data.stdin !== undefined) setStdin(data.stdin || '')
      }
      setStarterStatus(data.note || 'Dynamic starter loaded')
    } catch (err) {
      setStarterStatus(`Dynamic starter needs backend/LLM: ${err.message}`)
      if (!code.trim()) setCode('')
    }
  }

  useEffect(() => {
    if (!isInterview && !code.trim()) loadDynamicStarter()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMode])

  // ── run ──────────────────────────────────────────────────────
  const handleRun = async () => {
    if (isInterview) return
    if (isSystem) return handleValidateSystem()

    setRunPanelOpen(true)
    setIsRunning(true)
    setError('')
    setOutput('')
    setSuccess(false)
    setVerdict(null)
    clearOmni()
    setRunNote(null)
    setComplexity(null)
    setStressResults(null)
    setBackgroundStatus('')

    try {
      const result = await runCodeOnServer(code, activeMode, stdin, language, modelMode)
      setOutput(result.output || '')
      setError(result.error || '')
      setSuccess(Boolean(result.success))
      setRunNote(result.run_explanation || null)
      setComplexity(result.complexity || result.run_explanation || null)
      setRunnerLabel(result.runner || 'runner')
      setIsRunning(false)

      setBackgroundStatus('AI analysis running in background...')
      const backgroundJobs = []

      backgroundJobs.push(
        explainRunResult(code, activeMode, stdin, result.output || '', result.error || '', Boolean(result.success), useInternet, modelMode)
          .then(note => setRunNote(note))
          .catch(() => null)
      )

      backgroundJobs.push(
        analyzeComplexity(code, activeMode, isSystem ? systemContext : '', modelMode)
          .then(cx => setComplexity(cx))
          .catch(() => null)
      )

      if (!result.success && (result.error || '').trim()) {
        // Runtime/compiler error → repair card
        backgroundJobs.push(
          analyzeCode(code, result.error || '', result.output || '', activeMode, language, modelMode)
            .then(async data => {
              if (data.available !== false) {
                handleOmniResult(data)
                const q = `Explain the function at line ${data.line} — what it's supposed to do, what parameters it expects, and how it should work correctly.`
                const ctx = await analyzeCode(code, '', '', activeMode, language, modelMode, q).catch(() => null)
                if (ctx && ctx.available !== false) handleAddOmniCard({ ...ctx, issue_type: 'QUESTION' })
              }
            })
            .catch(() => null)
        )
      } else if (result.success && problemContext.trim() && (result.output || '').trim()) {
        // Successful run + problem context → check for wrong answer
        const actualOut = (result.output || '').trim()
        const expectedVal = resolveExpectedOutput(problemContext, stdin)
        const isCorrect = expectedVal ? outputsMatch(actualOut, expectedVal) : null

        if (isCorrect === true) {
          setVerdict('correct')
        } else if (isCorrect === false) {
          setVerdict({ expected: expectedVal, actual: actualOut })
          const expectedHint = ` Expected: "${expectedVal}", Got: "${actualOut}".`
          const waError = `WRONG ANSWER: output "${actualOut}" is incorrect.${expectedHint}`
          const waQuestion = `WRONG ANSWER: actual="${actualOut}"${expectedHint} Problem: ${problemContext.substring(0, 500)}. Find the exact line where the wrong value is assigned.`
          backgroundJobs.push(
            analyzeCode(code, waError, actualOut, activeMode, language, modelMode, waQuestion)
              .then(async data => {
                if (data.available !== false) {
                  handleOmniResult(data)
                  const q = `What is the bug on line ${data.line}? Explain expected vs actual behavior.`
                  const ctx = await analyzeCode(code, '', '', activeMode, language, modelMode, q).catch(() => null)
                  if (ctx && ctx.available !== false) handleAddOmniCard({ ...ctx, issue_type: 'QUESTION' })
                }
              })
              .catch(() => null)
          )
        }
      }

      Promise.allSettled(backgroundJobs).then(() => setBackgroundStatus('AI analysis ready'))
    } catch (err) {
      setError(`Backend error: ${err.message}`)
      setSuccess(false)
      clearOmni()
      setIsRunning(false)
      setBackgroundStatus('')
    }
  }

  const handleValidateSystem = async () => {
    setIsRunning(true)
    setValidation(null)
    try {
      const result = await validateSystemDesign(systemContext, 'Diagram should be generated dynamically from context/code/pseudocode.', code, pseudocode, useInternet, modelMode)
      setValidation(result)
    } catch (err) {
      setValidation({ works: false, diagram_style: 'Unavailable', summary: `Backend error: ${err.message}`, gaps: [], repair_gap: null, suggestions: [], diagram: null })
    } finally {
      setIsRunning(false)
    }
  }

  const handleStressTest = async () => {
    if (isSystem || isInterview) return
    setRunPanelOpen(true)
    setIsStressRunning(true)
    setStressResults(null)
    try {
      const data = await runStressTest(code, activeMode, 6, language, modelMode)
      setStressResults(data)
    } catch (err) {
      setStressResults({ results: [{ name: 'Stress test backend error', stdin: '', output: '', error: err.message, passed: false }] })
    } finally {
      setIsStressRunning(false)
    }
  }

  const clearRun = () => { setOutput(''); setError(''); setSuccess(false) }

  if (booting) return <SplashScreen onReady={() => setBooting(false)} />

  return (
    <div className="app-shell">
      <div className="bg-glow one" />
      <div className="bg-glow two" />
      <Sidebar
        activeMode={activeMode}
        setActiveMode={setActiveMode}
        onFileOpen={handleSidebarFileOpen}
        selectedPath={openedFile?.path}
      />
      <main className="main-area">
        <TopBar activeMode={activeMode} onRun={handleRun} isRunning={isRunning} />

        {isInterview ? (
          <InterviewMode useInternet={useInternet} setUseInternet={setUseInternet} modelMode={modelMode} />
        ) : isSystem ? (
          <SystemDesignMode
            context={systemContext}
            setContext={setSystemContext}
            modelMode={modelMode}
            externalFile={openedFile}
          />
        ) : (
          <>
            <AssistantPanel
              activeMode={activeMode}
              code={code}
              context={problemContext}
              modelMode={modelMode}
              language={language}
              runOutput={output}
              runError={error}
              onOmniResult={handleOmniResult}
              onAddOmniCard={handleAddOmniCard}
            />
            <div className="workspace-with-context">
              <div className="workspace-grid-solo">
                <div className="workspace-left">
                  <CodeEditor
                    code={code}
                    setCode={setCode}
                    omniCards={omniCards}
                    showOmni={showOmni}
                    onGenerateFix={handleGenerateFix}
                    onApplyPatch={handleApplyPatch}
                    onDismissOmni={handleDismissOmni}
                    title={editorTitle}
                    language={language}
                    tabs={tabs.map(t => ({ ...t, dirty: t.path ? t.content !== t.savedContent : false }))}
                    activeTabId={activeTabId}
                    onTabSelect={selectTab}
                    onTabClose={closeTab}
                    onNewTab={newTab}
                    onTabRename={renameTab}
                    onTabReorder={reorderTabs}
                    onTabTogglePin={togglePinTab}
                    onTabCloseOthers={closeOtherTabs}
                    onTabCloseRight={closeTabsToRight}
                    onTabCloseAll={closeAllTabs}
                  />
                </div>
              </div>
              <ContextPanel context={problemContext} setContext={setProblemContext} />
            </div>
            <BuildRunPanel
              open={true}
              stdin={stdin}
              setStdin={setStdin}
              output={output}
              error={error}
              success={success}
              isRunning={isRunning}
              runNote={runNote}
              complexity={complexity}
              stressResults={stressResults}
              isStressRunning={isStressRunning}
              backgroundStatus={backgroundStatus}
              verdict={verdict}
              onStressTest={handleStressTest}
              onUndo={undoAIChange}
              canUndo={undoCode !== null}
              language="Python 3"
              runner={runnerLabel}
              onRun={handleRun}
              onClear={clearRun}
            />
          </>
        )}
      </main>
    </div>
  )
}
