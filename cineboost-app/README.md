# CineBoost

A full-stack web app that ranks the top 50 movies in theaters by **Story / Effects / Soundtrack / Acting**, learns your preferences from recommendation feedback, and lets you rate what you watched.

```
cineboost-app/
├── server/   # Node + Express + SQLite. Talks to TMDB, OMDb. Runs the per-category NLP.
├── client/   # Vite + React + Tailwind. Real Google login.
└── README.md (this file)
```

## What's wired up

| Concern | Source / Tool |
| --- | --- |
| Now-playing list | TMDB `/movie/now_playing` |
| Audience overall scores | TMDB |
| IMDb + Rotten Tomatoes scores | OMDb (one call → both) |
| Real user reviews | TMDB `/movie/{id}/reviews` (full-text) |
| Per-category sentiment | Tiny in-house keyword + AFINN-style scorer (`server/src/services/nlp.js`). Designed to swap for a real model. |
| Login | Google Identity Services → server verifies the ID token → JWT session |
| Rating storage | SQLite (`better-sqlite3`) |
| Recommendation learning | Per-user source-trust weights, nudged on each thumbs-up/down |

## Quick start (development)

You'll need:
- **Node 20+**
- A **TMDB API key** — https://www.themoviedb.org/settings/api (free)
- An **OMDb API key** — https://www.omdbapi.com/apikey.aspx (free, 1k/day)
- A **Google OAuth Client ID** — https://console.cloud.google.com/apis/credentials → "OAuth 2.0 Client ID" (Web). Add `http://localhost:5173` to "Authorized JavaScript origins".

```bash
cd cineboost-app
cp server/.env.example server/.env       # fill in keys
cp client/.env.example client/.env       # set VITE_GOOGLE_CLIENT_ID
npm run install:all

# in one terminal
npm run dev:server                       # http://localhost:8787
# in another
npm run dev:client                       # http://localhost:5173
```

Visit `http://localhost:5173`. The first now-playing fetch takes a few seconds because the server is also pulling OMDb + TMDB review text per movie. Subsequent loads hit the SQLite cache.

## Single-port production mode

The Express server can also serve the built React app on the same port (handy for self-hosting):

```bash
npm run install:all
npm run build           # builds client → client/dist/
npm start               # Express on :8787 serves both API + frontend
# open http://localhost:8787
```

## Self-hosting from a laptop with HTTPS

See **[HOSTING.md](./HOSTING.md)** for a step-by-step Cloudflare Tunnel + pm2 + macOS recipe. Free, no port-forwarding, real HTTPS, auto-restart on reboot.

## Architecture overview

```
┌───────────────┐     ┌───────────────────────────────────────┐     ┌────────────┐
│  React client │ ──► │   Express server                      │ ──► │   TMDB     │
│ (Vite, port   │     │  ┌──────────┐  ┌──────────────┐       │     │   OMDb     │
│  5173)        │     │  │ /auth    │  │ /movies      │       │     │ TMDB Revs  │
│               │ ◄── │  │ /ratings │  │ /now-playing │       │     └────────────┘
│  Google login │     │  └──────────┘  └──────────────┘       │
│  Charts UI    │     │     │              │                  │
│               │     │     ▼              ▼                  │
└───────────────┘     │   SQLite      services/nlp.js         │
                      │  (users,         (per-category        │
                      │   ratings,        sentiment)          │
                      │   weights,                            │
                      │   source_score                        │
                      │   cache)                              │
                      └───────────────────────────────────────┘
```

## How the recommender learns

When you 👍 or 👎 a recommendation, the server looks at how each source scored that specific movie relative to the aggregate. Sources that pointed in the same direction as your reaction get a small upward nudge to their personal trust weight; sources that pointed the wrong way get a small downward nudge. Over time your top-ranked list reflects which signals work for *you*.

This is intentionally minimal — production would log feedback events and run a real learner offline (Bayesian update, factorization, contextual bandit, whatever fits the volume). Code lives in `server/src/routes/ratings.js` under `POST /:movieId/rec-feedback`.

## What to build next

- **Better per-category scoring from review text.** The current keyword + AFINN scorer over TMDB review text is intentionally swappable. Drop in a hosted classifier or fine-tune a small model on labeled per-aspect review excerpts; replace `scoreCorpus` in `server/src/services/nlp.js`.
- **Bigger source surface.** TMDB+OMDb covers most needs; for more reviewer voice you can add Letterboxd RSS (`letterboxd.com/film/<slug>/rss`), MovieLens public datasets, or a paid Rotten Tomatoes feed. Each new source becomes a sibling of `server/src/services/viewerReviews.js`.
- **Real-time refresh.** Schedule a job (e.g. a tiny `node-cron` worker) that refreshes now-playing and source scores hourly so cold-loads aren't slow.
- **Multi-user weight charts.** You already store per-user weights — expose a "how my taste compares to the average" view.
- **Mobile app.** The API contract is stable; a React Native or SwiftUI client would be a thin port of the React frontend.

## Project status

This is a working scaffold, not a production app. It's missing rate limiting, CSRF protection on the cookie path (we use Bearer tokens so this isn't critical, but worth thinking about), retry/backoff on external APIs, structured logging, and tests. Each is straightforward to add — the code structure leaves clear seams.
