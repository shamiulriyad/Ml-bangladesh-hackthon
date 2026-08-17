// Single entry point for text-to-speech (browser SpeechSynthesis today). Swap the body of
// speak() for a cloud TTS call later without touching any caller — App.jsx only ever imports
// these functions.
const PREFERRED_LANGS = ['bn-BD', 'bn-IN', 'en-US']

function pickVoice(voices) {
  for (const lang of PREFERRED_LANGS) {
    const exact = voices.find((v) => v.lang === lang)
    if (exact) return exact
  }
  const anyBengali = voices.find((v) => v.lang && v.lang.toLowerCase().startsWith('bn'))
  if (anyBengali) return anyBengali
  const anyEnglish = voices.find((v) => v.lang && v.lang.toLowerCase().startsWith('en'))
  if (anyEnglish) return anyEnglish
  return voices[0] || null
}

export function isSpeechSupported() {
  return 'speechSynthesis' in window
}

export function speak(text, { onStart, onEnd, onError } = {}) {
  if (!isSpeechSupported()) {
    onError?.()
    return
  }

  const synth = window.speechSynthesis
  synth.cancel()

  const utter = new SpeechSynthesisUtterance(text)
  utter.onstart = () => onStart?.()
  utter.onend = () => onEnd?.()
  utter.onerror = () => onError?.()

  const applyVoiceAndSpeak = () => {
    const voices = synth.getVoices()
    const voice = pickVoice(voices)
    if (voice) {
      utter.voice = voice
      utter.lang = voice.lang
    } else {
      utter.lang = 'bn-BD'
    }
    synth.speak(utter)
  }

  const existingVoices = synth.getVoices()
  if (existingVoices.length > 0) {
    applyVoiceAndSpeak()
    return
  }

  let spoken = false
  const onVoicesChanged = () => {
    if (spoken) return
    spoken = true
    synth.onvoiceschanged = null
    applyVoiceAndSpeak()
  }
  synth.onvoiceschanged = onVoicesChanged

  // Some browsers never fire onvoiceschanged; fall back after a short wait.
  setTimeout(() => {
    if (spoken) return
    spoken = true
    synth.onvoiceschanged = null
    applyVoiceAndSpeak()
  }, 500)
}

export function stopSpeaking() {
  if (isSpeechSupported()) {
    window.speechSynthesis.cancel()
  }
}
