# CineBoost Client

Vite + React + Tailwind frontend for CineBoost.

## Setup

```bash
cd client
cp .env.example .env
# Set VITE_GOOGLE_CLIENT_ID and (optional) VITE_API_URL
npm install
npm run dev
```

Opens at `http://localhost:5173`. The dev server proxies `/api/*` to the backend at `VITE_API_URL` (defaults to `http://localhost:8787`).

## Production build

```bash
npm run build
npm run preview
```

## Architecture

- `src/lib/api.js` — fetch wrapper, session token storage in localStorage.
- `src/components/Header.jsx` — branding, search, real Google login via `@react-oauth/google`.
- `src/components/MovieCard.jsx` — poster + per-category score chip.
- `src/components/MovieDetail.jsx` — bar + radar charts, rating sliders, recommendation feedback.
- `src/App.jsx` — top-level layout, fetches `/api/movies/now-playing` and per-user ratings.

The frontend is a thin client — all aggregation and persistence live on the server, so when you swap the backend's NLP / recommender for something smarter, the UI just sees better numbers.
