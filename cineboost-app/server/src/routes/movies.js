import { Router } from 'express';
import { topNowPlaying, movieDetails } from '../services/tmdb.js';
import { getSourceScores, aggregate } from '../services/aggregator.js';
import { gatherCorpus } from '../services/viewerReviews.js';
import { generateJuxtaposition } from '../services/gemini.js';
import { getDb } from '../db/index.js';
import { verifySession } from '../auth.js';

const SUMMARY_TTL_MS = 24 * 60 * 60 * 1000; // 24h

const r = Router();

// Optional auth: if the user is signed in we apply their personal weights.
function maybeUser(req, _res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) { req.user = null; return next(); }
  try { req.user = verifySession(token); } catch { req.user = null; }
  next();
}

function userWeights(userId) {
  if (!userId) return {
    sources: { tmdb: 1, rt: 1, imdb: 1, reviews: 1 },
    cats:    { story: 1, effects: 1, soundtrack: 1, acting: 1 }
  };
  const row = getDb().prepare('SELECT * FROM user_weights WHERE user_id = ?').get(userId);
  if (!row) return userWeights(null);
  return {
    sources: { tmdb: row.w_tmdb, rt: row.w_rt, imdb: row.w_imdb, reviews: row.w_reviews },
    cats:    { story: row.w_story, effects: row.w_effects, soundtrack: row.w_soundtrack, acting: row.w_acting }
  };
}

r.get('/now-playing', maybeUser, async (req, res, next) => {
  try {
    const limit = Math.min(50, Math.max(5, parseInt(req.query.limit || '50', 10)));
    const movies = await topNowPlaying(limit);
    const w = userWeights(req.user?.sub);
    // Aggregate in parallel, but cap concurrency so we don't blast OMDb/TMDB
    const out = [];
    const CONC = 4;
    for (let i = 0; i < movies.length; i += CONC) {
      const slice = movies.slice(i, i + CONC);
      const results = await Promise.all(slice.map(async m => {
        const sources = await getSourceScores(m);
        const overall = aggregate(sources, w.sources, w.cats);
        return { ...m, sources, overall };
      }));
      out.push(...results);
    }
    out.sort((a, b) => b.overall - a.overall);
    res.json({ movies: out, weights: w });
  } catch (e) {
    next(e);
  }
});

r.get('/:id', maybeUser, async (req, res, next) => {
  try {
    // For the prototype we re-pull now_playing and find by id. In production you'd
    // have a movies table you maintain incrementally.
    const movies = await topNowPlaying(50);
    const m = movies.find(x => x.id === req.params.id);
    if (!m) return res.status(404).json({ error: 'not_found' });
    const sources = await getSourceScores(m);
    const w = userWeights(req.user?.sub);
    res.json({ movie: { ...m, sources, overall: aggregate(sources, w.sources, w.cats) }, weights: w });
  } catch (e) {
    next(e);
  }
});

// AI-generated "critic vs. audience" summary for a single movie.
// Cached for 24h in `movie_summaries`; first call per movie hits Gemini, the
// rest of the day return instantly from SQLite.
r.get('/:id/summary', async (req, res, next) => {
  try {
    const id = req.params.id;
    if (!id || !id.startsWith('tmdb-')) {
      return res.status(400).json({ error: 'unsupported_movie_id', detail: 'expected tmdb-<id>' });
    }
    const tmdbId = id.slice(5);

    // Cache hit?
    const cached = getDb()
      .prepare('SELECT summary, generated_at FROM movie_summaries WHERE movie_id = ?')
      .get(id);
    if (cached && Date.now() - cached.generated_at < SUMMARY_TTL_MS) {
      return res.json({ summary: cached.summary, cached: true });
    }

    // Gather everything Gemini needs.
    const det = await movieDetails(tmdbId);
    const movie = {
      id,
      tmdb_id: det.id,
      title: det.title,
      year: (det.release_date || '').slice(0, 4),
      overview: det.overview || '',
      tmdb_score: det.vote_average ?? null,
      tmdb_votes: det.vote_count ?? 0
    };
    const [sources, reviews] = await Promise.all([
      getSourceScores(movie),
      gatherCorpus(tmdbId)
    ]);

    const summary = await generateJuxtaposition({ movie, sources, reviews });

    // Only cache if the response looks like a complete reply (not a truncated
    // fragment from a too-small token budget). Heuristic: at least 60 chars and
    // ends with sentence punctuation.
    const looksComplete = typeof summary === 'string'
      && summary.length >= 60
      && /[.!?]\s*$/.test(summary.trim());

    if (looksComplete) {
      getDb().prepare(`
        INSERT INTO movie_summaries (movie_id, summary, generated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(movie_id) DO UPDATE SET
          summary=excluded.summary, generated_at=excluded.generated_at
      `).run(id, summary, Date.now());
    } else {
      console.warn('[summary] response looked truncated/empty, not caching:', JSON.stringify(summary).slice(0, 120));
    }
    res.json({ summary: looksComplete ? summary : '', cached: false });
  } catch (e) {
    console.error('[summary] failed', e.message);
    res.status(502).json({ error: 'summary_failed', detail: e.message });
  }
});

export default r;
