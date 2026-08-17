import { useCallback, useEffect, useRef, useState } from 'react'
import { useCamera } from './useCamera'
import { speak } from './speech'

const FALLBACK_MESSAGE = 'দুঃখিত, এই মুহূর্তে বুঝতে পারছি না। আবার চেষ্টা করুন।'
const REQUEST_TIMEOUT_MS = 8000

const MODES = {
  scene: { label: 'দৃশ্য বর্ণনা', full: 'দৃশ্য বর্ণনা করুন' },
  text: { label: 'লেখা পড়ুন', full: 'লেখা পড়ুন' }
}

const CAMERA_MESSAGES = {
  requesting: 'ক্যামেরা চালু হচ্ছে...',
  denied: 'ক্যামেরার অনুমতি দেওয়া হয়নি। অনুমতি দিয়ে আবার চেষ্টা করুন।',
  unsupported: 'এই ব্রাউজারে ক্যামেরা সমর্থিত নয়।',
  error: 'ক্যামেরা চালু করা যায়নি। আবার চেষ্টা করুন।',
  off: 'ক্যামেরা বন্ধ আছে।'
}

async function describeImage(imageBase64, mode) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch('/api/describe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64, mode }),
      signal: controller.signal
    })
    if (!res.ok) throw new Error(`request-failed-${res.status}`)
    const data = await res.json()
    return data.text
  } finally {
    clearTimeout(timeoutId)
  }
}

export default function App() {
  const { videoRef, status: cameraStatus, capture, retry: retryCamera, turnOff: turnOffCamera, turnOn: turnOnCamera } = useCamera()
  const [mode, setMode] = useState('scene')
  const [analysisStatus, setAnalysisStatus] = useState('idle') // idle | loading | result | error
  const [resultText, setResultText] = useState('')
  const lastImageRef = useRef(null)

  useEffect(() => {
    if (cameraStatus in CAMERA_MESSAGES) {
      speak(CAMERA_MESSAGES[cameraStatus])
    }
  }, [cameraStatus])

  const runAnalysis = useCallback(async (imageBase64, selectedMode) => {
    setAnalysisStatus('loading')
    setResultText('')
    try {
      const text = await describeImage(imageBase64, selectedMode)
      // The backend itself falls back to FALLBACK_MESSAGE (still HTTP 200) when Gemini
      // fails server-side, so match on content too, not just network-level failures.
      setResultText(text)
      setAnalysisStatus(text === FALLBACK_MESSAGE ? 'error' : 'result')
      speak(text)
    } catch (err) {
      setResultText(FALLBACK_MESSAGE)
      setAnalysisStatus('error')
      speak(FALLBACK_MESSAGE)
    }
  }, [])

  const handleCapture = useCallback(() => {
    if (analysisStatus === 'loading' || cameraStatus !== 'ready') return
    const imageBase64 = capture()
    if (!imageBase64) return
    lastImageRef.current = imageBase64
    runAnalysis(imageBase64, mode)
  }, [analysisStatus, cameraStatus, capture, mode, runAnalysis])

  const handleRetry = useCallback(() => {
    if (lastImageRef.current && analysisStatus !== 'loading') {
      runAnalysis(lastImageRef.current, mode)
    }
  }, [analysisStatus, mode, runAnalysis])

  const isCameraReady = cameraStatus === 'ready'
  const isLoading = analysisStatus === 'loading'

  return (
    <div className="app">
      <header className="app-header">
        <h1>Chokh</h1>
      </header>

      <main className="app-main">
        <div className="mode-switch" role="tablist" aria-label="মোড নির্বাচন">
          {Object.entries(MODES).map(([key, { label }]) => (
            <button
              key={key}
              type="button"
              role="tab"
              className={`mode-tab ${mode === key ? 'mode-tab-active' : ''}`}
              aria-selected={mode === key}
              onClick={() => setMode(key)}
              disabled={isLoading}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="camera-preview">
          <video ref={videoRef} muted playsInline autoPlay className="camera-video" />

          {isCameraReady && (
            <button
              type="button"
              className="camera-power-button"
              onClick={turnOffCamera}
              aria-label="ক্যামেরা বন্ধ করুন"
            >
              ⏻ বন্ধ করুন
            </button>
          )}

          {!isCameraReady && (
            <div className="camera-overlay">
              <p>{CAMERA_MESSAGES[cameraStatus] ?? 'ক্যামেরা লোড হচ্ছে...'}</p>
              {cameraStatus === 'off' && (
                <button type="button" className="retry-button" onClick={turnOnCamera}>
                  ক্যামেরা চালু করুন
                </button>
              )}
              {(cameraStatus === 'denied' || cameraStatus === 'error') && (
                <button type="button" className="retry-button" onClick={retryCamera}>
                  আবার চেষ্টা করুন
                </button>
              )}
            </div>
          )}
        </div>

        <button
          type="button"
          className="capture-button"
          onClick={handleCapture}
          disabled={!isCameraReady || isLoading}
          aria-label={`ছবি তুলুন - ${MODES[mode].full}`}
        >
          {isLoading ? (
            <span className="spinner" role="status" aria-live="polite" />
          ) : (
            <span className="capture-icon" aria-hidden="true">📷</span>
          )}
        </button>

        <p className="hint">
          {isLoading ? 'বোঝার চেষ্টা হচ্ছে...' : 'ছবি তুলতে বোতাম চাপুন'}
        </p>

        {resultText && (
          <div
            className={`result-box ${analysisStatus === 'error' ? 'result-error' : ''}`}
            role="status"
            aria-live="assertive"
          >
            <p>{resultText}</p>
            <div className="result-actions">
              <button type="button" className="speak-button" onClick={() => speak(resultText)}>
                🔊 আবার শুনুন
              </button>
              {analysisStatus === 'error' && (
                <button type="button" className="retry-button" onClick={handleRetry}>
                  🔁 আবার চেষ্টা করুন
                </button>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
