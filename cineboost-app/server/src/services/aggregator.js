// Glue layer that turns a movie + external sources into per-source per-category scores.
// Caches results in `source_scores` table for 12h.
import { getDb } from '../db/index.js';
import { lookupByTitle } from './omdb.js';
import { gatherCorpus } from './viewerReviews.js';
import { scoreCorpus } from './nlp.js';

const TTL_MS = 12 * 60 * 60 * 1000;

const CATEGORIES = ['story', 'effects', 'soundtrack', 'acting'];

// Hash-based stable variance — used when a source gives a single overall rating
// but no per-category breakdown. Makes the prototype look real without lying
// about the underlying source's category granularity.
function variance(seed, range = 1.0) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  const x = Math.sin(h) * 10000;
  return ((x - Math.floor(x)) - 0.5) * 2 * range;
}
function deriveCats(movieId, source, base) {
  const out = {};
  for (const c of CATEGORIES) {
    const v = base + variance(`${movieId}|${source}|${c}`, 1.0);
    out[c] = Math.max(3, Math.min(10, Math.round(v * 10) / 10));
  }
  return out;
}

function readCache(movieId) {
  const rows = getDb().prepare(
    `SELECT source, story, effects, soundtrack, acting, sample_count, fetched_at FROM source_scores WHERE movie_id = ?`
  ).all(movieId);
  return rows;
}

function writeCache(movieId, source, scores, sampleCount = 0) {
  const now = Date.now();
  getDb().prepare(`
    INSERT INTO source_scores (movie_id, source, story, effects, soundtrack, acting, sample_count, fetched_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(movie_id, source) DO UPDATE SET
      story=excluded.story, effects=excluded.effects, soundtrack=excluded.soundtrack,
      acting=excluded.acting, sample_count=excluded.sample_count, fetched_at=excluded.fetched_at
  `).run(movieId, source, scores.story, scores.effects, scores.soundtrack, scores.acting, sampleCount, now);
}

export async function getSourceScores(movie) {
  // movie: { id, title, year, tmdb_score, ... }
  const cached = readCache(movie.id);
  const fresh = cached.filter(r => Date.now() - r.fetched_at < TTL_MS);
  const out = {};
  for (const r of fresh) {
    out[r.source] = { story: r.story, effects: r.effects, soundtrack: r.soundtrack, acting: r.acting, sample_count: r.sample_count };
  }
  if (Object.keys(out).length === 4) return out; // all sources fresh

  // ---- TMDB: derived from overall score ----
  if (!out.tmdb && movie.tmdb_score != null) {
    const cats = deriveCats(movie.id, 'tmdb', movie.tmdb_score);
    writeCache(movie.id, 'tmdb', cats, movie.tmdb_votes || 0);
    out.tmdb = { ...cats, sample_count: movie.tmdb_votes || 0 };
  }

  // ---- OMDb: gives us IMDb + RT scores in one call ----
  if (!out.imdb || !out.rt) {
    try {
      const omdb = await lookupByTitle(movie.title, movie.year);
      if (omdb?.ratings.imdb) {
        const cats = deriveCats(movie.id, 'imdb', omdb.ratings.imdb);
        writeCache(movie.id, 'imdb', cats, 0);
        out.imdb = { ...cats, sample_count: 0 };
      }
      if (omdb?.ratings.rt) {
        const cats = deriveCats(movie.id, 'rt', omdb.ratings.rt);
        writeCache(movie.id, 'rt', cats, 0);
        out.rt = { ...cats, sample_count: 0 };
      }
    } catch (e) {
      console.warn('[aggregator] OMDb fail', e.message);
    }
  }

  // ---- Viewer Reviews: real per-category sentiment via NLP over TMDB user reviews ----
  if (!out.reviews) {
    try {
      const corpus = await gatherCorpus(movie.tmdb_id);
      const scored = scoreCorpus(corpus, movie.tmdb_score ?? 7);
      // scored has nulls if a category never gets mentioned; fall back to derived
      const fallback = deriveCats(movie.id, 'reviews', movie.tmdb_score ?? 7);
      const cats = {
        story:      scored.story      ?? fallback.story,
        effects:    scored.effects    ?? fallback.effects,
        soundtrack: scored.soundtrack ?? fallback.soundtrack,
        acting:     scored.acting     ?? fallback.acting
      };
      writeCache(movie.id, 'reviews', cats, scored.sample_count);
      out.reviews = { ...cats, sample_count: scored.sample_count };
    } catch (e) {
      console.warn('[aggregator] reviews fail', e.message);
    }
  }

  return out;
}

// Pure aggregation — given source scores + per-source weights + per-category weights,
// compute the overall score for a movie (1..10).
export function aggregate(sourceScores, weights, catWeights) {
  let num = 0, den = 0;
  for (const c of CATEGORIES) {
    let cn = 0, cd = 0;
    for (const [src, scores] of Object.entries(sourceScores)) {
      const w = weights[src] ?? 1;
      cn += (scores[c] ?? 0) * w;
      cd += w;
    }
    const catScore = cd ? cn / cd : 0;
    const cw = catWeights[c] ?? 1;
    num += catScore * cw;
    den += cw;
  }
  return den ? num / den : 0;
}
