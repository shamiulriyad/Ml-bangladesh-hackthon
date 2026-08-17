import { useCallback, useEffect, useRef, useState } from 'react'
import { useCamera } from './useCamera'
import { speak, stopSpeaking, isSpeechSupported } from './speech'
import { CAMERA_MESSAGES, UI_ERROR_MESSAGE, BACKEND_FALLBACK_TEXT, TEXT_DETECTED_MARKER, isHazardText } from './copy'
import Hero from './components/Hero'
import VisionCamera from './components/VisionCamera'
import VisionToggleButton from './components/VisionToggleButton'
import NarrationCard from './components/NarrationCard'

const REQUEST_TIMEOUT_MS = 8000
// Not real-time video analysis (that needs a streaming API) — instead, a fresh frame is
// captured and analyzed on this cadence for as long as the loop is active, so the
// experience still reads as "continuous" without a capture button.
const LOOP_PAUSE_MS = 2500
const LOOP_ERROR_PAUSE_MS = 4000
const CAMERA_NOT_READY_POLL_MS = 1000

// Set at build time. When the frontend and backend are ONE deployed service (same origin),
// leave this unset and the relative /api/describe path below just works. When they're two
// separate services (e.g. two Render web services), set VITE_API_URL to the backend's full
// origin, e.g. https://chokh-backend.onrender.com — Vite only exposes env vars prefixed
// with VITE_ to the client bundle.
const API_BASE_URL = import.meta.env.VITE_API_URL?.replace(/\/$/, '') ?? ''

async function describeImage(imageBase64) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(`${API_BASE_URL}/api/describe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64 }),
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
  const {
    videoRef,
    status: cameraStatus,
    capture,
    retry: retryCamera,
    turnOff: turnOffCamera,
    turnOn: turnOnCamera
  } = useCamera()

  const [isActive, setIsActive] = useState(false)
  const [narration, setNarration] = useState(null) // { text, variant, textDetected }
  const [voiceState, setVoiceState] = useState('idle') // idle | playing
  const [voiceUnsupported] = useState(() => !isSpeechSupported())

  const isActiveRef = useRef(false)
  const cameraStatusRef = useRef(cameraStatus)
  const lastTextRef = useRef(null)
  const loopTimeoutRef = useRef(null)

  useEffect(() => {
    cameraStatusRef.current = cameraStatus
  }, [cameraStatus])

  useEffect(() => {
    if (cameraStatus in CAMERA_MESSAGES) {
      speak(CAMERA_MESSAGES[cameraStatus])
    }
  }, [cameraStatus])

  useEffect(
    () => () => {
      isActiveRef.current = false
      clearTimeout(loopTimeoutRef.current)
    },
    []
  )

  const speakResult = useCallback((text) => {
    speak(text, {
      onStart: () => setVoiceState('playing'),
      onEnd: () => setVoiceState('idle'),
      onError: () => setVoiceState('idle')
    })
  }, [])

  const applyNarration = useCallback(
    (text, variant) => {
      if (text === lastTextRef.current) return
      lastTextRef.current = text
      setNarration({
        text,
        variant,
        textDetected: variant !== 'error' && text.includes(TEXT_DETECTED_MARKER)
      })
      speakResult(text)
    },
    [speakResult]
  )

  const loopTick = useCallback(async () => {
    if (!isActiveRef.current) return

    if (cameraStatusRef.current !== 'ready') {
      loopTimeoutRef.current = setTimeout(loopTick, CAMERA_NOT_READY_POLL_MS)
      return
    }

    const imageBase64 = capture()
    if (!imageBase64) {
      loopTimeoutRef.current = setTimeout(loopTick, CAMERA_NOT_READY_POLL_MS)
      return
    }

    try {
      const text = await describeImage(imageBase64)
      if (!isActiveRef.current) return

      const isFailure = text === BACKEND_FALLBACK_TEXT
      applyNarration(isFailure ? UI_ERROR_MESSAGE : text, isFailure ? 'error' : isHazardText(text) ? 'hazard' : 'normal')

      loopTimeoutRef.current = setTimeout(loopTick, isFailure ? LOOP_ERROR_PAUSE_MS : LOOP_PAUSE_MS)
    } catch (err) {
      if (!isActiveRef.current) return
      applyNarration(UI_ERROR_MESSAGE, 'error')
      loopTimeoutRef.current = setTimeout(loopTick, LOOP_ERROR_PAUSE_MS)
    }
  }, [capture, applyNarration])

  const stopLoop = useCallback(() => {
    isActiveRef.current = false
    setIsActive(false)
    clearTimeout(loopTimeoutRef.current)
    stopSpeaking()
    setVoiceState('idle')
  }, [])

  const handleToggle = useCallback(() => {
    if (isActive) {
      stopLoop()
      return
    }

    isActiveRef.current = true
    setIsActive(true)
    lastTextRef.current = null
    loopTick()
  }, [isActive, loopTick, stopLoop])

  const handleTurnOffCamera = useCallback(() => {
    stopLoop()
    turnOffCamera()
  }, [stopLoop, turnOffCamera])

  const isCameraReady = cameraStatus === 'ready'

  return (
    <div className="app-bg">
      <div className="app-shell">
        <Hero />

        <VisionCamera
          videoRef={videoRef}
          status={cameraStatus}
          isActive={isActive}
          onRetry={retryCamera}
          onTurnOff={handleTurnOffCamera}
          onTurnOn={turnOnCamera}
        />

        <VisionToggleButton isActive={isActive} onClick={handleToggle} disabled={!isCameraReady} />

        {narration && (
          <NarrationCard
            text={narration.text}
            variant={narration.variant}
            textDetected={narration.textDetected}
            isSpeaking={voiceState === 'playing'}
          />
        )}

        {voiceUnsupported && (
          <p className="voice-error" role="status">
            ভয়েস চালু করা যাচ্ছে না। লেখা দেখে চেষ্টা করুন।
          </p>
        )}
      </div>
    </div>
  )
}
