import { Router } from 'express';
import { getDb } from '../db/index.js';

const r = Router();

// List the current user's ratings
r.get('/', (req, res) => {
  const rows = getDb().prepare(
    `SELECT movie_id, story, effects, soundtrack, acting, overall, rec_feedback, updated_at
     FROM ratings WHERE user_id = ? ORDER BY updated_at DESC`
  ).all(req.user.id);
  res.json({ ratings: rows });
});

// Upsert a rating
r.put('/:movieId', (req, res) => {
  const { story, effects, soundtrack, acting, recFeedback } = req.body || {};
  const numbers = [story, effects, soundtrack, acting].map(Number);
  if (numbers.some(n => !Number.isFinite(n) || n < 1 || n > 10)) {
    return res.status(400).json({ error: 'invalid_scores' });
  }
  const overall = numbers.reduce((a, b) => a + b, 0) / 4;
  const now = Date.now();
  getDb().prepare(`
    INSERT INTO ratings (user_id, movie_id, story, effects, soundtrack, acting, overall, rec_feedback, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, movie_id) DO UPDATE SET
      story=excluded.story, effects=excluded.effects, soundtrack=excluded.soundtrack,
      acting=excluded.acting, overall=excluded.overall, rec_feedback=excluded.rec_feedback,
      updated_at=excluded.updated_at
  `).run(req.user.id, req.params.movieId, ...numbers, overall, recFeedback ?? null, now);
  res.json({ ok: true, overall });
});

// Recommendation feedback also nudges per-user source weights so the recommender
// learns which signals to trust for this user.
r.post('/:movieId/rec-feedback', (req, res) => {
  const signal = parseInt(req.body?.signal, 10); // -1, 0, 1
  if (![ -1, 0, 1 ].includes(signal)) return res.status(400).json({ error: 'invalid_signal' });

  // Save to ratings row (creates a stub if none exists)
  const existing = getDb().prepare(
    `SELECT * FROM ratings WHERE user_id = ? AND movie_id = ?`
  ).get(req.user.id, req.params.movieId);

  if (existing) {
    getDb().prepare(`UPDATE ratings SET rec_feedback = ?, updated_at = ? WHERE user_id = ? AND movie_id = ?`)
      .run(signal, Date.now(), req.user.id, req.params.movieId);
  } else {
    // Stub row with neutral 5s so we still capture the feedback
    getDb().prepare(`
      INSERT INTO ratings (user_id, movie_id, story, effects, soundtrack, acting, overall, rec_feedback, updated_at)
      VALUES (?, ?, 5, 5, 5, 5, 5, ?, ?)
    `).run(req.user.id, req.params.movieId, signal, Date.now());
  }

  // Nudge weights: tiny update step toward sources whose score was high (or low)
  // when the user said the rec was good (or bad). Real systems would log this
  // and retrain offline; we just do a per-event nudge for the prototype.
  if (signal !== 0) {
    const movieScores = getDb().prepare(
      `SELECT source, story, effects, soundtrack, acting FROM source_scores WHERE movie_id = ?`
    ).all(req.params.movieId);
    if (movieScores.length) {
      const overallAvg = movieScores.reduce((a, s) => a + (s.story + s.effects + s.soundtrack + s.acting) / 4, 0) / movieScores.length;
      const w = getDb().prepare(`SELECT * FROM user_weights WHERE user_id = ?`).get(req.user.id);
      const updates = { tmdb: w.w_tmdb, rt: w.w_rt, imdb: w.w_imdb, reviews: w.w_reviews };
      for (const s of movieScores) {
        const srcAvg = (s.story + s.effects + s.soundtrack + s.acting) / 4;
        const dir = Math.sign(srcAvg - overallAvg);
        const key = `w_${s.source}`;
        const current = w[key] ?? 1;
        const next = Math.max(0, Math.min(3, current + 0.08 * signal * dir));
        updates[s.source] = next;
      }
      getDb().prepare(`UPDATE user_weights SET w_tmdb=?, w_rt=?, w_imdb=?, w_reviews=? WHERE user_id=?`)
        .run(updates.tmdb, updates.rt, updates.imdb, updates.reviews, req.user.id);
    }
  }

  res.json({ ok: true });
});

// Update per-user weights manually (settings panel)
r.put('/me/weights', (req, res) => {
  const { sources = {}, cats = {} } = req.body || {};
  const clamp = v => Math.max(0, Math.min(3, Number(v) || 1));
  getDb().prepare(`
    UPDATE user_weights SET
      w_tmdb=?, w_rt=?, w_imdb=?, w_reviews=?,
      w_story=?, w_effects=?, w_soundtrack=?, w_acting=?
    WHERE user_id = ?
  `).run(
    clamp(sources.tmdb), clamp(sources.rt), clamp(sources.imdb), clamp(sources.reviews),
    clamp(cats.story),   clamp(cats.effects), clamp(cats.soundtrack), clamp(cats.acting),
    req.user.id
  );
  res.json({ ok: true });
});

r.get('/me/weights', (req, res) => {
  const w = getDb().prepare('SELECT * FROM user_weights WHERE user_id = ?').get(req.user.id);
  res.json({
    sources: { tmdb: w.w_tmdb, rt: w.w_rt, imdb: w.w_imdb, reviews: w.w_reviews },
    cats:    { story: w.w_story, effects: w.w_effects, soundtrack: w.w_soundtrack, acting: w.w_acting }
  });
});

export default r;
