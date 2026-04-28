// Tiny fetch wrapper that injects the session JWT and parses JSON.
const API = import.meta.env.VITE_API_URL || '';

let token = localStorage.getItem('cineboost.token') || null;
let user = JSON.parse(localStorage.getItem('cineboost.user') || 'null');

export function getToken() { return token; }
export function getUser() { return user; }
export function setSession(t, u) {
  token = t; user = u;
  if (t) localStorage.setItem('cineboost.token', t); else localStorage.removeItem('cineboost.token');
  if (u) localStorage.setItem('cineboost.user',  JSON.stringify(u)); else localStorage.removeItem('cineboost.user');
}

async function call(path, opts = {}) {
  const headers = { 'content-type': 'application/json', ...(opts.headers || {}) };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { ...opts, headers });
  if (res.status === 401) { setSession(null, null); }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  return res.json();
}

// Auth
export const exchangeGoogle = (credential) =>
  call('/api/auth/google', { method: 'POST', body: JSON.stringify({ credential }) });

// Movies
export const fetchNowPlaying = (limit = 50) =>
  call(`/api/movies/now-playing?limit=${limit}`);
export const fetchMovieSummary = (movieId) =>
  call(`/api/movies/${encodeURIComponent(movieId)}/summary`);

// Ratings
export const fetchMyRatings = () => call('/api/ratings');
export const upsertRating = (movieId, body) =>
  call(`/api/ratings/${encodeURIComponent(movieId)}`, { method: 'PUT', body: JSON.stringify(body) });
export const sendRecFeedback = (movieId, signal) =>
  call(`/api/ratings/${encodeURIComponent(movieId)}/rec-feedback`, { method: 'POST', body: JSON.stringify({ signal }) });
export const getMyWeights = () => call('/api/ratings/me/weights');
export const setMyWeights = (body) =>
  call('/api/ratings/me/weights', { method: 'PUT', body: JSON.stringify(body) });
