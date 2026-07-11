import {
  Activity, Bot, ChevronDown, ChevronRight, ChevronUp,
  Code2, Database, FileCode2, FilePlus, FileText,
  Folder, FolderOpen, Layers, Loader2, Play,
  RefreshCcw, Send, Server, Terminal, Trash2, Workflow, Zap
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  aiGenerateLLDFile, aiPatchLLDFile, chatWithBro,
  deleteWorkspaceFile, generateLLDStructure,
  getLLDWorkspaceFiles, readWorkspaceFile,
  runWorkspaceCommand, writeFsFile, writeWorkspaceFile
} from '../api.js'
import CodeEditor from './CodeEditor.jsx'
import TabBar from './TabBar.jsx'

const TYPE_ICON = {
  class: Layers, interface: Workflow, abstract: Activity,
  enum: Database, service: Server, pattern: Zap,
}

function extToLang(ext) {
  return { py: 'python', js: 'javascript', ts: 'typescript', cpp: 'cpp', java: 'java' }[ext] || 'python'
}

// ── Structure content ───────────────────────────────────────────────────────
function StructureContent({ structure, loading }) {
  if (loading) return (
    <div className="lld-structure-empty">
      <Loader2 size={18} className="spin" />
      <p>Generating...</p>
    </div>
  )
  if (!structure?.classes?.length) return (
    <div className="lld-structure-empty">
      <Layers size={18} style={{ color: 'var(--muted)' }} />
      <p>Auto-generates from context<br />every 10 min</p>
    </div>
  )
  return (
    <div className="lld-structure-body">
      {structure.summary && <p className="lld-struct-summary">{structure.summary}</p>}
      {structure.patterns?.length > 0 && (
        <div className="lld-struct-patterns">
          {structure.patterns.map((p, i) => <span key={i} className="lld-pattern-chip">{p}</span>)}
        </div>
      )}
      <div className="lld-struct-classes">
        {structure.classes.map((cls, i) => {
          const Icon = TYPE_ICON[cls.type] || Layers
          return (
            <div key={i} className="lld-class-box">
              <div className="lld-class-header">
                <Icon size={12} /><b>{cls.name}</b>
                <span className="lld-class-type">{cls.type}</span>
              </div>
              {cls.attributes?.length > 0 && (
                <div className="lld-class-section">
                  {cls.attributes.map((a, j) => <div key={j} className="lld-class-attr">{a}</div>)}
                </div>
              )}
              {cls.methods?.length > 0 && (
                <div className="lld-class-section lld-methods">
                  {cls.methods.map((m, j) => <div key={j} className="lld-class-method">{m}</div>)}
                </div>
              )}
            </div>
          )
        })}
      </div>
      {structure.relationships?.length > 0 && (
        <div className="lld-struct-rels">
          {structure.relationships.map((r, i) => (
            <div key={i} className="lld-rel-row">
              <span>{r.from}</span>
              <span className="lld-rel-arrow">→ {r.type}{r.label ? ` (${r.label})` : ''}</span>
              <span>{r.to}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── File tree node ──────────────────────────────────────────────────────────
function FileTreeNode({ node, selected, onSelect, onDelete, depth = 0 }) {
  const [open, setOpen] = useState(true)
  const Icon = node.is_dir ? (open ? FolderOpen : Folder) : FileCode2
  const ext = node.ext || ''
  const col = { py: '#3ddb96', js: '#ffb86c', ts: '#60a5fa', cpp: '#ff8080', java: '#f97316', txt: 'var(--muted)', md: '#a78bfa' }[ext] || 'var(--muted)'
  return (
    <div className="ft-node" style={{ '--depth': depth }}>
      <div
        className={`ft-row${selected === node.path ? ' selected' : ''}${node.is_dir ? ' dir' : ''}`}
        onClick={() => node.is_dir ? setOpen(o => !o) : onSelect(node)}
      >
        <Icon size={13} style={{ color: node.is_dir ? 'var(--accent)' : col, flexShrink: 0 }} />
        <span className="ft-name">{node.name}</span>
        {!node.is_dir && (
          <button className="ft-del" onClick={e => { e.stopPropagation(); onDelete(node.path) }}>
            <Trash2 size={11} />
          </button>
        )}
      </div>
      {node.is_dir && open && node.children?.map((c, i) => (
        <FileTreeNode key={i} node={c} selected={selected} onSelect={onSelect} onDelete={onDelete} depth={depth + 1} />
      ))}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
export default function SystemDesignMode({ context, setContext, modelMode = 'main', externalFile = null }) {
  // Right sidebar collapse states
  const [ctxCollapsed, setCtxCollapsed]       = useState(false)
  const [structCollapsed, setStructCollapsed] = useState(false)

  // Terminal collapse
  const [termCollapsed, setTermCollapsed] = useState(false)

  // Structure
  const [structure, setStructure]   = useState(null)
  const [structLoading, setStructLoading] = useState(false)
  const structTimerRef = useRef(null)
  const debounceRef    = useRef(null)

  // File tree
  const [files, setFiles] = useState([])
  const [newFileName, setNewFileName] = useState('')
  const [showNewFile, setShowNewFile] = useState(false)
  const [fileLoading, setFileLoading] = useState(false)
  const [fileSaving, setFileSaving]   = useState(false)

  // Multi-file tabs
  const [openTabs, setOpenTabs] = useState([])
  const [activeTabId, setActiveTabId] = useState(null)
  const activeTab = openTabs.find(t => t.id === activeTabId) || null
  const selectedFile = activeTab ? { name: activeTab.name, path: activeTab.path, ext: activeTab.ext, external: activeTab.external } : null
  const fileContent = activeTab?.content ?? ''
  const fileDirty   = activeTab?.dirty ?? false
  const setFileContent = useCallback((c) => {
    setOpenTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, content: c, dirty: true } : t))
  }, [activeTabId])
  const setFileDirty = useCallback((v) => {
    setOpenTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, dirty: v } : t))
  }, [activeTabId])

  const closeTab = useCallback((tabId) => {
    setOpenTabs(prev => {
      const idx = prev.findIndex(t => t.id === tabId)
      const next = prev.filter(t => t.id !== tabId)
      setActiveTabId(cur => cur === tabId ? (next[Math.max(0, idx - 1)]?.id || next[0]?.id || null) : cur)
      return next
    })
  }, [])

  const closeOtherTabs = useCallback((tabId) => {
    setOpenTabs(prev => prev.filter(t => t.id === tabId || t.pinned))
    setActiveTabId(tabId)
  }, [])

  const closeTabsToRight = useCallback((tabId) => {
    setOpenTabs(prev => {
      const idx = prev.findIndex(t => t.id === tabId)
      if (idx === -1) return prev
      const next = prev.filter((t, i) => i <= idx || t.pinned)
      setActiveTabId(cur => next.some(t => t.id === cur) ? cur : tabId)
      return next
    })
  }, [])

  const closeAllTabs = useCallback(() => {
    setOpenTabs(prev => {
      const next = prev.filter(t => t.pinned)
      setActiveTabId(next[0]?.id || null)
      return next
    })
  }, [])

  const reorderTabs = useCallback((fromId, toId) => {
    if (fromId === toId) return
    setOpenTabs(prev => {
      const from = prev.findIndex(t => t.id === fromId)
      const to = prev.findIndex(t => t.id === toId)
      if (from === -1 || to === -1) return prev
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }, [])

  const togglePinTab = useCallback((tabId) => {
    setOpenTabs(prev => prev.map(t => t.id === tabId ? { ...t, pinned: !t.pinned } : t))
  }, [])

  // Terminal
  const [termOutput, setTermOutput] = useState([])
  const [termRunning, setTermRunning] = useState(false)
  const termEndRef = useRef(null)

  // AI bar
  const [aiMessages, setAiMessages] = useState([])
  const [aiInput, setAiInput]       = useState('')
  const [aiBusy, setAiBusy]         = useState(false)
  const chatEndRef = useRef(null)

  // ── File tree ────────────────────────────────────────────────────────────
  const refreshFiles = useCallback(async () => {
    try { const r = await getLLDWorkspaceFiles(); setFiles(r.files || []) } catch {}
  }, [])
  useEffect(() => { refreshFiles() }, [refreshFiles])

  // ── Hydrate editor when an external file is opened from the sidebar ─────
  useEffect(() => {
    if (!externalFile?.path) return
    const node = {
      name: externalFile.name,
      path: externalFile.path,
      ext: externalFile.ext || externalFile.name?.split('.').pop() || '',
      external: true,
    }
    const existing = openTabs.find(t => t.path === node.path)
    if (existing) { setActiveTabId(existing.id); return }
    const id = 'tab-ext-' + Date.now()
    setOpenTabs(prev => [...prev, { id, ...node, content: externalFile.content || '', dirty: false }])
    setActiveTabId(id)
  }, [externalFile?.path])

  // ── Structure generator ──────────────────────────────────────────────────
  const generateStructure = useCallback(async () => {
    if (!context.trim()) return
    setStructLoading(true)
    try {
      const flat = []
      const collect = ns => ns.forEach(n => n.is_dir ? collect(n.children || []) : flat.push(n.path))
      collect(files)
      const res = await generateLLDStructure(context, flat, modelMode)
      if (res.classes?.length) setStructure(res)
    } catch {} finally { setStructLoading(false) }
  }, [context, files, modelMode])

  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(generateStructure, 3000)
    return () => clearTimeout(debounceRef.current)
  }, [context])

  useEffect(() => {
    structTimerRef.current = setInterval(generateStructure, 10 * 60 * 1000)
    return () => clearInterval(structTimerRef.current)
  }, [generateStructure])

  // ── File ops ──────────────────────────────────────────────────────────────
  const openFile = async (node) => {
    // If already open in a tab, just activate it
    const existing = openTabs.find(t => t.path === node.path)
    if (existing) { setActiveTabId(existing.id); return }

    setFileLoading(true)
    try {
      const r = await readWorkspaceFile(node.path)
      const id = 'tab-' + Date.now()
      const tab = {
        id, name: node.name, path: node.path,
        ext: node.ext || node.path.split('.').pop() || '',
        content: r.content || '', dirty: false,
        external: node.external || false,
      }
      setOpenTabs(prev => [...prev, tab])
      setActiveTabId(id)
    } catch {
      const id = 'tab-' + Date.now()
      setOpenTabs(prev => [...prev, {
        id, name: node.name, path: node.path,
        ext: node.ext || '', content: '', dirty: false, external: node.external || false,
      }])
      setActiveTabId(id)
    } finally { setFileLoading(false) }
  }

  const saveCurrentFile = async () => {
    if (!activeTab) return
    setFileSaving(true)
    try {
      if (activeTab.external) {
        await writeFsFile(activeTab.path, fileContent)
      } else {
        await writeWorkspaceFile(activeTab.path, fileContent)
        await refreshFiles()
      }
      setOpenTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, dirty: false } : t))
      addTerm(`Saved ${activeTab.path}`, 'info')
    } catch (e) { addTerm(`Save error: ${e.message}`, 'err') }
    finally { setFileSaving(false) }
  }

  const deleteFile = async (path) => {
    if (!window.confirm(`Delete ${path}?`)) return
    try {
      await deleteWorkspaceFile(path)
      setOpenTabs(prev => prev.filter(t => t.path !== path))
      if (activeTab?.path === path) setActiveTabId(openTabs.find(t => t.path !== path)?.id || null)
      await refreshFiles()
    } catch (e) { addTerm(`Delete error: ${e.message}`, 'err') }
  }

  const createNewFile = async () => {
    if (!newFileName.trim()) return
    const name = newFileName.trim()
    try {
      await writeWorkspaceFile(name, '')
      setNewFileName(''); setShowNewFile(false)
      await refreshFiles()
      openFile({ name, path: name, is_dir: false, ext: name.split('.').pop() })
    } catch (e) { addTerm(`Create error: ${e.message}`, 'err') }
  }

  // ── Terminal ──────────────────────────────────────────────────────────────
  const addTerm = (text, type = 'out') => setTermOutput(prev => [...prev, { text, type }])
  useEffect(() => { termEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [termOutput])

  const [termCmd, setTermCmd] = useState('')
  const runCommand = async (cmd) => {
    addTerm(`$ ${cmd}`, 'cmd'); setTermRunning(true)
    try {
      const r = await runWorkspaceCommand(cmd)
      if (r.stdout) r.stdout.split('\n').forEach(l => l && addTerm(l, 'out'))
      if (r.stderr) r.stderr.split('\n').forEach(l => l && addTerm(l, 'err'))
      if (r.timed_out) addTerm('Command timed out.', 'err')
      else addTerm(`exit ${r.exit_code}`, r.exit_code === 0 ? 'info' : 'err')
    } catch (e) { addTerm(`Error: ${e.message}`, 'err') }
    finally { setTermRunning(false) }
  }

  // ── AI ────────────────────────────────────────────────────────────────────
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [aiMessages])

  // Derive a sensible filename from the context or instruction
  const deriveFilename = (txt) => {
    // Explicit filename in message (e.g. parking_lot.py)
    const explicit = txt.match(/\b(\w[\w/.-]+\.(py|js|ts|java|cpp|txt|md))\b/i)
    if (explicit) return explicit[1]
    // From context: "Design Parking Lot" → parking_lot.py
    const ctx = context.trim()
    if (ctx) {
      const m = ctx.match(/design\s+(?:a\s+|an\s+)?(.+?)(?:\s+system|\s+problem)?$/im)
      if (m) return m[1].trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') + '.py'
    }
    // From instruction: "build a stack" → stack.py
    const subj = txt.match(/\b(?:for|a|an|the)\s+(\w+)\s*(?:class|system|module|service|manager|handler|impl)?/i)
    if (subj) return subj[1].toLowerCase() + '.py'
    return 'main.py'
  }

  const sendAI = async (prompt) => {
    const text = (prompt || aiInput).trim()
    if (!text || aiBusy) return
    setAiInput(''); setAiBusy(true)
    setAiMessages(prev => [...prev, { role: 'user', text }])

    // Intent detection — broad so users don't have to be precise
    const GEN_RE   = /\b(gen|generate|create|write|make|build|implement|code|produce|give me|show me)\b/i
    const PATCH_RE = /\b(fix|patch|update|modify|change|refactor|rename|remove|delete|add to|improve|clean)\b/i

    const wantsGen   = GEN_RE.test(text)
    const wantsPatch = PATCH_RE.test(text) && selectedFile

    const history = aiMessages.slice(-6).map(m => ({
      role: m.role === 'bot' ? 'assistant' : 'user', content: m.text
    }))

    try {
      if (wantsPatch && !wantsGen) {
        // ── Patch open file ──────────────────────────────────────────────
        setAiMessages(prev => [...prev, { role: 'bot', text: `Patching \`${selectedFile.name}\`...` }])
        const res = await aiPatchLLDFile(context, selectedFile.path, fileContent, text, modelMode)
        if (res.patched_content) {
          setFileContent(res.patched_content); setFileDirty(true)
          addTerm(`AI patched ${selectedFile.name}`, 'info')
          setAiMessages(prev => [
            ...prev.slice(0, -1),
            { role: 'bot', text: `Patched \`${selectedFile.name}\`. ${res.changes_summary || ''} (Ctrl+S to save)` }
          ])
        } else {
          setAiMessages(prev => [...prev.slice(0, -1), { role: 'bot', text: 'Could not patch — try rephrasing.' }])
        }

      } else if (wantsGen || (!wantsPatch && !selectedFile && context.trim())) {
        // ── Generate file ────────────────────────────────────────────────
        const fn = deriveFilename(text)
        setAiMessages(prev => [...prev, { role: 'bot', text: `Generating \`${fn}\`...` }])
        setTermCollapsed(false) // open terminal so user sees progress
        const res = await aiGenerateLLDFile(context, fn, text, '', modelMode)
        if (res.content) {
          await refreshFiles()
          // Auto-open the generated file
          openFile({ name: fn.split('/').pop(), path: fn, is_dir: false, ext: fn.split('.').pop() })
          addTerm(`✓ AI generated ${fn}`, 'info')
          setAiMessages(prev => [
            ...prev.slice(0, -1),
            { role: 'bot', text: `Created \`${fn}\`. ${res.explanation || ''}` }
          ])
        } else {
          setAiMessages(prev => [...prev.slice(0, -1), { role: 'bot', text: 'LLM returned empty content. Is the backend/model running?' }])
        }

      } else {
        // ── General chat ─────────────────────────────────────────────────
        const codeCtx = selectedFile
          ? `\n\nOpen file: ${selectedFile.path}\n\`\`\`\n${fileContent.slice(0, 800)}\n\`\`\``
          : ''
        const res = await chatWithBro(text, 'LLD', codeCtx, context, false, modelMode, history)
        const reply = res.reply || res.message || 'No response.'
        setAiMessages(prev => [...prev, { role: 'bot', text: reply }])
      }
    } catch (e) {
      setAiMessages(prev => [...prev, { role: 'bot', text: `Error: ${e.message}` }])
    } finally { setAiBusy(false) }
  }

  const fileExt       = selectedFile?.ext || 'txt'
  const showCodeEditor = ['py', 'js', 'ts', 'cpp', 'java'].includes(fileExt)

  return (
    <section className="lld-shell">

      {/* ── AI bar (top) ── */}
      <div className="lld-ai-bar">
        {aiMessages.length > 0 && (
          <div className="lld-ai-messages">
            {aiMessages.map((m, i) => (
              <div key={i} className={`chat-msg ${m.role}`}>
                {m.role === 'bot' && <Bot size={13} style={{ flexShrink: 0, marginTop: 2 }} />}
                <p style={{ whiteSpace: 'pre-wrap' }}>{m.text}</p>
              </div>
            ))}
            {aiBusy && <div className="chat-msg bot"><Loader2 size={13} className="spin" /><p>Thinking...</p></div>}
            <div ref={chatEndRef} />
          </div>
        )}
        <div className="lld-ai-input-row">
          <input
            className="assistant-search-input"
            value={aiInput}
            onChange={e => setAiInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendAI()}
            placeholder={selectedFile ? `Ask about ${selectedFile.name} · "generate parking_lot.py"` : '"generate parking_lot.py" · ask a design question...'}
            disabled={aiBusy}
          />
          <button className="assistant-send-btn" onClick={() => sendAI()} disabled={aiBusy || !aiInput.trim()}>
            {aiBusy ? <Loader2 size={14} className="spin" /> : <Send size={14} />}
          </button>
        </div>
        <div className="assistant-actions-row">
          <button className="assistant-action-btn" onClick={() => sendAI('explain the design and suggest improvements')} disabled={aiBusy}>
            <Zap size={12} /> Explain Design
          </button>
          <button className="assistant-action-btn" onClick={() => sendAI(`generate ${(context.match(/design (\w+)/i)?.[1] || 'main').toLowerCase()}.py`)} disabled={aiBusy}>
            <FilePlus size={12} /> Generate File
          </button>
          {selectedFile && <>
            <button className="assistant-action-btn" onClick={() => sendAI(`add type hints and docstrings to ${selectedFile.name}`)} disabled={aiBusy}>
              <Code2 size={12} /> Improve
            </button>
            <button className="assistant-action-btn" onClick={() => sendAI(`review ${selectedFile.name} for bugs and design issues`)} disabled={aiBusy}>
              <Activity size={12} /> Review
            </button>
          </>}
        </div>
      </div>

      {/* ── Body: workspace (left) + right sidebar ── */}
      <div className="lld-body">

        {/* Workspace: file tree + editor */}
        <div className="lld-workspace">
          {/* File tree */}
          <div className="lld-file-tree">
            <div className="lld-ft-header">
              <Folder size={13} /> Workspace
              <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
                <button className="ft-action-btn" onClick={() => setShowNewFile(v => !v)} title="New file"><FilePlus size={13} /></button>
                <button className="ft-action-btn" onClick={refreshFiles} title="Refresh"><RefreshCcw size={12} /></button>
              </div>
            </div>
            {showNewFile && (
              <div className="ft-new-file">
                <input
                  value={newFileName}
                  onChange={e => setNewFileName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && createNewFile()}
                  placeholder="filename.py"
                  autoFocus
                />
                <button onClick={createNewFile} className="assistant-send-btn" style={{ width: 28, height: 28 }}>
                  <Play size={12} />
                </button>
              </div>
            )}
            <div className="lld-ft-body">
              {files.length === 0
                ? <div className="ft-empty">No files yet.<br />Ask AI to generate one.</div>
                : files.map((n, i) => (
                  <FileTreeNode key={i} node={n} selected={selectedFile?.path} onSelect={openFile} onDelete={deleteFile} />
                ))
              }
            </div>
          </div>

          {/* File editor with open-file tabs */}
          <div className="lld-file-editor">
            {/* Open-file tab bar (VS Code-style: reorder, pin, context menu) */}
            {openTabs.length > 0 && (
              <TabBar
                tabs={openTabs}
                activeTabId={activeTabId}
                onSelect={setActiveTabId}
                onClose={closeTab}
                onReorder={reorderTabs}
                onTogglePin={togglePinTab}
                onCloseOthers={closeOtherTabs}
                onCloseRight={closeTabsToRight}
                onCloseAll={closeAllTabs}
                compact
              />
            )}

            {selectedFile ? (
              <>
                <div className="lld-editor-header">
                  <FileText size={13} /> {selectedFile.path}
                  {fileDirty && <span className="lld-dirty">unsaved</span>}
                  <button className="ghost-btn" onClick={saveCurrentFile} disabled={fileSaving || !fileDirty} style={{ marginLeft: 'auto', fontSize: 11 }}>
                    {fileSaving ? <><Loader2 size={11} className="spin" /> Saving...</> : 'Save'}
                  </button>
                  <button className="ghost-btn" onClick={() => runCommand(`python ${selectedFile.path}`)} style={{ fontSize: 11 }}
                    disabled={termRunning || !selectedFile.path.endsWith('.py')}>
                    <Play size={11} /> Run
                  </button>
                </div>
                {fileLoading
                  ? <div className="lld-editor-loading"><Loader2 size={20} className="spin" /></div>
                  : showCodeEditor
                    ? <div className="lld-editor-code-wrap">
                        <CodeEditor
                          code={fileContent}
                          setCode={setFileContent}
                          title={selectedFile.name}
                          language={extToLang(fileExt)}
                        />
                      </div>
                    : <textarea className="lld-plain-editor" value={fileContent}
                        onChange={e => setFileContent(e.target.value)} spellCheck={false} />
                }
              </>
            ) : (
              <div className="lld-editor-empty">
                <FileCode2 size={28} style={{ color: 'var(--muted)' }} />
                <p>Select a file to edit,<br />or ask AI to generate one</p>
              </div>
            )}
          </div>
        </div>

        {/* Right sidebar: context (collapsible) + structure (collapsible) */}
        <div className="lld-right-sidebar">

          {/* Context panel */}
          <div className={`lld-sidebar-section${ctxCollapsed ? ' collapsed' : ''}`}>
            <div className="lld-sidebar-section-header" onClick={() => setCtxCollapsed(v => !v)}>
              <span>Context</span>
              {ctxCollapsed ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
            </div>
            {!ctxCollapsed && (
              <textarea
                className="lld-ctx-textarea"
                value={context}
                onChange={e => setContext(e.target.value)}
                placeholder="Describe your LLD problem: Parking Lot, Splitwise, Chess, ATM...&#10;&#10;AI reads this to generate structure and help with code."
              />
            )}
          </div>

          {/* Structure panel */}
          <div className={`lld-sidebar-section lld-sidebar-section--struct${structCollapsed ? ' collapsed' : ''}`}>
            <div className="lld-sidebar-section-header" onClick={() => setStructCollapsed(v => !v)}>
              <Layers size={13} />
              <span>Structure</span>
              <span className="lld-struct-hint">auto · 10 min</span>
              <button
                className="ft-action-btn"
                style={{ marginLeft: 'auto' }}
                onClick={e => { e.stopPropagation(); generateStructure() }}
                disabled={structLoading || !context.trim()}
                title="Refresh structure"
              >
                {structLoading ? <Loader2 size={11} className="spin" /> : <RefreshCcw size={11} />}
              </button>
              {structCollapsed ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
            </div>
            {!structCollapsed && (
              <div className="lld-sidebar-section-body">
                <StructureContent structure={structure} loading={structLoading} />
              </div>
            )}
          </div>

        </div>
      </div>

      {/* ── Terminal (bottom, collapsible) ── */}
      <div className={`lld-term-bottom${termCollapsed ? ' collapsed' : ''}`}>
        <div className="lld-term-bottom-header" onClick={() => setTermCollapsed(v => !v)}>
          <Terminal size={13} />
          <span>Terminal</span>
          {termRunning && <Loader2 size={11} className="spin" style={{ color: '#ffb86c' }} />}
          {!termCollapsed && termOutput.length > 0 && (
            <button className="ghost-btn" onClick={e => { e.stopPropagation(); setTermOutput([]) }}
              style={{ fontSize: 11, marginLeft: 4 }}>Clear</button>
          )}
          <span style={{ marginLeft: 'auto' }}>
            {termCollapsed ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </span>
        </div>
        {!termCollapsed && (
          <div className="lld-term-body">
            <div className="lld-term-output">
              {termOutput.length === 0
                ? <span className="lld-term-hint">Run a command or ask AI to generate code...</span>
                : termOutput.map((l, i) => <div key={i} className={`lld-term-line ${l.type}`}>{l.text}</div>)
              }
              <div ref={termEndRef} />
            </div>
            <div className="lld-term-input">
              <span className="lld-term-prompt">$</span>
              <input
                value={termCmd}
                onChange={e => setTermCmd(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && termCmd.trim() && !termRunning) { runCommand(termCmd.trim()); setTermCmd('') } }}
                placeholder="python main.py · ls · pip install ..."
                disabled={termRunning}
              />
              <button className="assistant-send-btn"
                onClick={() => { if (termCmd.trim() && !termRunning) { runCommand(termCmd.trim()); setTermCmd('') } }}
                disabled={termRunning || !termCmd.trim()}>
                {termRunning ? <Loader2 size={13} className="spin" /> : <Play size={13} />}
              </button>
            </div>
          </div>
        )}
      </div>

    </section>
  )
}
