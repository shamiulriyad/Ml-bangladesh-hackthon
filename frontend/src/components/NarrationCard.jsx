const VARIANT_HEADER = {
  normal: '✨ Chokh AI',
  hazard: '⚠ সতর্কতা',
  error: '⚠ সতর্কতা'
}

export default function NarrationCard({ text, variant, textDetected, isSpeaking }) {
  return (
    <div className={`narration-card narration-card-${variant}`} role="status" aria-live="assertive">
      <div className="narration-header">
        <span className="narration-eyebrow">{VARIANT_HEADER[variant]}</span>
        {textDetected && <span className="narration-badge">📖 লেখা শনাক্ত হয়েছে</span>}
      </div>

      <p className="narration-text">{text}</p>

      {isSpeaking && (
        <div className="narration-voice" aria-hidden="true">
          <span className="narration-voice-label">🔊 বলছে...</span>
          <span className="soundwave">
            <span />
            <span />
            <span />
            <span />
            <span />
          </span>
        </div>
      )}
    </div>
  )
}
