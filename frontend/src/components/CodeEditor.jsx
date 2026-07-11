import { FileCode2, MoreHorizontal } from 'lucide-react'
import { useEffect, useMemo, useRef } from 'react'
import hljs from 'highlight.js/lib/core'
import python from 'highlight.js/lib/languages/python'
import OmniEditCard from './OmniEditCard.jsx'
import TabBar from './TabBar.jsx'

hljs.registerLanguage('python', python)

function lineRange(start, count) {
  if (count <= 0) return ''
  return Array.from({ length: count }, (_, i) => start + i).join('\n')
}

function applyKeyDown(e, setCodeFn) {
  const ta = e.target
  const { selectionStart, selectionEnd, value } = ta

  if (e.key === 'Tab') {
    e.preventDefault()
    const newVal = value.slice(0, selectionStart) + '    ' + value.slice(selectionEnd)
    setCodeFn(newVal)
    requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = selectionStart + 4 })
    return
  }

  if (e.key === 'Enter') {
    const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1
    const currentLine = value.slice(lineStart, selectionStart)
    const indent = currentLine.match(/^(\s*)/)[1]
    const extraIndent = value[selectionStart - 1] === ':' ? '    ' : ''
    e.preventDefault()
    const newVal = value.slice(0, selectionStart) + '\n' + indent + extraIndent + value.slice(selectionEnd)
    setCodeFn(newVal)
    const newPos = selectionStart + 1 + indent.length + extraIndent.length
    requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = newPos })
    return
  }

  const pairs = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'" }
  const closers = new Set([')', ']', '}', '"', "'"])

  if (pairs[e.key] && selectionStart === selectionEnd) {
    const next = value[selectionStart]
    if ((e.key === '"' || e.key === "'") && next === e.key) return
    e.preventDefault()
    const newVal = value.slice(0, selectionStart) + e.key + pairs[e.key] + value.slice(selectionEnd)
    setCodeFn(newVal)
    requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = selectionStart + 1 })
    return
  }

  if (closers.has(e.key) && value[selectionStart] === e.key && selectionStart === selectionEnd) {
    e.preventDefault()
    requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = selectionStart + 1 })
    return
  }

  if (e.key === 'Backspace' && selectionStart === selectionEnd && selectionStart > 0) {
    const prev = value[selectionStart - 1]
    const next = value[selectionStart]
    const pairMap = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'" }
    if (pairMap[prev] === next) {
      e.preventDefault()
      const newVal = value.slice(0, selectionStart - 1) + value.slice(selectionStart + 1)
      setCodeFn(newVal)
      requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = selectionStart - 1 })
    }
  }
}

// Highlighted overlay — pre rendered behind transparent textarea
function HighlightedEditor({ code, setCode, language = 'python' }) {
  const preRef  = useRef(null)
  const taRef   = useRef(null)

  const highlighted = useMemo(() => {
    try {
      return hljs.highlight(code || ' ', { language }).value
    } catch {
      return code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    }
  }, [code, language])

  // Keep pre scroll in sync with textarea
  const syncScroll = () => {
    if (preRef.current && taRef.current) {
      preRef.current.scrollTop  = taRef.current.scrollTop
      preRef.current.scrollLeft = taRef.current.scrollLeft
    }
  }

  return (
    <div className="hl-editor-wrap">
      <pre
        ref={preRef}
        className="hl-pre"
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: highlighted + '\n' }}
      />
      <textarea
        ref={taRef}
        className="hl-textarea"
        value={code}
        spellCheck="false"
        autoCapitalize="off"
        autoComplete="off"
        autoCorrect="off"
        onScroll={syncScroll}
        onChange={e => setCode(e.target.value)}
        onKeyDown={e => applyKeyDown(e, setCode)}
        placeholder="Write your solution here..."
      />
    </div>
  )
}

// Gutter + highlighted editor as one unit (for segment mode)
function GutterEditor({ code, setCode, startLine, language }) {
  const preGRef = useRef(null)
  const taRef   = useRef(null)
  const preRef  = useRef(null)
  const lines = code.split('\n')
  const count = Math.max(1, lines.length)

  const highlighted = useMemo(() => {
    try {
      return hljs.highlight(code || ' ', { language }).value
    } catch {
      return code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    }
  }, [code, language])

  const syncScroll = () => {
    if (taRef.current && preRef.current && preGRef.current) {
      preRef.current.scrollTop  = taRef.current.scrollTop
      preRef.current.scrollLeft = taRef.current.scrollLeft
      preGRef.current.scrollTop = taRef.current.scrollTop
    }
  }

  return (
    <div className="code-textarea-shell seg-shell">
      <pre ref={preGRef} className="line-gutter seg-gutter" aria-hidden="true">
        {lineRange(startLine, count)}
      </pre>
      <div className="hl-editor-wrap seg-hl-wrap">
        <pre
          ref={preRef}
          className="hl-pre"
          aria-hidden="true"
          dangerouslySetInnerHTML={{ __html: highlighted + '\n' }}
        />
        <textarea
          ref={taRef}
          className="hl-textarea"
          value={code}
          rows={count}
          spellCheck="false"
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          onScroll={syncScroll}
          onChange={e => {
            const allLines = code.split('\n')
            const newLines = e.target.value.split('\n')
            setCode(newLines.join('\n'))
          }}
          onKeyDown={e => applyKeyDown(e, v => setCode(v))}
        />
      </div>
    </div>
  )
}

// Build segments for multiple cards sorted by line
function buildMultiSegments(allLines, cards) {
  const sorted = [...cards]
    .sort((a, b) => (a.data.line || 1) - (b.data.line || 1))

  const segments = []
  let consumed = 0

  for (const card of sorted) {
    const insertAt = Math.max(consumed, Math.min((card.data.line || 1) - 1, allLines.length))
    if (insertAt > consumed) {
      segments.push({ type: 'code', lines: allLines.slice(consumed, insertAt), from: consumed, to: insertAt, startLine: consumed + 1 })
    }
    segments.push({ type: 'card', card })
    consumed = insertAt
  }

  if (consumed < allLines.length) {
    segments.push({ type: 'code', lines: allLines.slice(consumed), from: consumed, to: allLines.length, startLine: consumed + 1 })
  }

  return segments
}

function SegTextarea({ seg, code, setCode, language }) {
  const segCode = seg.lines.join('\n')
  const update = (newText) => {
    const allLines = code.split('\n')
    const newLines = newText.split('\n')
    setCode([...allLines.slice(0, seg.from), ...newLines, ...allLines.slice(seg.to)].join('\n'))
  }
  return <GutterEditor code={segCode} setCode={update} startLine={seg.startLine} language={language} />
}

export default function CodeEditor({
  code,
  setCode,
  omniCards = [],
  showOmni,
  onGenerateFix,
  onApplyPatch,
  onDismissOmni,
  title = 'main.py',
  language = 'python',
  // multi-tab props (optional — omit for single-file use like LLD)
  tabs,
  activeTabId,
  onTabSelect,
  onTabClose,
  onNewTab,
  onTabRename,
  onTabReorder,
  onTabTogglePin,
  onTabCloseOthers,
  onTabCloseRight,
  onTabCloseAll,
}) {
  const displayLang = language === 'python' ? 'Python 3' : 'C++17'
  const lines = code.split('\n')
  const totalLines = lines.length
  const allLineNums = useMemo(() => lineRange(1, Math.max(1, totalLines)), [totalLines])
  const preGRef = useRef(null)
  const taRef   = useRef(null)
  const preRef  = useRef(null)

  const highlighted = useMemo(() => {
    try {
      return hljs.highlight(code || ' ', { language }).value
    } catch {
      return (code || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    }
  }, [code, language])

  const syncScroll = () => {
    if (taRef.current && preRef.current && preGRef.current) {
      preRef.current.scrollTop  = taRef.current.scrollTop
      preRef.current.scrollLeft = taRef.current.scrollLeft
      preGRef.current.scrollTop = taRef.current.scrollTop
    }
  }

  // Tab bar: full VS Code-style multi-tab, or single-tab fallback (LLD passes no tabs)
  const tabBar = tabs && tabs.length > 0 ? (
    <TabBar
      tabs={tabs}
      activeTabId={activeTabId}
      onSelect={onTabSelect}
      onClose={onTabClose}
      onNewTab={onNewTab}
      onRename={onTabRename}
      onReorder={onTabReorder}
      onTogglePin={onTabTogglePin}
      onCloseOthers={onTabCloseOthers}
      onCloseRight={onTabCloseRight}
      onCloseAll={onTabCloseAll}
    />
  ) : (
    <div className="editor-tabs">
      <div className="file-tab active"><FileCode2 size={15} /> {title} <small>{displayLang}</small></div>
      <MoreHorizontal size={18} className="tab-more" />
    </div>
  )

  // ── Omni-edit mode: show analysis cards inline at issue lines ──
  if (showOmni && omniCards.length > 0) {
    const segments = buildMultiSegments(lines, omniCards)
    return (
      <section className="editor-card multi-card-mode">
        {tabBar}
        <div className="editor-segments">
          {segments.map((seg, i) =>
            seg.type === 'code' ? (
              <SegTextarea key={`seg-code-${i}`} seg={seg} code={code} setCode={setCode} language={language} />
            ) : (
              <div key={`seg-card-${i}`} className="repair-gap-inline">
                <OmniEditCard
                  data={seg.card.data}
                  patchData={seg.card.patch}
                  isGeneratingPatch={seg.card.isGeneratingPatch}
                  onGenerateFix={() => onGenerateFix(seg.card.idx)}
                  onApply={(patch) => onApplyPatch(seg.card.idx, patch)}
                  onDismiss={() => onDismissOmni(seg.card.idx)}
                />
              </div>
            )
          )}
        </div>
      </section>
    )
  }

  // ── Normal editor with syntax highlighting ────────────────────
  return (
    <section className="editor-card">
      {tabBar}
      <div className="code-textarea-shell">
        <pre ref={preGRef} className="line-gutter" aria-hidden="true">{allLineNums}</pre>
        <div className="hl-editor-wrap">
          <pre
            ref={preRef}
            className="hl-pre"
            aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: highlighted + '\n' }}
          />
          <textarea
            ref={taRef}
            className="hl-textarea"
            value={code}
            spellCheck="false"
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            onScroll={syncScroll}
            onChange={e => setCode(e.target.value)}
            onKeyDown={e => applyKeyDown(e, setCode)}
            placeholder="Write your solution here..."
          />
        </div>
      </div>
    </section>
  )
}
