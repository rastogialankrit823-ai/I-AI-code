import { Check, Code2, Cpu, Globe, Moon, Settings, Sun, Trophy, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { getAppSettings, setAILanguage } from '../api.js'
import FileExplorer from './FileExplorer.jsx'

export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme)
  localStorage.setItem('app_theme', theme)
}

const modes = [
  { id: 'DSA',           label: 'DSA Mode',       sub: 'Solve & optimize DSA', icon: Code2 },
  { id: 'System Design', label: 'LLD Mode',       sub: 'Low Level Design',     icon: Cpu },
  { id: 'Interview',     label: 'Interview Mode', sub: 'Mock interviews',      icon: Trophy },
]

const LANGS = [
  { id: 'hinglish', label: 'Hinglish', sample: '"Bro, yahan base case missing hai"' },
  { id: 'english',  label: 'English',  sample: '"Bro, the base case is missing here"' },
]

const THEMES = [
  { id: 'dark',  label: 'Dark',  icon: Moon },
  { id: 'light', label: 'Light', icon: Sun },
]

function SettingsPopover({ onClose }) {
  const [lang, setLang] = useState(localStorage.getItem('ai_lang') || 'hinglish')
  const [theme, setTheme] = useState(localStorage.getItem('app_theme') || 'dark')
  const [saving, setSaving] = useState(false)
  const ref = useRef(null)

  const pickTheme = (id) => {
    if (id === theme) return
    setTheme(id)
    applyTheme(id)
  }

  // Sync from backend on open (backend persists across restarts)
  useEffect(() => {
    getAppSettings()
      .then(s => { if (s.language) { setLang(s.language); localStorage.setItem('ai_lang', s.language) } })
      .catch(() => {})
  }, [])

  // Close on outside click
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const pick = async (id) => {
    if (id === lang || saving) return
    setSaving(true)
    try {
      await setAILanguage(id)
      setLang(id)
      localStorage.setItem('ai_lang', id)
    } catch { /* backend down — keep old */ }
    finally { setSaving(false) }
  }

  return (
    <div className="settings-pop" ref={ref}>
      <div className="settings-pop-header">
        <Settings size={13} /> Settings
        <button className="settings-pop-close" onClick={onClose}><X size={12} /></button>
      </div>
      <div className="settings-pop-section">
        <div className="settings-pop-label"><Globe size={12} /> AI Answer Language</div>
        {LANGS.map(l => (
          <button
            key={l.id}
            className={`settings-lang-option${lang === l.id ? ' active' : ''}`}
            onClick={() => pick(l.id)}
            disabled={saving}
          >
            <span className="settings-lang-name">{l.label}</span>
            <span className="settings-lang-sample">{l.sample}</span>
            {lang === l.id && <Check size={13} className="settings-lang-check" />}
          </button>
        ))}
        <div className="settings-pop-hint">Applies to all AI replies — explanations, hints, feedback, judge.</div>
      </div>
      <div className="settings-pop-section">
        <div className="settings-pop-label"><Sun size={12} /> Theme</div>
        <div className="settings-theme-row">
          {THEMES.map(t => {
            const Icon = t.icon
            return (
              <button
                key={t.id}
                className={`settings-theme-option${theme === t.id ? ' active' : ''}`}
                onClick={() => pickTheme(t.id)}
              >
                <Icon size={13} /> {t.label}
                {theme === t.id && <Check size={12} className="settings-lang-check" style={{ position: 'static', transform: 'none', marginLeft: 'auto' }} />}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default function Sidebar({ activeMode, setActiveMode, onFileOpen, selectedPath }) {
  const [settingsOpen, setSettingsOpen] = useState(false)

  return (
    <aside className="sidebar glass-panel">
      <div className="brand-row">
        <div className="brand-mark">I×</div>
        <div>
          <div className="brand-title">I&amp;AI Code</div>
          <div className="brand-sub">AI Coding Companion</div>
        </div>
      </div>

      <div className="nav-section-label">Modes</div>
      <div className="mode-list">
        {modes.map((mode) => {
          const Icon = mode.icon
          const active = activeMode === mode.id
          return (
            <button
              key={mode.id}
              className={`mode-item ${active ? 'active' : ''}`}
              onClick={() => setActiveMode(mode.id)}
            >
              <Icon size={18} />
              <span>
                <b>{mode.label}</b>
                <small>{mode.sub}</small>
              </span>
            </button>
          )
        })}
      </div>

      <FileExplorer onFileOpen={onFileOpen} selectedPath={selectedPath} />

      <div className="ai-status-bar" style={{ position: 'relative' }}>
        <span className="ai-dot" />
        <div className="ai-status-text">
          <b>AI Online</b>
          <small>Qwen 3B · Local</small>
        </div>
        <button
          className={`ai-status-btn${settingsOpen ? ' active' : ''}`}
          title="Settings"
          onClick={() => setSettingsOpen(v => !v)}
        >
          <Settings size={14} />
        </button>
        {settingsOpen && <SettingsPopover onClose={() => setSettingsOpen(false)} />}
      </div>
    </aside>
  )
}
