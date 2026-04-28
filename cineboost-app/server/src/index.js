// CineBoost backend entry point
import 'dotenv/config';
import dns from 'node:dns';
// Some networks return broken AAAA (IPv6) records. Tell Node to prefer IPv4
// when both are available, which fixes the "ENOTFOUND" hangs on residential
// networks, hotel Wi-Fi, and some corporate networks.
dns.setDefaultResultOrder('ipv4first');
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initDb } from './db/index.js';
import authRouter from './routes/auth.js';
import moviesRouter from './routes/movies.js';
import ratingsRouter from './routes/ratings.js';
import { requireAuth } from './auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');           // repo root
const CLIENT_DIST = path.resolve(ROOT, 'client', 'dist');   // built frontend

const app = express();

// Trust the proxy (Cloudflare Tunnel / nginx / etc.) so req.protocol reflects HTTPS,
// req.ip is the real client, and the rate limiter (if added) sees the real IP.
app.set('trust proxy', 1);

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '256kb' }));

initDb();

// --- API ---
app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'cineboost', ts: Date.now() }));
app.use('/api/auth', authRouter);
app.use('/api/movies', moviesRouter);
app.use('/api/ratings', requireAuth, ratingsRouter);

// --- Static frontend (when built) ---
if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST, { maxAge: '1h', index: false }));
  // SPA fallback — anything that isn't /api and doesn't have a file extension
  // gets the React index.html so client-side routing works.
  app.get(/^\/(?!api\/).*/, (req, res, next) => {
    if (path.extname(req.path)) return next();
    res.sendFile(path.join(CLIENT_DIST, 'index.html'));
  });
} else {
  app.get('/', (_req, res) => {
    res.status(503).type('text/plain').send(
      "Frontend isn't built yet.\n" +
      "Run: cd client && npm install && npm run build\n" +
      "Then restart this server.\n"
    );
  });
}

// --- Error handler ---
app.use((err, _req, res, _next) => {
  console.error('[server] unhandled', err);
  res.status(err.status || 500).json({ error: err.message || 'server_error' });
});

const port = Number(process.env.PORT || 8787);
app.listen(port, () => {
  console.log(`[cineboost] listening on http://localhost:${port}`);
  console.log(`[cineboost] serving frontend from: ${fs.existsSync(CLIENT_DIST) ? CLIENT_DIST : '(none — run `npm run build` in client/)'}`);
});
