import { Check, Code2, Cpu, Moon, Settings, Sun, Trophy, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
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

const THEMES = [
  { id: 'dark',  label: 'Dark',  icon: Moon },
  { id: 'light', label: 'Light', icon: Sun },
]

function SettingsPopover({ onClose }) {
  const [theme, setTheme] = useState(localStorage.getItem('app_theme') || 'dark')
  const ref = useRef(null)

  const pickTheme = (id) => {
    if (id === theme) return
    setTheme(id)
    applyTheme(id)
  }

  // Close on outside click
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  return (
    <div className="settings-pop" ref={ref}>
      <div className="settings-pop-header">
        <Settings size={13} /> Settings
        <button className="settings-pop-close" onClick={onClose}><X size={12} /></button>
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
