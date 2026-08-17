import { useCallback, useEffect, useRef, useState } from 'react'

// status: 'requesting' | 'ready' | 'denied' | 'unsupported' | 'error' | 'off'
export function useCamera() {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const [status, setStatus] = useState('requesting')

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }, [])

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('unsupported')
      return
    }

    setStatus('requesting')
    stop()

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => {})
      }
      setStatus('ready')
    } catch (err) {
      setStatus(err?.name === 'NotAllowedError' ? 'denied' : 'error')
    }
  }, [stop])

  useEffect(() => {
    start()
    return () => stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const turnOff = useCallback(() => {
    stop()
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setStatus('off')
  }, [stop])

  // Downscales and JPEG-encodes the current video frame; returns raw base64 (no data-URL prefix).
  const capture = useCallback((maxDim = 1024, quality = 0.7) => {
    const video = videoRef.current
    if (!video || video.videoWidth === 0) return null

    let width = video.videoWidth
    let height = video.videoHeight
    if (width > maxDim || height > maxDim) {
      if (width > height) {
        height = Math.round((height * maxDim) / width)
        width = maxDim
      } else {
        width = Math.round((width * maxDim) / height)
        height = maxDim
      }
    }

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    canvas.getContext('2d').drawImage(video, 0, 0, width, height)
    return canvas.toDataURL('image/jpeg', quality).split(',')[1]
  }, [])

  return { videoRef, status, capture, retry: start, turnOff, turnOn: start }
}
