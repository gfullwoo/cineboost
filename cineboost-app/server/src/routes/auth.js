import { Router } from 'express';
import { verifyGoogleIdToken, signSession } from '../auth.js';
import { getDb } from '../db/index.js';

const r = Router();

// Frontend posts the Google credential (an ID token JWT). We verify with Google,
// upsert the user, and hand back a session JWT to use as Bearer for subsequent calls.
r.post('/google', async (req, res, next) => {
  try {
    const { credential } = req.body || {};
    if (!credential) return res.status(400).json({ error: 'missing_credential' });
    const profile = await verifyGoogleIdToken(credential);

    getDb().prepare(`
      INSERT INTO users (id, email, name, picture, created_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET email=excluded.email, name=excluded.name, picture=excluded.picture
    `).run(profile.id, profile.email, profile.name, profile.picture, Date.now());

    // Initialize default per-user weights row if missing
    getDb().prepare(`INSERT OR IGNORE INTO user_weights (user_id) VALUES (?)`).run(profile.id);

    const token = signSession(profile);
    res.json({ token, user: profile });
  } catch (e) {
    console.error('[auth] google fail', e.message);
    res.status(401).json({ error: 'auth_failed', detail: e.message });
  }
});

export default r;
