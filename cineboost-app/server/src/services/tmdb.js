// Thin TMDB client. Supports either a v4 read-access token (Bearer) or v3 api_key.
import fetch from 'node-fetch';

const BASE = 'https://api.themoviedb.org/3';

function authFor(key) {
  if (!key) throw new Error('TMDB_KEY not set');
  // v4 tokens are JWT-ish, much longer than v3 keys
  return key.length > 40
    ? { headers: { Authorization: `Bearer ${key}`, accept: 'application/json' }, qs: '' }
    : { headers: {}, qs: `&api_key=${encodeURIComponent(key)}` };
}

export async function nowPlaying(page = 1) {
  const { headers, qs } = authFor(process.env.TMDB_KEY);
  const res = await fetch(`${BASE}/movie/now_playing?language=en-US&page=${page}${qs}`, { headers });
  if (!res.ok) throw new Error(`tmdb now_playing ${res.status}`);
  return res.json();
}

export async function movieDetails(tmdbId) {
  const { headers, qs } = authFor(process.env.TMDB_KEY);
  const res = await fetch(`${BASE}/movie/${tmdbId}?language=en-US${qs}`, { headers });
  if (!res.ok) throw new Error(`tmdb details ${res.status}`);
  return res.json();
}

export async function topNowPlaying(count = 50) {
  const all = [];
  for (let p = 1; p <= 3 && all.length < count; p++) {
    const data = await nowPlaying(p);
    all.push(...data.results);
  }
  return all.slice(0, count).map(m => ({
    id: `tmdb-${m.id}`,
    tmdb_id: m.id,
    title: m.title,
    year: (m.release_date || '').slice(0, 4),
    overview: m.overview,
    poster_url: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : null,
    tmdb_score: m.vote_average ?? null,
    tmdb_votes: m.vote_count ?? 0,
    release_date: m.release_date
  }));
}
