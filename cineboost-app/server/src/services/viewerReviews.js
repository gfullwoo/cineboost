// Real user-written reviews for the per-category sentiment pipeline.
//
// Source: TMDB's `/movie/{id}/reviews` endpoint. No extra auth — uses your
// existing TMDB_KEY. Reviews tend to be 100–1000-word essays, which feeds the
// keyword-NLP scorer well. A future swap to Letterboxd RSS or another corpus
// only changes this one file.
import fetch from 'node-fetch';

function authFor(key) {
  if (!key) throw new Error('TMDB_KEY not set');
  return key.length > 40
    ? { headers: { Authorization: `Bearer ${key}`, accept: 'application/json' }, qs: '' }
    : { headers: {}, qs: `&api_key=${encodeURIComponent(key)}` };
}

async function fetchPage(tmdbId, page) {
  const { headers, qs } = authFor(process.env.TMDB_KEY);
  const url = `https://api.themoviedb.org/3/movie/${tmdbId}/reviews?language=en-US&page=${page}${qs}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`tmdb reviews ${res.status}`);
  return res.json();
}

/**
 * Returns up to ~40 reviews shaped for the NLP scorer:
 *   [{ body: string, score: number }, ...]
 *
 * `score` is used by the NLP scorer to weight reviews; TMDB doesn't publish
 * upvote counts so we weight by review length (longer ≈ more substantive).
 */
export async function gatherCorpus(tmdbId) {
  if (!tmdbId) return [];
  try {
    const out = [];
    // First page is usually enough; pull a second only if there are clearly
    // more results, to keep us well under the TMDB rate limit.
    const p1 = await fetchPage(tmdbId, 1);
    out.push(...(p1.results || []));
    if ((p1.total_pages || 1) > 1 && out.length < 20) {
      const p2 = await fetchPage(tmdbId, 2);
      out.push(...(p2.results || []));
    }
    return out
      .filter(r => r.content && r.content.length > 40)
      .map(r => ({
        body: r.content,
        // Length-weighted: 80-char review = weight 1, 800-char = weight 2.9
        score: Math.max(1, Math.log10(r.content.length))
      }));
  } catch (e) {
    console.warn('[reviews] fetch failed', e.message);
    return [];
  }
}
