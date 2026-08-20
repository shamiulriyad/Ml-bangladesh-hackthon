# Chokh (চোখ) — AI Eyes for the Visually Impaired

An accessibility web app that helps visually impaired users in Bangladesh understand their
surroundings and read printed text out loud, in Bengali. Turn on Chokh, point the phone
anywhere, and it continuously narrates what's in front of it — hazards first — with no
capture button to press.

- **Frontend:** React + Vite (mobile-first, live camera preview, one large "চোখ চালু করুন"
  toggle — no capture button, no mode selector)
- **Backend:** ASP.NET Core minimal API (also serves the built frontend as static files) —
  the only reason a backend exists at all is to keep `GEMINI_API_KEY` off the client
- **AI:** Google Gemini (`gemini-3.5-flash`) for image understanding — overridable via the
  `GEMINI_MODEL` environment variable
- **Voice:** Browser `speechSynthesis` — no external TTS service, no API key needed for voice

No database, no auth, no user accounts — none of it is needed for the core
camera → Gemini → Bengali text → voice loop.

## How it works

1. On load, the app requests camera access and shows a **live preview** (`getUserMedia`) so
   the user (or a sighted helper) can aim the phone.
2. Tapping **👁 চোখ চালু করুন** starts a continuous loop: capture the current video frame via
   `<canvas>`, downscale it, re-encode it as a base64 JPEG, `POST { imageBase64 }` to
   `/api/describe`, display + speak the result, wait ~2.5s (longer after an error), repeat —
   for as long as the toggle stays on (now showing **● চোখ চলছে**). No photo ever leaves the
   browser as a file, and there's no separate capture step for the user to trigger.
   - This is frame-sampling, not true real-time video understanding — a genuinely continuous
     stream would need a streaming API (e.g. Gemini Live over WebSocket), which was out of
     scope for this MVP. The ~2.5s cadence is a deliberate stand-in that still reads as
     "always watching" without that complexity.
3. The backend sends each frame to Gemini with one unified Bengali system prompt (hazard
   first, then spatial position, then any readable text — see [Prompts](#prompts) below;
   temperature `0.3`, `maxOutputTokens: 100`) and returns `{ text }`. There's no Scene/Read
   Text mode toggle anymore — the same prompt handles both, and the frontend just reacts to
   whatever comes back.
4. The frontend speaks each new result immediately with `window.speechSynthesis`, preferring
   a `bn-BD` voice, falling back to `bn-IN`, then `en-US`. If a result is identical to the
   previous one (nothing changed in view), it's shown but **not** re-spoken, to avoid
   repeating the same sentence every cycle.
5. If a result contains hazard-related keywords, the narration card switches to a red
   "⚠ সতর্কতা" treatment. If it contains the phrase "লেখা আছে" (the exact phrase the prompt
   tells Gemini to use when reading text), a "📖 লেখা শনাক্ত হয়েছে" badge appears.
6. If Gemini fails, errors, or takes longer than 8 seconds, the app shows and speaks a fixed
   Bengali fallback message and keeps looping (with a longer pause) — the loop itself is the
   retry, so there's no separate retry button.
7. Camera permission problems (denied / unsupported / device error) are shown as an overlay
   on the preview, spoken once, with their own retry action; the toggle button stays disabled
   until the camera is ready.

## Prompts

The single system prompt lives in `backend/Chokh.Api/Program.cs` (`VisionPrompt`). It's
written to make Gemini:

- Answer only in Bengali, in 1–2 short sentences (kept tight since it's called every ~2.5s).
- Hazards first (vehicles, rickshaws, stairs, holes, obstacles) → spatial position using
  সামনে/পেছনে/বাম পাশে/ডান পাশে/কাছাকাছি/দূরে → any clearly readable text, read back as
  "এখানে লেখা আছে: ...".
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

<img width="474" height="411" alt="image" src="https://github.com/user-attachments/assets/95dfc2e9-9328-45f0-86ba-dc131bb2fdb5" />

## Prerequisites

- Node.js 20+
- .NET SDK 10.0+
- A Google Gemini API key ([Google AI Studio](https://aistudio.google.com/apikey))

## Running locally

### 1. Backend

Provide `GEMINI_API_KEY` first, using whichever of these is most convenient — the backend
checks all three, in this order:

**Option A — `.env` file (easiest for local dev).** Create a file named `.env` at the
**repo root** (same level as this README):

```
GEMINI_API_KEY=your_key_here
```

It's already in `.gitignore` and `.dockerignore`, so it never gets committed or shipped in
the Docker image — it's loaded automatically by `DotNetEnv` at startup (see
`backend/Chokh.Api/Program.cs`), searching upward from wherever `dotnet run` executes.

**Option B — .NET user-secrets** (key stored outside the repo entirely, in your user
profile):

```bash
cd backend/Chokh.Api
dotnet user-secrets set "GEMINI_API_KEY" "your_key_here"
```

**Option C — shell environment variable** (session-only, has to be re-set each new
terminal):

```bash
export GEMINI_API_KEY=your_key_here      # PowerShell: $env:GEMINI_API_KEY="your_key_here"
```

Then run the backend:

```bash
cd backend/Chokh.Api
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
cp .env.example .env      # then edit VITE_API_URL to http://localhost:8080
npm install
npm run dev
```

Vite serves the app on `http://localhost:5173`. The frontend calls the backend at whatever
`VITE_API_URL` points to (see `frontend/.env.example`) — for local dev that's your locally
running backend at `http://localhost:8080`, so start the backend first. There's no dev-server
proxy for `/api/*` (Vite's `preview` command inherits `server.proxy`, which would leak a
`localhost` target into production — see the comment in `frontend/vite.config.js`), so
`VITE_API_URL` is the single source of truth in every environment, local and deployed alike.

Open `http://localhost:5173` on a phone (or a desktop browser with a webcam) to try it.
`getUserMedia` requires HTTPS or `localhost` — that's satisfied automatically in dev and by
Render in production. On a phone, prefer the rear (environment-facing) camera; the app
requests it via `facingMode: "environment"` but falls back to whatever camera is available.

### 3. Running the combined production build locally (optional)

This mirrors the single-service Render deployment (frontend + backend, same origin), so
leave `VITE_API_URL` **unset** for this build — the relative `/api/describe` path already
works when both are served from `:8080` together. If you have a `frontend/.env` left over
from step 2, remove or comment out `VITE_API_URL` in it before building here.

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

**Backend:**

| Variable          | Required | Default | Notes                                                                 |
|-------------------|----------|---------|------------------------------------------------------------------------|
| `GEMINI_API_KEY`  | Yes      | —       | Never sent to the frontend; read only on the backend.                 |
| `PORT`            | No       | `8080`  | Port the backend (and Render) listens on.                             |
| `FRONTEND_ORIGIN` | Only if frontend and backend are separate services | — (CORS disabled) | The frontend's exact origin (e.g. `https://chokh.onrender.com`), enabling CORS for it. Comma-separate multiple origins. Not needed in the single combined-service deployment, since same-origin requests don't need CORS. |

**Frontend** (only relevant if the frontend is deployed as its own service, separate from the backend — see [Deploying to Render](#deploying-to-render)):

| Variable       | Required | Default                | Notes                                                            |
|----------------|----------|-------------------------|-------------------------------------------------------------------|
| `VITE_API_URL` | Only for a separate frontend deployment | unset (relative `/api/...`) | The backend's full URL, no trailing slash. Baked in at **build time** — changing it requires a rebuild, not just a restart. Never put secrets in a `VITE_`-prefixed variable; it ends up in the client-side bundle. |

## Deploying to Render

The included `Dockerfile` builds the React frontend, publishes the .NET backend, copies the
frontend build into the backend's `wwwroot`, and runs everything as a single container — one
Render web service, no separate static site needed, no CORS config needed (same origin
serves both the app and `/api/describe`).

### Prerequisites

- This repo pushed to GitHub, GitLab, or Bitbucket.
- A free [Render](https://render.com) account (sign in with GitHub is easiest — it also
  grants the repo access Render needs).
- Your Gemini API key ready to paste in (from
  [Google AI Studio](https://aistudio.google.com/apikey)).

### Step-by-step

1. **Push your code**, if you haven't already:

   ```bash
   git add -A
   git commit -m "Deploy Chokh"
   git push origin main
   ```

2. Go to the [Render dashboard](https://dashboard.render.com) → **New +** → **Web Service**.
3. **Connect your repository** — pick it from the list (Render will ask to install the
   GitHub app the first time if you haven't already).
4. On the setup screen:
   - **Name:** anything, e.g. `chokh`
   - **Region:** closest to your users (e.g. Singapore for Bangladesh)
   - **Branch:** `main`
   - **Runtime:** **Docker** — Render should auto-detect the root `Dockerfile`; if it
     defaults to something else, switch it manually
   - **Instance type:** Free is fine for a demo (see the cold-start note below)
5. Under **Environment Variables**, click **Add Environment Variable**:
   - Key: `GEMINI_API_KEY`
   - Value: your actual Gemini key
   - (Don't set `PORT` — Render injects it automatically and the app already reads it,
     falling back to `8080` if it's ever absent.)
6. Click **Create Web Service**.

Render will pull the repo, build the Docker image (frontend build → backend publish →
runtime — takes a few minutes the first time), and deploy it. Watch the **Logs** tab; a
successful boot ends with a line like `Now listening on: http://0.0.0.0:10000`.

### Verifying it worked

- Open the `*.onrender.com` URL Render gives you — the Chokh UI should load.
- Visit `/swagger` on that same URL to confirm the API is reachable and try
  `POST /api/describe` directly from the Swagger UI.
- If every request returns the Bengali fallback message instead of a real description,
  `GEMINI_API_KEY` is missing or wrong — check **Environment** in the Render dashboard, and
  check **Logs** for a line like `GEMINI_API_KEY is not set`.
- Camera capture requires HTTPS, which Render provides automatically on the `*.onrender.com`
  domain — no extra setup needed.

### Updating the key or redeploying later

- **Change the API key:** service page → **Environment** tab → edit `GEMINI_API_KEY` →
  **Save Changes**. Render redeploys automatically.
- **Deploy new code:** just `git push` to the connected branch — Render auto-deploys on
  every push by default (toggle this under **Settings → Auto-Deploy** if you want manual
  control instead).
- **Manual redeploy without new code:** service page → **Manual Deploy** → **Deploy latest
  commit**.

### Free tier cold starts (matters for a live demo)

Render's free web services spin down after ~15 minutes of no traffic and take roughly
30–50 seconds to wake back up on the next request. For a hackathon demo:

- Open the app's URL a minute or two before you present, so it's already warm.
- The 8-second Gemini timeout in the app is independent of this — it only starts once a
  request reaches the (already-awake) server, so a cold start won't trigger the fallback
  message on its own, it'll just delay the very first page load.
- If this is a problem, upgrade the service to a paid instance type (Starter or above),
  which doesn't spin down.

### Optional: custom domain

Service page → **Settings → Custom Domains** → add your domain and point its DNS (CNAME or
A record, as Render instructs) at the value Render shows. HTTPS is provisioned
automatically once DNS resolves.

## Notes and design choices

- Captured frames are downscaled (max 1024px on the longest side) and compressed to JPEG
  quality 0.7 client-side before upload, to keep requests fast on slower mobile connections
  — this matters more now that a frame is sent roughly every 2.5 seconds while active.
- Hazard styling (`frontend/src/copy.js`, `isHazardText`) and the "text detected" badge are
  both **client-side heuristics** on the returned Bengali sentence (keyword matching / phrase
  matching), not structured fields from Gemini — the backend still returns one plain string.
  They degrade gracefully: no keyword match just means a normal (non-red) narration card.
- If `GEMINI_API_KEY` is missing, or the Gemini call fails, errors, or exceeds 8 seconds, the
  backend itself returns the Bengali fallback message in `{ text }`; the frontend detects this
  by exact match and treats it the same as a network-level failure (red card, spoken, loop
  continues on the longer error pause).
- **TTS is intentionally provider-agnostic**: `frontend/src/speech.js` exposes `speak()` /
  `stopSpeaking()` / `isSpeechSupported()` that every caller uses. Today it's browser
  `SpeechSynthesis`; if a target device has no Bengali voice installed at all, swapping in a
  cloud TTS API later only means changing the inside of `speak()`.
- Out of scope for this MVP, deliberately: user accounts, a database, a dashboard, payments,
  fine-tuning, true real-time video streaming, and any backend logic beyond proxying a single
  Gemini call per frame. The backend exists solely so `GEMINI_API_KEY` never reaches the
  browser.
