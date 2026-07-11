import { AlertCircle, Check, Cpu, Loader2, Server, Zap } from 'lucide-react'
import { useEffect, useState } from 'react'

/**
 * Splash screen shown while sidecar services (llama.cpp + backend) boot.
 * Listens to Tauri "boot-status" events. Calls onReady() when both are up.
 * If we're running in a plain browser (no Tauri), it polls the services directly.
 */
export default function SplashScreen({ onReady }) {
  const [progress, setProgress] = useState(0)
  const [stage, setStage] = useState('llama')
  const [message, setMessage] = useState('Waking up services…')
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    const handleStatus = (evt) => {
      const p = evt.payload
      if (!p) return
      setStage(p.stage)
      setMessage(p.message)
      setProgress(p.progress)
      if (p.stage === 'ready') setTimeout(() => onReady?.(), 500)
      if (p.stage === 'error') setError(p.message)
    }

    // ── Tauri path: subscribe to boot-status events ────────────────────────
    let unlisten
    ;(async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event')
        unlisten = await listen('boot-status', handleStatus)
      } catch {
        // Not running under Tauri → fall through to browser polling
      }
    })()

    // ── Polling path: ALWAYS runs (also under Tauri) ───────────────────────
    // Tauri events fired before this component mounts are lost — if the
    // sidecars come up fast, the "ready" event races past us and the splash
    // hangs forever. Direct polling is the reliable ground truth.
    const isTauri = typeof window !== 'undefined' && (window.__TAURI_INTERNALS__ || window.__TAURI__)
    const poll = async () => {
      if (cancelled) return
      try {
        const b = await fetch('http://127.0.0.1:8000/').then(r => r.ok).catch(() => false)
        if (!b) throw new Error('Backend not responding on 8000')
        // Under Tauri the backend is only spawned AFTER llama.cpp is healthy,
        // so backend-up implies llama-up. In a plain browser, verify llama too.
        if (!isTauri) {
          const l = await fetch('http://127.0.0.1:8081/v1/models').then(r => r.ok).catch(() => false)
          if (!l) throw new Error('llama.cpp not responding on 8081')
        }
        setStage('ready'); setMessage('All services ready'); setProgress(100)
        setTimeout(() => !cancelled && onReady?.(), 400)
      } catch (e) {
        if (cancelled) return
        // Don't clobber richer Tauri event messages while services boot;
        // just schedule the next probe.
        if (!isTauri) {
          setStage('polling'); setMessage(`${e.message} — retrying…`); setProgress(10)
        }
        setTimeout(poll, 1500)
      }
    }
    poll()

    return () => {
      cancelled = true
      if (typeof unlisten === 'function') unlisten()
    }
  }, [onReady])

  const stageIcon = (s) => {
    if (s === 'ready') return <Check size={18} style={{ color: '#3ddb96' }} />
    if (s === 'error') return <AlertCircle size={18} style={{ color: '#ff5f5f' }} />
    return <Loader2 size={18} className="spin" style={{ color: 'var(--accent, #60a5fa)' }} />
  }

  return (
    <div className="splash-shell">
      <div className="bg-glow one" />
      <div className="bg-glow two" />
      <div className="splash-card glass-panel">
        <div className="splash-brand">
          <div className="splash-mark">I×</div>
          <div>
            <div className="splash-title">I&amp;AI Code</div>
            <div className="splash-sub">Local AI coding assistant</div>
          </div>
        </div>

        <div className={`splash-status ${stage === 'error' ? 'err' : ''}`}>
          {stageIcon(stage)}
          <span>{message}</span>
        </div>

        <div className="splash-bar">
          <div
            className={`splash-bar-fill ${stage === 'error' ? 'err' : ''}`}
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="splash-services">
          <div className={`splash-svc ${progress >= 50 ? 'done' : progress >= 5 ? 'active' : ''}`}>
            <Zap size={13} /> llama.cpp
          </div>
          <div className={`splash-svc ${progress >= 95 ? 'done' : progress >= 55 ? 'active' : ''}`}>
            <Server size={13} /> Backend
          </div>
          <div className={`splash-svc ${progress >= 100 ? 'done' : ''}`}>
            <Cpu size={13} /> UI
          </div>
        </div>

        {error && (
          <div className="splash-error">
            <b>Startup error:</b> {error}
            <div className="splash-hint">Check <code>~/Desktop/i-and-ai-code-llama-cpp/.run_logs/</code></div>
          </div>
        )}
      </div>
    </div>
  )
}
