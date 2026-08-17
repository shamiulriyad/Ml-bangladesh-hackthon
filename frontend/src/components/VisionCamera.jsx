import { CAMERA_MESSAGES } from '../copy'

export default function VisionCamera({ videoRef, status, isActive, onRetry }) {
  const isReady = status === 'ready'

  return (
    <div className={`vision-frame ${isActive ? 'vision-frame-active' : ''}`}>
      <div className="vision-inner">
        <video ref={videoRef} muted playsInline autoPlay className="vision-video" />

        {isReady && (
          <>
            <span className="vision-corner vision-corner-tl" aria-hidden="true" />
            <span className="vision-corner vision-corner-tr" aria-hidden="true" />
            <span className="vision-corner vision-corner-bl" aria-hidden="true" />
            <span className="vision-corner vision-corner-br" aria-hidden="true" />
            {isActive && <span className="vision-scanline" aria-hidden="true" />}

            <div className={`vision-status ${isActive ? 'vision-status-active' : ''}`} role="status">
              <span className="vision-status-dot" aria-hidden="true" />
              {isActive ? 'চোখ দেখছে...' : 'AI Vision Ready'}
            </div>
          </>
        )}

        {!isReady && (
          <div className="vision-overlay">
            <p>{CAMERA_MESSAGES[status] ?? 'ক্যামেরা লোড হচ্ছে...'}</p>
            {(status === 'denied' || status === 'error') && (
              <button type="button" className="btn btn-ghost" onClick={onRetry}>
                আবার চেষ্টা করুন
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
