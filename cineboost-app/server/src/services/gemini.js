// Gemini summary generator: takes a movie + its per-source category scores +
// a small corpus of viewer review text, and returns 2-3 plain sentences
// describing the gap (or alignment) between critic and audience opinion.
//
// Free tier on gemini-1.5-flash is 15 RPM / 1500 RPD which is plenty for the
// "user opens a movie modal" pattern. Summaries are cached in SQLite for 24h
// in routes/movies.js — Gemini gets called at most once per movie per day.
import fetch from 'node-fetch';

// Google steers new accounts onto the latest models — both 1.5-flash and
// 2.0-flash refuse new users in 2026. 2.5-flash is the current GA flash.
const MODEL = 'gemini-2.5-flash';
const ENDPOINT = (model) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

const CATS = ['story', 'effects', 'soundtrack', 'acting'];

function avgCats(obj) {
  let n = 0, c = 0;
  for (const k of CATS) if (typeof obj?.[k] === 'number') { n += obj[k]; c++; }
  return c ? n / c : null;
}

function fmt(num) {
  return typeof num === 'number' ? num.toFixed(1) : '–';
}

function buildPrompt({ movie, sources, reviews }) {
  // Group sources into "critic" (Rotten Tomatoes Tomatometer is critic-driven)
  // and "audience" (TMDB users, IMDb users, written user reviews).
  const critic = sources.rt ? avgCats(sources.rt) : null;
  const audKeys = ['tmdb', 'imdb', 'reviews'].filter(k => sources[k]);
  const audAvgs = audKeys.map(k => avgCats(sources[k])).filter(v => v != null);
  const audience = audAvgs.length ? audAvgs.reduce((a, b) => a + b, 0) / audAvgs.length : null;

  const breakdown = CATS.map(c => {
    const cr = sources.rt?.[c];
    const audVals = audKeys.map(k => sources[k]?.[c]).filter(v => typeof v === 'number');
    const audAvg = audVals.length ? audVals.reduce((a, b) => a + b, 0) / audVals.length : null;
    return `  ${c.padEnd(11)} critics: ${fmt(cr)}   audience: ${fmt(audAvg)}`;
  }).join('\n');

  const reviewBlock = reviews.length
    ? '\n\nSample audience review excerpts (real user-written):\n' +
      reviews.slice(0, 4).map(r => {
        const body = (r.body || '').replace(/\s+/g, ' ').trim();
        return `- "${body.slice(0, 240)}${body.length > 240 ? '…' : ''}"`;
      }).join('\n')
    : '';

  return `Write a 2-3 sentence summary of how critic opinion compares with audience opinion for this movie. Be specific and concrete: name the gap (or the alignment), and identify which category is driving it. Plain prose only — no markdown, no headers, no bullets, no quotation marks around your answer.

Movie: ${movie.title}${movie.year ? ` (${movie.year})` : ''}
${movie.overview ? `Plot: ${movie.overview.slice(0, 500)}\n` : ''}
Critic score (Rotten Tomatoes Tomatometer, 1-10): ${fmt(critic)}
Audience score (TMDB + IMDb + viewer-review sentiment, avg 1-10): ${fmt(audience)}

Per-category split:
${breakdown}${reviewBlock}

Your 2-3 sentence summary:`;
}

export async function generateJuxtaposition({ movie, sources, reviews = [] }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY not set');

  const prompt = buildPrompt({ movie, sources, reviews });

  const res = await fetch(`${ENDPOINT(MODEL)}?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.4,
        // Gemini 2.5 spends "thinking tokens" out of this budget before producing
        // visible text, so 280 was leaving only a fragment. 1024 gives plenty of
        // room even with thinking enabled.
        maxOutputTokens: 1024,
        topP: 0.9,
        // We don't need chain-of-thought for a 2-3 sentence summary; turn it off
        // so the entire output budget goes to the actual response.
        thinkingConfig: { thinkingBudget: 0 }
      }
    })
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`gemini ${res.status}: ${text.slice(0, 240)}`);
  }
  const data = await res.json();
  const out = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  return (out || '').trim();
}
