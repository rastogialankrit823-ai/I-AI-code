import {
  ChevronDown, ChevronRight, File as FileIcon, FileCode2,
  Folder, FolderOpen, FolderPlus, Loader2, RefreshCcw, X
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { browseFs, getFsHome, readFsFile } from '../api.js'

const OPENED_KEY   = 'fx_opened_root'
const RECENT_KEY   = 'fx_recent'
const SHOW_HIDDEN  = 'fx_show_hidden'

const EXT_COLOR = {
  py: '#3ddb96', js: '#ffb86c', jsx: '#ffb86c', ts: '#60a5fa', tsx: '#60a5fa',
  cpp: '#ff8080', c: '#ff8080', h: '#ff8080', java: '#f97316',
  rs: '#ff9966', go: '#66d9ef', rb: '#ff5f5f',
  html: '#ffb86c', css: '#60a5fa', scss: '#f472b6',
  md: '#a78bfa', json: '#facc15', yaml: '#facc15', yml: '#facc15',
  txt: 'var(--muted)', sh: '#3ddb96',
}

function iconFor(entry) {
  if (entry.is_dir) return null
  const c = EXT_COLOR[entry.ext] || 'var(--muted)'
  return { color: c, Icon: FileCode2 }
}

// ── Recursive folder node ─────────────────────────────────────────────────
function Node({ entry, depth, expanded, setExpanded, childrenMap, onOpenFile, showHidden, selected }) {
  const isOpen = expanded[entry.path]
  const kids   = childrenMap[entry.path]
  const [busy, setBusy] = useState(false)

  const toggle = async () => {
    if (!entry.is_dir) { onOpenFile(entry); return }
    if (isOpen) { setExpanded(e => ({ ...e, [entry.path]: false })); return }
    if (!kids) {
      setBusy(true)
      try {
        const res = await browseFs(entry.path, showHidden)
        setExpanded(e => ({ ...e, [entry.path]: true, _c: { ...(e._c || {}), [entry.path]: res.entries } }))
      } catch {} finally { setBusy(false) }
    } else {
      setExpanded(e => ({ ...e, [entry.path]: true }))
    }
  }

  const isSelected = selected === entry.path
  const meta = iconFor(entry)

  return (
    <div className="fx-node">
      <div
        className={`fx-row${isSelected ? ' selected' : ''}${entry.is_dir ? ' dir' : ''}`}
        style={{ paddingLeft: 6 + depth * 12 }}
        onClick={toggle}
        title={entry.path}
      >
        {entry.is_dir ? (
          busy ? <Loader2 size={11} className="spin" style={{ color: 'var(--muted)' }} />
               : (isOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />)
        ) : <span style={{ width: 11 }} />}
        {entry.is_dir
          ? (isOpen ? <FolderOpen size={13} style={{ color: 'var(--accent)' }} />
                    : <Folder size={13} style={{ color: 'var(--accent)' }} />)
          : (meta ? <meta.Icon size={13} style={{ color: meta.color }} />
                  : <FileIcon size={13} style={{ color: 'var(--muted)' }} />)}
        <span className="fx-name">{entry.name}</span>
      </div>
      {entry.is_dir && isOpen && kids && kids.map((child) => (
        <Node
          key={child.path} entry={child} depth={depth + 1}
          expanded={expanded} setExpanded={setExpanded}
          childrenMap={childrenMap} onOpenFile={onOpenFile}
          showHidden={showHidden} selected={selected}
        />
      ))}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
export default function FileExplorer({ onFileOpen, selectedPath }) {
  const [rootPath, setRootPath]   = useState('')
  const [rootData, setRootData]   = useState(null)      // {path, entries}
  const [expanded, setExpandedRaw] = useState({})       // {path: bool, _c: {path: [children]}}
  const [showHidden, setShowHidden] = useState(false)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerPath, setPickerPath] = useState('')
  const [common, setCommon]       = useState([])
  const [recent, setRecent]       = useState([])

  const childrenMap = expanded._c || {}
  const setExpanded = (updater) => setExpandedRaw(prev => typeof updater === 'function' ? updater(prev) : updater)

  // ── Persist ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem(OPENED_KEY)
    const sh    = localStorage.getItem(SHOW_HIDDEN) === '1'
    setShowHidden(sh)
    if (saved) openRoot(saved, sh)
    try { setRecent(JSON.parse(localStorage.getItem(RECENT_KEY) || '[]')) } catch {}
  }, [])

  const pushRecent = (path) => {
    const next = [path, ...recent.filter(r => r !== path)].slice(0, 6)
    setRecent(next)
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  }

  // ── Open root ────────────────────────────────────────────────────────────
  const openRoot = async (path, sh = showHidden) => {
    setLoading(true); setError('')
    try {
      const res = await browseFs(path, sh)
      setRootPath(res.path)
      setRootData(res)
      setExpandedRaw({ _c: {} })
      localStorage.setItem(OPENED_KEY, res.path)
      pushRecent(res.path)
      setPickerOpen(false)
    } catch (e) { setError(e.message || 'Could not open folder') }
    finally { setLoading(false) }
  }

  const refresh = async () => {
    if (!rootPath) return
    setLoading(true)
    try {
      const res = await browseFs(rootPath, showHidden)
      setRootData(res)
      // Re-load any expanded folders
      const newChildren = {}
      for (const path of Object.keys(childrenMap)) {
        if (expanded[path]) {
          try { const r = await browseFs(path, showHidden); newChildren[path] = r.entries } catch {}
        }
      }
      setExpanded(e => ({ ...e, _c: newChildren }))
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  const closeRoot = () => {
    setRootPath(''); setRootData(null); setExpandedRaw({})
    localStorage.removeItem(OPENED_KEY)
  }

  const toggleHidden = () => {
    const next = !showHidden
    setShowHidden(next)
    localStorage.setItem(SHOW_HIDDEN, next ? '1' : '0')
    if (rootPath) openRoot(rootPath, next)
  }

  const openPicker = useCallback(async () => {
    setPickerOpen(true)
    try { const info = await getFsHome(); setCommon(info.common || []); setPickerPath(info.home) } catch {}
  }, [])

  const handleOpenFile = async (entry) => {
    try {
      const res = await readFsFile(entry.path)
      if (res.too_large) { alert(res.error); return }
      if (res.binary)    { alert('Binary file — cannot open in editor.'); return }
      onFileOpen?.({ ...entry, content: res.content })
    } catch (e) { setError(e.message) }
  }

  // ── Picker dialog ────────────────────────────────────────────────────────
  const [browsedDir, setBrowsedDir] = useState(null)
  useEffect(() => {
    if (!pickerOpen || !pickerPath) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await browseFs(pickerPath, false)
        if (!cancelled) setBrowsedDir(res)
      } catch (e) { if (!cancelled) setError(e.message) }
    })()
    return () => { cancelled = true }
  }, [pickerOpen, pickerPath])

  const shortPath = (p, n = 32) => {
    if (!p) return ''
    if (p.length <= n) return p
    return '…' + p.slice(-(n - 1))
  }

  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div className="fx-panel">
      <div className="fx-header">
        <span className="fx-title">Workspace</span>
        <div className="fx-actions">
          {rootPath && (
            <button className="fx-icon-btn" onClick={refresh} title="Refresh">
              {loading ? <Loader2 size={12} className="spin" /> : <RefreshCcw size={12} />}
            </button>
          )}
          <button className="fx-icon-btn" onClick={toggleHidden} title={showHidden ? 'Hide dotfiles' : 'Show dotfiles'}>
            <span style={{ fontSize: 10, opacity: showHidden ? 1 : .5 }}>.f</span>
          </button>
          {rootPath && (
            <button className="fx-icon-btn" onClick={closeRoot} title="Close folder">
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {!rootPath && !pickerOpen && (
        <div className="fx-empty">
          <button className="fx-open-btn" onClick={openPicker}>
            <FolderPlus size={13} /> Open Folder…
          </button>
          {recent.length > 0 && (
            <div className="fx-recent">
              <div className="fx-recent-label">Recent</div>
              {recent.map(p => (
                <button key={p} className="fx-recent-item" onClick={() => openRoot(p)} title={p}>
                  <Folder size={11} /> {p.split('/').filter(Boolean).pop() || p}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {pickerOpen && (
        <div className="fx-picker">
          <div className="fx-picker-path">
            <Folder size={11} /> <span title={pickerPath}>{shortPath(pickerPath, 30)}</span>
          </div>
          {common.length > 0 && (
            <div className="fx-picker-common">
              {common.map(c => (
                <button key={c.path} className="fx-common-chip" onClick={() => setPickerPath(c.path)}>
                  {c.name}
                </button>
              ))}
            </div>
          )}
          <div className="fx-picker-list">
            {browsedDir?.parent && (
              <div className="fx-picker-item" onClick={() => setPickerPath(browsedDir.parent)}>
                <Folder size={12} style={{ color: 'var(--accent)' }} /> ..
              </div>
            )}
            {(browsedDir?.entries || []).filter(e => e.is_dir).map(e => (
              <div key={e.path} className="fx-picker-item" onClick={() => setPickerPath(e.path)}>
                <Folder size={12} style={{ color: 'var(--accent)' }} /> {e.name}
              </div>
            ))}
          </div>
          <div className="fx-picker-actions">
            <button className="fx-picker-btn" onClick={() => setPickerOpen(false)}>Cancel</button>
            <button className="fx-picker-btn primary" onClick={() => openRoot(pickerPath)}>
              Open “{pickerPath.split('/').filter(Boolean).pop() || '/'}”
            </button>
          </div>
        </div>
      )}

      {error && <div className="fx-error">{error}</div>}

      {rootPath && rootData && (
        <>
          <div className="fx-root-path" title={rootPath}>{shortPath(rootPath, 36)}</div>
          <div className="fx-tree">
            {rootData.entries.length === 0
              ? <div className="fx-empty-tree">Empty folder</div>
              : rootData.entries.map(e => (
                <Node
                  key={e.path} entry={e} depth={0}
                  expanded={expanded} setExpanded={setExpanded}
                  childrenMap={childrenMap} onOpenFile={handleOpenFile}
                  showHidden={showHidden} selected={selectedPath}
                />
              ))
            }
          </div>
        </>
      )}
    </div>
  )
}
