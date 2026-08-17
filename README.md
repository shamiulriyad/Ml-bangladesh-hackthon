# Chokh (চোখ) — AI Eyes for the Visually Impaired

An accessibility web app that helps visually impaired users in Bangladesh understand their
surroundings and read printed text out loud, in Bengali. Point the camera, tap one large
button, and hear a short, hazard-first spoken description within seconds.

- **Frontend:** React + Vite (mobile-first, live camera preview, one large high-contrast
  capture button)
- **Backend:** ASP.NET Core minimal API (also serves the built frontend as static files) —
  the only reason a backend exists at all is to keep `GEMINI_API_KEY` off the client
- **AI:** Google Gemini (`gemini-2.0-flash`) for image understanding
- **Voice:** Browser `speechSynthesis` — no external TTS service, no API key needed for voice

No database, no auth, no user accounts — none of it is needed for the core
camera → Gemini → Bengali text → voice loop.

## How it works

1. On load, the app requests camera access and shows a **live preview** (`getUserMedia`) so
   the user (or a sighted helper) can aim the phone before capturing.
2. A **Scene Mode / Read Text** segmented toggle picks which hardcoded Bengali prompt gets
   sent with the next capture.
3. Tapping the capture button grabs the current video frame via `<canvas>`, downscales it,
   and re-encodes it as a base64 JPEG — no photo ever leaves the browser as a file, no native
   camera app hand-off.
4. The frontend `POST`s `{ imageBase64, mode }` to `/api/describe`.
5. The backend sends the image to Gemini with the matching Bengali system prompt (hazard
   first, then spatial position, then brief context — see [Prompts](#prompts) below;
   temperature `0.3`, `maxOutputTokens: 150`) and returns `{ text }`.
6. The frontend displays the text and immediately speaks it with `window.speechSynthesis`,
   preferring a `bn-BD` voice, falling back to `bn-IN`, then `en-US`, depending on what the
   device actually has installed. A **🔊 আবার শুনুন** button lets the user replay it on
   demand.
7. If Gemini fails, errors, or takes longer than 8 seconds, the app shows and speaks a fixed
   Bengali fallback message alongside a **🔁 আবার চেষ্টা করুন** retry button that re-sends the
   same captured frame without needing a fresh photo.
8. Camera permission problems (denied / unsupported / device error) are shown as an overlay
   on the preview, spoken once, with their own retry action.

## Prompts

The exact system prompts live in `backend/Chokh.Api/Program.cs` (`ScenePrompt` /
`TextPrompt`). Both are written to make Gemini:

- Answer only in Bengali, in 2–4 short sentences.
- **Scene Mode:** hazards first (vehicles, rickshaws, stairs, holes, obstacles) → spatial
  position using সামনে/পেছনে/বাম পাশে/ডান পাশে/কাছাকাছি/দূরে → brief extra context.
- **Read Text Mode:** prioritize accurate transcription of visible Bangla/English text
  (signboards, medicine packaging, labels, menus, documents) over interpretation.
- Never invent objects or text that isn't visible — say "নিশ্চিতভাবে বোঝা যাচ্ছে না" instead.
- Never give medical diagnosis or dosing instructions, even when reading medicine labels.

## Project structure

```
.
├── frontend/            React (Vite) single-page app
├── backend/Chokh.Api/   ASP.NET Core minimal API
├── Dockerfile           Multi-stage build: frontend build -> backend publish -> runtime
└── README.md
```

## Prerequisites

- Node.js 20+
- .NET SDK 10.0+
- A Google Gemini API key ([Google AI Studio](https://aistudio.google.com/apikey))

## Running locally

### 1. Backend

```bash
cd backend/Chokh.Api
# Set your Gemini key for this shell session
export GEMINI_API_KEY=your_key_here      # PowerShell: $env:GEMINI_API_KEY="your_key_here"
dotnet run
```

By default the backend listens on `http://localhost:8080` (it reads the `PORT` env var,
defaulting to `8080` — see [Environment variables](#environment-variables)).

Swagger UI is available at `http://localhost:8080/swagger` (raw OpenAPI document at
`/swagger/v1/swagger.json`) for exploring and testing `/api/describe` directly.

### 2. Frontend

In a separate terminal:

```bash
cd frontend
npm install
npm run dev
```

Vite serves the app on `http://localhost:5173` and proxies `/api/*` requests to
`http://localhost:8080` (see `frontend/vite.config.js`), so the backend must be running
first.

Open `http://localhost:5173` on a phone (or a desktop browser with a webcam) to try it.
`getUserMedia` requires HTTPS or `localhost` — that's satisfied automatically in dev and by
Render in production. On a phone, prefer the rear (environment-facing) camera; the app
requests it via `facingMode: "environment"` but falls back to whatever camera is available.

### 3. Running the combined production build locally (optional)

```bash
cd frontend && npm run build && cd ..
mkdir -p backend/Chokh.Api/wwwroot
cp -r frontend/dist/* backend/Chokh.Api/wwwroot/
cd backend/Chokh.Api
GEMINI_API_KEY=your_key_here dotnet run
```

Now `http://localhost:8080` serves the built frontend directly from the backend, exactly
like production.

## Environment variables

| Variable         | Required | Default | Notes                                                        |
|------------------|----------|---------|----------------------------------------------------------------|
| `GEMINI_API_KEY` | Yes      | —       | Never sent to the frontend; read only on the backend.         |
| `PORT`           | No       | `8080`  | Port the backend (and Render) listens on.                     |

## Deploying to Render

The included `Dockerfile` builds the React frontend, publishes the .NET backend, copies the
frontend build into the backend's `wwwroot`, and runs everything as a single container — one
Render web service, no separate static site needed.

1. Push this repository to GitHub (or GitLab/Bitbucket).
2. In the Render dashboard: **New → Web Service**.
3. Connect your repository.
4. Set **Runtime** to **Docker** (Render will detect the root `Dockerfile` automatically).
5. Under **Environment**, add an environment variable:
   - `GEMINI_API_KEY` = your Gemini API key
6. Leave **Port** on Render's default — the container reads the `PORT` env var Render
   injects automatically (falls back to `8080` if unset, which is what Render expects
   locally too).
7. Click **Create Web Service** / **Deploy**.

Render will build the Docker image (frontend build → backend publish → runtime) and deploy
it. Once live, the same URL serves both the app and the `/api/describe` endpoint — no CORS
configuration is needed because everything is same-origin.

## Notes and design choices

- Captured frames are downscaled (max 1024px on the longest side) and compressed to JPEG
  quality 0.7 client-side before upload, to keep requests fast on slower mobile connections.
- If `mode` is anything other than `"text"`, the backend treats it as `"scene"`.
- If `GEMINI_API_KEY` is missing, or the Gemini call fails, errors, or exceeds 8 seconds, the
  backend itself returns the Bengali fallback message in `{ text }`; the frontend still marks
  this an error state (so the retry button appears) but doesn't need to parse the message.
- **TTS is intentionally provider-agnostic**: `frontend/src/speech.js` exposes a single
  `speak(text)` function that every caller uses. Today it's browser `SpeechSynthesis`; if a
  target device has no Bengali voice installed at all, swapping in a cloud TTS API later only
  means changing the inside of that one function.
- Out of scope for this MVP, deliberately: user accounts, a database, a dashboard, payments,
  fine-tuning, and any backend logic beyond proxying a single Gemini call. The backend exists
  solely so `GEMINI_API_KEY` never reaches the browser.
