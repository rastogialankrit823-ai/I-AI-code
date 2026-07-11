import { Hammer, Play } from 'lucide-react'

export default function TopBar({ activeMode, onRun, isRunning }) {
  const system = activeMode === 'System Design'
  const interview = activeMode === 'Interview'
  const showActions = !interview && !system
  return (
    <header className="topbar glass-panel">
      <div className="topbar-left">
        <div className="window-dots"><i /><i /><i /></div>
        <div>
          <b>{system ? 'LLD Mode' : activeMode}</b>
          <span>{system ? 'Low Level Design — AI-powered workspace' : interview ? 'DSA + LLD interview practice' : 'Code with a smart AI companion'}</span>
        </div>
      </div>
      {showActions && (
        <div className="topbar-actions">
          <div className="lang-badge">
            <span className="lang-dot py" />
            <span>Python 3</span>
          </div>
          <button className="primary-btn" onClick={onRun} disabled={isRunning}>
            <Play size={16} />
            {isRunning ? 'Running...' : 'Build & Run'}
          </button>
        </div>
      )}
    </header>
  )
}
