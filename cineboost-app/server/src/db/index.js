import Database from 'better-sqlite3';
import path from 'node:path';

let db;

export function initDb() {
  const dbPath = path.resolve(process.env.DB_PATH || './cineboost.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,           -- google sub
      email         TEXT,
      name          TEXT,
      picture       TEXT,
      created_at    INTEGER NOT NULL
    );

    -- One rating per user per movie. Stores per-category scores plus the
    -- aggregate "did the recommendation hit?" signal.
    CREATE TABLE IF NOT EXISTS ratings (
      user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      movie_id      TEXT NOT NULL,
      story         REAL NOT NULL,
      effects       REAL NOT NULL,
      soundtrack    REAL NOT NULL,
      acting        REAL NOT NULL,
      overall       REAL NOT NULL,
      rec_feedback  INTEGER,                    -- -1, 0, 1, or NULL
      updated_at    INTEGER NOT NULL,
      PRIMARY KEY (user_id, movie_id)
    );

    -- Per-source per-category cache so we don't hammer external APIs every request
    CREATE TABLE IF NOT EXISTS source_scores (
      movie_id      TEXT NOT NULL,
      source        TEXT NOT NULL,              -- tmdb | rt | imdb | reviews
      story         REAL,
      effects       REAL,
      soundtrack    REAL,
      acting        REAL,
      sample_count  INTEGER,
      fetched_at    INTEGER NOT NULL,
      PRIMARY KEY (movie_id, source)
    );

    -- AI-generated "critics vs. audience" summaries, cached per movie.
    -- Refreshed lazily when the cached row is older than the TTL the route enforces.
    CREATE TABLE IF NOT EXISTS movie_summaries (
      movie_id     TEXT PRIMARY KEY,
      summary      TEXT NOT NULL,
      generated_at INTEGER NOT NULL
    );

    -- Per-user weights, learned from rec feedback
    CREATE TABLE IF NOT EXISTS user_weights (
      user_id       TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      w_tmdb        REAL NOT NULL DEFAULT 1.0,
      w_rt          REAL NOT NULL DEFAULT 1.0,
      w_imdb        REAL NOT NULL DEFAULT 1.0,
      w_reviews     REAL NOT NULL DEFAULT 1.0,
      w_story       REAL NOT NULL DEFAULT 1.0,
      w_effects     REAL NOT NULL DEFAULT 1.0,
      w_soundtrack  REAL NOT NULL DEFAULT 1.0,
      w_acting      REAL NOT NULL DEFAULT 1.0
    );
  `);

  // --- Migrations from older installs (Reddit → Viewer Reviews swap) ---
  const cols = db.prepare("PRAGMA table_info(user_weights)").all();
  const hasReddit  = cols.some(c => c.name === 'w_reddit');
  const hasReviews = cols.some(c => c.name === 'w_reviews');
  if (hasReddit && !hasReviews) {
    db.exec('ALTER TABLE user_weights RENAME COLUMN w_reddit TO w_reviews');
    console.log('[db] migrated user_weights.w_reddit → w_reviews');
  } else if (hasReddit && hasReviews) {
    // Belt and suspenders: column exists in both forms; drop the legacy one.
    try { db.exec('ALTER TABLE user_weights DROP COLUMN w_reddit'); } catch {}
  }
  // Drop any cached Reddit-derived per-category scores so they get re-computed
  // from real TMDB review text on the next request.
  db.prepare("DELETE FROM source_scores WHERE source = 'reddit'").run();
}

export function getDb() {
  if (!db) throw new Error('DB not initialized — call initDb() first');
  return db;
}
