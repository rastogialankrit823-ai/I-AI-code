import { BookOpen, X } from 'lucide-react'

export default function ExplanationCard({ data, onDismiss }) {
  if (!data) return null
  return (
    <div className="explanation-card">
      <div className="repair-gap-head">
        <span><BookOpen size={16} /> {data.title || 'Code Explanation'}</span>
        {data.code_hint && <small className="explain-hint">{data.code_hint}</small>}
      </div>
      <div className="repair-row">{data.explanation}</div>
      {data.steps?.length > 0 && (
        <div className="explain-steps">
          {data.steps.map((step, i) => (
            <div key={i} className="explain-step"><span className="step-num">{i + 1}</span>{step}</div>
          ))}
        </div>
      )}
      <div className="repair-actions">
        <button className="ignore-btn" onClick={onDismiss}><X size={15} /> Got it</button>
      </div>
    </div>
  )
}
