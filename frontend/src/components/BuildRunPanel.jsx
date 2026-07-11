import { Activity, ChevronDown, ChevronUp, Eraser, FlaskConical, History, Play, Sparkles, ThumbsUp, Zap } from 'lucide-react'
import { useState } from 'react'

export default function BuildRunPanel({
  open,
  stdin,
  setStdin,
  output,
  error,
  success,
  isRunning,
  runNote,
  complexity,
  stressResults,
  isStressRunning = false,
  backgroundStatus = '',
  verdict = null,
  language = 'C++',
  runner = 'runner',
  onRun,
  onClear,
  onStressTest,
  onUndo,
  canUndo = false,
  onClose,
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [activeTab, setActiveTab] = useState('run')
  const cx = complexity || runNote || {}
  const hasStressResults = stressResults?.results?.length > 0

  const handleStressTab = () => {
    setActiveTab('stress')
    if (!hasStressResults && !isStressRunning) onStressTest?.()
  }

  return (
    <section className={`run-panel${collapsed ? ' run-panel-collapsed' : ''}`}>
      <div className="run-panel-tabbar">
        <button
          className={`run-panel-tab ${activeTab === 'run' ? 'active' : ''}`}
          onClick={() => setActiveTab('run')}
        >
          <Play size={13} />
          <span>Build &amp; Run</span>
          {!collapsed && activeTab === 'run' && (
            <span className="run-panel-lang-pill">{String(runner).replace('_', ' ')} · {language}</span>
          )}
        </button>
        <button
          className={`run-panel-tab ${activeTab === 'stress' ? 'active' : ''}`}
          onClick={handleStressTab}
          disabled={collapsed}
        >
          <Zap size={13} />
          <span>{hasStressResults ? '* Stress Test' : 'Stress Test'}</span>
        </button>
        <button className="run-panel-tab" disabled title="Coming soon">
          <FlaskConical size={13} />
          <span>Test Cases</span>
        </button>

        <div className="run-panel-actions">
          <button className="rp-btn" onClick={onUndo} disabled={!canUndo || collapsed} title="Undo AI change">
            <History size={14} />Undo AI
          </button>
          <button className="rp-btn" onClick={onClear} disabled={collapsed} title="Clear output">
            <Eraser size={14} />Clear
          </button>
          <button className="rp-btn rp-btn-collapse" onClick={() => setCollapsed(c => !c)} title={collapsed ? 'Expand' : 'Collapse'}>
            {collapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="run-panel-body">
          {activeTab === 'run' && (
            <>
              <div className="run-grid">
                <label className="io-box">
                  <span>Input / Stdin</span>
                  <textarea value={stdin} onChange={(e) => setStdin(e.target.value)} placeholder="Paste stdin exactly like online judge input…" />
                </label>
                <label className="io-box">
                  <span>Output</span>
                  <pre>{isRunning ? `Running via ${String(runner).replace('_', ' ')}…` : output || '—'}</pre>
                </label>
                <label className="io-box">
                  <span>Errors</span>
                  <pre>{error || 'No errors'}</pre>
                </label>
              </div>

              <div className="complexity-strip">
                <div><Activity size={16} /><b>Time</b><span>{cx.time_complexity || 'Unknown'}</span></div>
                <div><Activity size={16} /><b>Space</b><span>{cx.space_complexity || 'Unknown'}</span></div>
                <p>{cx.complexity_reason || cx.reason || 'Run code to get dynamic Big-O analysis like O(n log n).'}</p>
              </div>

              {runNote?.status_text && (
                <div className="dynamic-run-note">
                  <Sparkles size={17} />
                  <span>{runNote.status_text}{runNote.next_step ? ` Next: ${runNote.next_step}` : ''}{runNote.risk ? ` Risk: ${runNote.risk}` : ''}</span>
                </div>
              )}

              {backgroundStatus && (
                <div className="background-ai-note">
                  <Sparkles size={16} />
                  <span>{backgroundStatus}</span>
                </div>
              )}

              {verdict === 'correct' && (
                <div className="verdict-correct">✅ Correct Answer — output matches expected</div>
              )}
              {verdict && verdict !== 'correct' && (
                <div className="verdict-wrong">
                  ❌ Wrong Answer — Expected: <code>{verdict.expected}</code>, Got: <code>{verdict.actual}</code>
                </div>
              )}
              {!verdict && success && <div className="success-bar"><ThumbsUp size={22} /> Code ran successfully</div>}
              {!success && error && <div className="error-bar">❌ Error found — repair gap opened near the issue.</div>}
            </>
          )}

          {activeTab === 'stress' && (
            <>
              {isStressRunning && (
                <div className="background-ai-note">
                  <Zap size={16} />
                  <span>Running stress tests...</span>
                </div>
              )}
              {hasStressResults ? (
                <div className="stress-list" style={{ marginTop: '4px' }}>
                  {stressResults.results.map((r, idx) => (
                    <div key={idx} className={`stress-row ${r.passed ? 'ok' : 'bad'}`}>
                      <b>{r.passed ? '✅' : '⚠'} {r.name}</b>
                      <span>stdin: {JSON.stringify(r.stdin || '')}</span>
                      {r.expected && <span>expected: {r.expected}</span>}
                      <span>output: {r.output || '—'}</span>
                      {r.error && <span>error: {r.error}</span>}
                    </div>
                  ))}
                </div>
              ) : !isStressRunning && (
                <div className="empty-state" style={{ margin: '12px' }}>
                  <b>No stress test results yet</b>
                  <span style={{ display: 'block', color: 'var(--muted)', fontSize: '13px', marginTop: '4px' }}>Click the Stress Test tab to run edge case testing.</span>
                </div>
              )}
            </>
          )}

          {activeTab === 'cases' && (
            <div className="empty-state" style={{ margin: '12px' }}>
              <b>Test Cases</b>
              <span style={{ display: 'block', color: 'var(--muted)', fontSize: '13px', marginTop: '4px' }}>Coming soon — define custom test cases here.</span>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
