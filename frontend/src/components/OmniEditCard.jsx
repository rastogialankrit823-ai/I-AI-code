import { AlertTriangle, ChevronDown, ChevronRight, Clock, HelpCircle, Loader2, Zap } from 'lucide-react'
import { useState } from 'react'

const ISSUE_META = {
  ERROR:       { icon: AlertTriangle, color: '#ff5555', label: 'Runtime Error' },
  TLE:         { icon: Clock,         color: '#ffb86c', label: 'Time Limit Exceeded' },
  OPTIMIZATION:{ icon: Zap,           color: '#50fa7b', label: 'Optimization' },
  QUESTION:    { icon: HelpCircle,    color: '#8be9fd', label: 'Explanation' },
}

// A valid patch must have code_snippet with at least one non-comment, non-empty line
function isPatchValid(patchData) {
  if (!patchData) return false
  const lines = String(patchData.code_snippet || '').split('\n')
  const realLines = lines.filter(l => l.trim() && !l.trim().startsWith('# Patch accepted:'))
  return realLines.length > 0
}

export default function OmniEditCard({ data, patchData, isGeneratingPatch, onGenerateFix, onApply, onDismiss }) {
  const [traceOpen, setTraceOpen] = useState(false)
  const meta = ISSUE_META[data?.issue_type] || ISSUE_META.ERROR
  const Icon = meta.icon
  const patchValid = isPatchValid(patchData)
  const isExplain = data?.issue_type === 'QUESTION'

  return (
    <div className="omni-edit-card" style={{ '--omni-accent': meta.color }}>
      {/* Header */}
      <div className="omni-card-head">
        <span className="omni-issue-badge">
          <Icon size={14} />
          {meta.label}
        </span>
        <button className="omni-dismiss" onClick={onDismiss}>✕</button>
      </div>

      {/* Actions first */}
      <div className="omni-card-actions">
        {!isExplain && (
          patchData ? (
            <>
              <button
                className="accept-btn"
                onClick={() => onApply(patchData)}
                disabled={!patchValid}
                title={!patchValid ? 'Patch has no code — regenerate' : ''}
                style={!patchValid ? { opacity: 0.4, cursor: 'not-allowed' } : {}}
              >
                Apply Patch
              </button>
              <button className="rp-btn" onClick={onGenerateFix} disabled={isGeneratingPatch}>
                {isGeneratingPatch ? <><Loader2 size={13} className="spin" /> Regenerating…</> : 'Regenerate Fix'}
              </button>
            </>
          ) : (
            <button className="accept-btn" onClick={onGenerateFix} disabled={isGeneratingPatch}>
              {isGeneratingPatch
                ? <><Loader2 size={13} className="spin" /> Generating fix…</>
                : 'Generate Fix'}
            </button>
          )
        )}
        <button className="ignore-btn" onClick={onDismiss}>Dismiss</button>
      </div>

      {/* Patch preview — shown after fix is generated */}
      {patchData && patchData.code_snippet && (
        <div className="omni-patch-preview" style={!patchValid ? { borderColor: 'rgba(255,85,85,.3)' } : {}}>
          <div className="omni-patch-meta" style={!patchValid ? { color: '#ff5555' } : {}}>
            {patchValid
              ? `Lines ${patchData.start_line}–${patchData.end_line} · ${patchData.action}`
              : '⚠ Incomplete patch — model only returned the comment, no code'}
          </div>
          <pre className="omni-patch-pre">{patchData.code_snippet}</pre>
        </div>
      )}

      {/* Explanation — shown after fix (or always for QUESTION type) */}
      {(patchData || isExplain) && (
        <>
          {data?.title && isExplain && (
            <p className="omni-explanation" style={{ fontWeight: 600, marginBottom: 4 }}>{data.title}</p>
          )}
          {data?.explanation && (
            <p className="omni-explanation">{data.explanation}</p>
          )}
          {isExplain && Array.isArray(data?.steps) && data.steps.length > 0 && (
            <ul className="omni-explanation" style={{ paddingLeft: 18, margin: '4px 0' }}>
              {data.steps.map((s, i) => <li key={i} style={{ marginBottom: 2 }}>{s}</li>)}
            </ul>
          )}
          {isExplain && data?.code_hint && (
            <pre className="omni-patch-pre" style={{ marginTop: 6 }}>{data.code_hint}</pre>
          )}
        </>
      )}

      {/* Collapsible analysis trace */}
      {data?.thought_process && (
        <div className="omni-trace-toggle" onClick={() => setTraceOpen(o => !o)}>
          {traceOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          Analysis trace
        </div>
      )}
      {traceOpen && data?.thought_process && (
        <pre className="omni-trace-pre">{data.thought_process}</pre>
      )}
    </div>
  )
}
