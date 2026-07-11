import { Check, Edit3, Sparkles, X } from 'lucide-react'

export default function RepairGap({ data, code = '', variant = 'code', onAccept, onIgnore }) {
  if (!data) return null

  const label = variant === 'design' ? 'AI Design Repair Gap' : 'AI Repair Gap'

  // Compute diff lines
  const startLine = Math.max(1, Number(data.patch?.start_line || data.line || 1))
  const endLine   = Math.max(startLine, Number(data.patch?.end_line || data.patch?.start_line || data.line || startLine))
  const codeLines = code ? code.split('\n') : []
  const beforeLines = codeLines.slice(startLine - 1, endLine)
  const replacement = data.patch?.replacement ?? data.fix ?? ''
  const afterLines  = String(replacement).split('\n')

  const hasDiff = beforeLines.length > 0 && replacement

  return (
    <div className={`repair-gap ${variant === 'design' ? 'design-gap' : ''}`}>
      <div className="repair-gap-head">
        <span><Sparkles size={16} /> {label}</span>
        <small>{data.type || data.tag || 'Issue'} · line {startLine}</small>
      </div>

      <div className="repair-row"><b>Problem:</b> {data.problem}</div>
      {data.why && <div className="repair-row repair-why"><b>Why:</b> {data.why}</div>}

      {hasDiff && (
        <div className="repair-diff">
          <div className="repair-diff-label">Changes to apply</div>
          {beforeLines.map((line, i) => (
            <div key={`b-${i}`} className="diff-line diff-before">
              <span className="diff-sign">−</span>
              <code>{line || ' '}</code>
            </div>
          ))}
          {afterLines.map((line, i) => (
            <div key={`a-${i}`} className="diff-line diff-after">
              <span className="diff-sign">+</span>
              <code>{line || ' '}</code>
            </div>
          ))}
        </div>
      )}

      <div className="repair-actions">
        <button className="accept-btn" onClick={onAccept}><Check size={15} /> Apply Fix</button>
        <button className="edit-btn"><Edit3 size={15} /> Edit Manually</button>
        <button className="ignore-btn" onClick={onIgnore}><X size={15} /> Ignore</button>
      </div>
    </div>
  )
}
