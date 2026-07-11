import { Check, Loader2, Sparkles, Zap } from 'lucide-react'

export default function SuggestionsPanel({
  suggestionResult = null,
  selected,
  onSelectSuggestion,
  applyGuide,
  isApplying = false,
}) {
  if (!suggestionResult) {
    return (
      <section className="suggestions-card glass-panel">
        <div className="suggestions-head">
          <div>
            <h2><Sparkles size={20} /> Suggestion</h2>
            <p>Click Suggestions after adding code. The LLM will find the single best improvement.</p>
          </div>
        </div>
        <div className="empty-state">
          <b>No suggestion yet.</b>
          <p>Add code and click the Suggestions button in the top bar.</p>
        </div>
      </section>
    )
  }

  const { already_optimized, suggestion, optimized_code } = suggestionResult

  return (
    <section className="suggestions-card glass-panel">
      <div className="suggestions-head">
        <div>
          <h2><Sparkles size={20} /> {already_optimized ? 'Already Optimized' : 'Best Suggestion'}</h2>
          <p>{already_optimized ? 'Your code is optimal. Here\'s the clean version.' : 'The LLM\'s single most impactful improvement.'}</p>
        </div>
      </div>

      {/* Main suggestion card — repair-gap style */}
      <div
        className={`single-suggestion-card repair-gap ${selected ? 'selected' : ''} ${already_optimized ? 'optimized-gap' : ''}`}
        onClick={() => !already_optimized && onSelectSuggestion && onSelectSuggestion(suggestion)}
        style={{ cursor: already_optimized ? 'default' : 'pointer' }}
      >
        <div className="repair-gap-head">
          <span>
            {already_optimized ? <Check size={16} /> : <Zap size={16} />}
            {' '}{suggestion?.title || 'Suggestion'}
          </span>
          {suggestion?.where && <small>{suggestion.where}</small>}
        </div>
        <div className="repair-row">{suggestion?.detail}</div>
        {suggestion?.apply && (
          <div className="repair-row"><b>How:</b> {suggestion.apply}</div>
        )}
        {suggestion?.apply_code && (
          <div className="suggestion-apply-code">
            <div className="suggestion-apply-label">Code changes</div>
            <pre className="suggestion-apply-pre">{suggestion.apply_code}</pre>
          </div>
        )}
        {!already_optimized && (
          <div className="repair-actions">
            <button className="accept-btn" onClick={(e) => { e.stopPropagation(); onSelectSuggestion && onSelectSuggestion(suggestion) }}>
              <Sparkles size={14} /> Generate Apply Guide
            </button>
          </div>
        )}
      </div>

      {/* Optimized code block */}
      {already_optimized && optimized_code && (
        <div className="optimized-code-block">
          <div className="repair-gap-head" style={{ marginBottom: 8 }}>
            <span><Check size={14} /> Optimized Code</span>
          </div>
          <pre className="optimized-pre">{optimized_code}</pre>
        </div>
      )}

      {/* Apply guide — repair-gap card when suggestion selected */}
      {selected && !already_optimized && (
        <div className="repair-gap" style={{ marginTop: 12 }}>
          <div className="repair-gap-head">
            <span><Sparkles size={16} /> Apply Guide</span>
            <small>{selected.where || ''}</small>
          </div>
          <div className="repair-row"><b>Selected:</b> {selected.title}</div>
          {isApplying ? (
            <div className="repair-row"><Loader2 size={15} className="spin" /> Generating exact guide...</div>
          ) : applyGuide ? (
            <>
              <div className="repair-row"><b>Problem:</b> {applyGuide.problem}</div>
              {applyGuide.fix && <div className="repair-row"><b>Apply:</b> <code>{applyGuide.fix}</code></div>}
              {applyGuide.why && <div className="repair-row"><b>Why:</b> {applyGuide.why}</div>}
            </>
          ) : (
            <div className="repair-row">Click Generate Apply Guide to get a precise patch.</div>
          )}
        </div>
      )}
    </section>
  )
}
