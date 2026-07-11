import { FileText, Trash2 } from 'lucide-react'

export default function ContextPanel({ context, setContext }) {
  return (
    <div className="context-panel open">
      <div className="context-body context-body-full">
        <div className="context-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <FileText size={13} />
            <b style={{ fontSize: '12px' }}>Problem Context</b>
          </div>
          {context.trim() && (
            <button
              className="context-clear-btn"
              onClick={() => setContext('')}
              title="Clear context"
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
        <textarea
          className="context-textarea"
          value={context}
          onChange={e => setContext(e.target.value)}
          placeholder={"Paste the problem statement here...\n\nExample:\nGiven an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.\n\nConstraints:\n• 2 <= nums.length <= 10^4\n• -10^9 <= nums[i] <= 10^9"}
          spellCheck={false}
        />
        <div className="context-footer">
          <span>{context.length > 0 ? `${context.length} chars` : 'Empty'}</span>
        </div>
      </div>
    </div>
  )
}
