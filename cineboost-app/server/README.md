# CineBoost Server

Node.js + Express + SQLite backend for CineBoost.

## What it does

- Pulls now-playing movies from **TMDB**.
- For each movie, fetches IMDb / Rotten Tomatoes scores via **OMDb** and pulls real user-written reviews from **TMDB's `/movie/{id}/reviews`** endpoint.
- Runs a tiny keyword-based NLP pass over the review text to produce per-category sentiment scores for **Story / Effects / Soundtrack / Acting**.
- Caches per-source per-category scores in SQLite for 12h.
- Verifies Google ID tokens and issues session JWTs.
- Stores user ratings + recommendation feedback, and learns per-user source-trust weights from that feedback.

## Setup

```bash
cd server
cp .env.example .env
# Fill in TMDB_KEY, OMDB_KEY, GOOGLE_CLIENT_ID, SESSION_JWT_SECRET
npm install
npm run dev
```

The server listens on `http://localhost:8787` by default.

## Where to get keys

- **TMDB** — https://www.themoviedb.org/settings/api (free; v3 key or v4 read-access token both work)
- **OMDb** — https://www.omdbapi.com/apikey.aspx (free 1k/day; gives IMDb + Rotten Tomatoes + Metacritic in one call)
- **Google OAuth Client ID** — https://console.cloud.google.com/apis/credentials → Create OAuth 2.0 Client ID (Web). Add `http://localhost:5173` to "Authorized JavaScript origins".
- **TMDB Reviews** — no extra key. Uses the same `TMDB_KEY` you already set above.

## Endpoints

| Method | Path | Auth | What |
| --- | --- | --- | --- |
| GET | `/api/health` | — | liveness |
| POST | `/api/auth/google` | — | `{credential}` (Google ID token JWT) → `{token, user}` |
| GET | `/api/movies/now-playing?limit=50` | optional | top movies with per-source scores. If signed in, weighted by your trust |
| GET | `/api/movies/:id` | optional | one movie's full breakdown |
| GET | `/api/ratings` | bearer | your ratings |
| PUT | `/api/ratings/:movieId` | bearer | upsert rating (`{story,effects,soundtrack,acting,recFeedback}`) |
| POST | `/api/ratings/:movieId/rec-feedback` | bearer | nudge your weights with `{signal: -1\|0\|1}` |
| GET / PUT | `/api/ratings/me/weights` | bearer | read/update your per-source + per-category weights |

## How category scores are derived

- **TMDB / IMDb / RT** publish a single overall score, not category-level. We split each source's overall into Story/Effects/Soundtrack/Acting using a deterministic per-(movie,source,category) variance — same technique as the prototype, but on the server now. To make this fully data-driven, replace the `deriveCats` call in `services/aggregator.js` with a pass over the source's review text using a real classifier.
- **Viewer Reviews** is the one source where we actually compute per-category sentiment. `services/viewerReviews.js` pulls real user-written reviews from TMDB's `/movie/{id}/reviews` endpoint, then `services/nlp.js` runs a category-keyword + AFINN-style pass over the text. Swap in a real model (transformers, an LLM, a hosted classifier) inside `scoreCorpus` to upgrade quality without changing any other code. To add another corpus (Letterboxd RSS, etc.), make a sibling of `viewerReviews.js` and merge its output before calling `scoreCorpus`.

## Production notes / things to add

- Cache TMDB now-playing for ~1 hour, not on every request.
- Move the rec-feedback weight nudge into a small offline learner (e.g. Bayesian update or matrix factorization).
- Add a per-user `weights` history table so you can chart how trust evolves.
- If you'll have non-trivial users, swap SQLite for Postgres and run migrations from `node-pg-migrate` or `drizzle-kit`.
- Add rate-limiting (e.g. `express-rate-limit`) on `/api/ratings/*` and IP-level limits on the public movie endpoints.
