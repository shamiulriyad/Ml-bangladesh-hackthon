// Shared Bangla copy used by both App.jsx (for speech) and components (for display), so the
// two never drift out of sync.
export const CAMERA_MESSAGES = {
  requesting: 'ক্যামেরা চালু হচ্ছে...',
  denied: 'ক্যামেরা ব্যবহার করার অনুমতি দিন।',
  unsupported: 'এই ব্রাউজারে ক্যামেরা সমর্থিত নয়।',
  error: 'ক্যামেরা চালু করা যায়নি। আবার চেষ্টা করুন।',
  off: 'ক্যামেরা বন্ধ আছে।'
}

// Shown/spoken for any analysis failure, regardless of cause.
export const UI_ERROR_MESSAGE = 'ছবিটি বিশ্লেষণ করা যায়নি। আবার চেষ্টা করুন।'

// The backend's own hardcoded fallback text (returned as a normal 200 response when Gemini
// fails server-side or GEMINI_API_KEY is missing) — matched against to flip the narration
// into the error state instead of speaking it as a successful result.
export const BACKEND_FALLBACK_TEXT = 'দুঃখিত, এই মুহূর্তে বুঝতে পারছি না। আবার চেষ্টা করুন।'

// A response is treated as "text detected" (shows the 📖 badge) when it contains this
// phrase — matches the exact wording the backend prompt instructs Gemini to use.
export const TEXT_DETECTED_MARKER = 'লেখা আছে'

// Best-effort client-side heuristic: the backend returns one flowing Bangla sentence, not
// structured fields, so hazard emphasis is decided by keyword match rather than a guarantee.
const HAZARD_KEYWORDS = [
  'সতর্কতা', 'সাবধান', 'বিপদ', 'ঝুঁকি', 'দুর্ঘটনা',
  'গর্ত', 'সিঁড়ি', 'বাধা', 'গাড়ি', 'রিকশা'
]

export function isHazardText(text) {
  return HAZARD_KEYWORDS.some((keyword) => text.includes(keyword))
}
