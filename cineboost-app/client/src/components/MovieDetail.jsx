import { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar
} from 'recharts';
import { CATEGORIES, CATEGORY_LABELS, CATEGORY_ICONS, CATEGORY_COLORS, SOURCES } from '../lib/constants.js';
import { upsertRating, sendRecFeedback, fetchMovieSummary } from '../lib/api.js';

export default function MovieDetail({ movie, user, userRating, onClose, onUpdated }) {
  const [tab, setTab] = useState('breakdown');
  const [sliders, setSliders] = useState(userRating ? {
    story: userRating.story, effects: userRating.effects,
    soundtrack: userRating.soundtrack, acting: userRating.acting
  } : { story: 7, effects: 7, soundtrack: 7, acting: 7 });
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  // 'loading' | 'error' | string (the summary text) | null (no fetch yet)
  const [summary, setSummary] = useState('loading');

  // Fetch the AI-generated critic-vs-audience summary when the modal opens.
  useEffect(() => {
    let alive = true;
    setSummary('loading');
    fetchMovieSummary(movie.id)
      .then(r => { if (alive) setSummary(r?.summary || 'error'); })
      .catch(() => { if (alive) setSummary('error'); });
    return () => { alive = false; };
  }, [movie.id]);

  useEffect(() => {
    if (userRating) setSliders({
      story: userRating.story, effects: userRating.effects,
      soundtrack: userRating.soundtrack, acting: userRating.acting
    });
  }, [userRating?.movie_id]);

  // Lock body scroll while the modal is open. iOS Safari ignores `overflow: hidden`
  // on body for touch scroll, so we use the canonical "pin body in place with
  // position: fixed at -scrollY" trick. Restores both styles and scroll position
  // on close so the user lands back where they were.
  useEffect(() => {
    const scrollY = window.scrollY;
    const body = document.body;
    const prev = {
      overflow: body.style.overflow,
      position: body.style.position,
      top:      body.style.top,
      left:     body.style.left,
      right:    body.style.right,
      width:    body.style.width
    };
    body.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.top      = `-${scrollY}px`;
    body.style.left     = '0';
    body.style.right    = '0';
    body.style.width    = '100%';
    return () => {
      Object.assign(body.style, prev);
      window.scrollTo(0, scrollY);
    };
  }, []);

  const breakdown = CATEGORIES.map(c => {
    const row = { category: CATEGORY_LABELS[c] };
    for (const s of SOURCES) row[s.name] = movie.sources?.[s.key]?.[c] ?? null;
    return row;
  });
  const radarData = CATEGORIES.map(c => {
    const aggSrc = movie.sources ? Object.values(movie.sources) : [];
    const agg = aggSrc.length ? aggSrc.reduce((a, s) => a + (s[c] ?? 0), 0) / aggSrc.length : 0;
    return {
      category: CATEGORY_LABELS[c],
      Aggregate: agg,
      You: userRating ? userRating[c] : null
    };
  });

  async function submitRating() {
    if (!user) { alert('Sign in with Google to save ratings.'); return; }
    setSaving(true);
    try {
      await upsertRating(movie.id, { ...sliders });
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1800);
      onUpdated?.();
    } catch (e) { alert('Failed to save: ' + e.message); }
    setSaving(false);
  }

  async function recFeedback(signal) {
    if (!user) { alert('Sign in with Google to save feedback.'); return; }
    try { await sendRecFeedback(movie.id, signal); onUpdated?.(); }
    catch (e) { alert('Failed: ' + e.message); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-6 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="relative w-full max-w-5xl glass-strong rounded-t-3xl md:rounded-3xl overflow-hidden pop-in"
           style={{ maxHeight: '92vh' }} onClick={e => e.stopPropagation()}>
        {/* Close button stays put while content scrolls beneath */}
        <button onClick={onClose}
                className="absolute top-3 right-3 z-20 w-11 h-11 rounded-full glass-strong text-lg"
                aria-label="Close">✕</button>
        {/* Single unified scroll container so the whole modal scrolls together */}
        <div className="overflow-y-auto overscroll-contain scroll-thin"
             style={{ maxHeight: '92vh', paddingBottom: 'env(safe-area-inset-bottom)' }}>
          {/* Mobile drag handle (bottom-sheet pattern) */}
          <button onClick={onClose}
                  className="md:hidden w-full pt-2.5 pb-1 flex items-center justify-center"
                  aria-label="Close" style={{ minHeight: 0 }}>
            <span className="block w-12 h-1.5 rounded-full bg-white/30" />
          </button>
          <div className="grid md:grid-cols-[260px_1fr]">
          <div className="p-5 md:p-6 bg-gradient-to-b from-white/10 to-transparent">
            {movie.poster_url
              ? <img src={movie.poster_url} className="w-full max-w-[230px] mx-auto rounded-2xl" alt="" />
              : <div className="aspect-[2/3] rounded-2xl bg-gradient-to-br from-pink-500 to-purple-600" />}

            {/* Critic-vs-audience juxtaposition (Gemini-generated, server-cached) */}
            <div className="mt-3 rounded-xl p-3 glass border border-white/10">
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="text-[10px] uppercase tracking-wider opacity-70 font-bold">Critics vs. audience</span>
                <span className="text-[10px] opacity-50">· AI</span>
              </div>
              {summary === 'loading' ? (
                <div className="text-xs text-white/55 italic flex items-center gap-2">
                  <span className="inline-block w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
                  Comparing critic and audience takes…
                </div>
              ) : summary === 'error' || !summary ? (
                <div className="text-xs text-white/45">Insight unavailable.</div>
              ) : (
                <div className="text-sm text-white/85 leading-relaxed">{summary}</div>
              )}
            </div>

            <h3 className="mt-4 text-xl font-extrabold">{movie.title}</h3>
            <div className="text-xs text-white/60">{movie.year}</div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {SOURCES.map(s => {
                const sc = movie.sources?.[s.key];
                if (!sc) return null;
                const avg = (sc.story + sc.effects + sc.soundtrack + sc.acting) / 4;
                return (
                  <div key={s.key} className="rounded-lg glass px-2.5 py-2">
                    <div className="text-[10px] uppercase tracking-wider" style={{ color: s.color }}>{s.name}</div>
                    <div className="font-bold">{avg.toFixed(1)}</div>
                  </div>
                );
              })}
            </div>

            {/* Soundtrack deep-links — search results on each platform */}
            <SoundtrackLinks title={movie.title} year={movie.year} />
          </div>

          <div className="p-5 md:p-6">
            <div className="flex flex-wrap gap-2 mb-4">
              {[['breakdown','📊 Breakdown'],['rate', userRating ? '✏️ Update rating' : '⭐ I watched this'],['rec','👍 Rate the rec']].map(([k,l]) => (
                <button key={k} onClick={() => setTab(k)}
                        className={`px-3.5 py-1.5 rounded-full text-xs font-semibold ${tab===k ? 'bg-white text-purple-900' : 'glass'}`}>{l}</button>
              ))}
            </div>
            <p className="text-sm text-white/80 mb-4 leading-relaxed">{movie.overview}</p>

            {tab === 'breakdown' && (
              <div className="space-y-5">
                {/* Mobile: horizontal bars per category — readable on a 360px wide phone */}
                <div className="md:hidden space-y-4">
                  {breakdown.map(d => (
                    <div key={d.category}>
                      <div className="text-xs font-bold uppercase tracking-wider opacity-70 mb-1.5">{d.category}</div>
                      <div className="space-y-1.5">
                        {SOURCES.map(s => {
                          const v = d[s.name] ?? 0;
                          return (
                            <div key={s.key} className="flex items-center gap-2">
                              <div className="text-[11px] w-24 shrink-0 truncate font-semibold" style={{ color: s.color }}>{s.name}</div>
                              <div className="flex-1 h-2.5 rounded-full bg-white/10 overflow-hidden">
                                <div className="h-full rounded-full transition-all" style={{ width: `${(v / 10) * 100}%`, background: s.color }} />
                              </div>
                              <div className="text-[11px] font-bold w-7 text-right tabular-nums">{v.toFixed(1)}</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                {/* Desktop: grouped vertical bars via Recharts */}
                <div className="hidden md:block h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={breakdown} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid stroke="rgba(255,255,255,.08)" />
                      <XAxis dataKey="category" tick={{ fill: '#fff', fontSize: 12 }} />
                      <YAxis domain={[0,10]} tick={{ fill: 'rgba(255,255,255,.6)', fontSize: 11 }} />
                      <Tooltip contentStyle={{ background: '#1a1230', border: '1px solid rgba(255,255,255,.2)', borderRadius: 8 }} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      {SOURCES.map(s => <Bar key={s.key} dataKey={s.name} fill={s.color} radius={[4,4,0,0]} />)}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={radarData}>
                      <PolarGrid stroke="rgba(255,255,255,.2)" />
                      <PolarAngleAxis dataKey="category" tick={{ fill:'#fff', fontSize: 12 }} />
                      <PolarRadiusAxis angle={90} domain={[0,10]} tick={{ fill:'rgba(255,255,255,.5)', fontSize:10 }} />
                      <Radar dataKey="Aggregate" stroke="#6b9dff" fill="#6b9dff" fillOpacity={0.4} strokeWidth={2} />
                      {userRating && <Radar dataKey="You" stroke="#ffd86b" fill="#ffd86b" fillOpacity={0.35} strokeWidth={2} />}
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {tab === 'rate' && (
              <div>
                <div className="space-y-4">
                  {CATEGORIES.map(c => (
                    <div key={c}>
                      <div className="flex justify-between text-sm mb-1.5">
                        <span className="font-semibold">{CATEGORY_ICONS[c]} {CATEGORY_LABELS[c]}</span>
                        <span className="font-bold" style={{ color: CATEGORY_COLORS[c] }}>{sliders[c].toFixed(1)}</span>
                      </div>
                      <input type="range" min="1" max="10" step="0.1" value={sliders[c]}
                             onChange={e => setSliders(s => ({...s, [c]: parseFloat(e.target.value)}))}
                             className="rainbow" />
                    </div>
                  ))}
                </div>
                <div className="mt-5 flex items-center gap-3">
                  <button onClick={submitRating} disabled={saving}
                          className="px-5 py-2.5 rounded-full font-bold text-sm"
                          style={{ background: 'linear-gradient(135deg,#6bffd8,#6b9dff)', color: '#1a1230' }}>
                    {saving ? 'Saving…' : (userRating ? '💾 Save update' : '🚀 Submit')}
                  </button>
                  {savedFlash && <span className="text-sm">Saved 🎉</span>}
                </div>
              </div>
            )}

            {tab === 'rec' && (
              <div>
                <p className="text-sm text-white/75 mb-4">
                  Was this recommendation any good? Your feedback nudges per-source trust on the server.
                </p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { v:  1, l: '👍 Loved it',     g:'linear-gradient(135deg,#6bffd8,#6b9dff)' },
                    { v:  0, l: '😐 Mid',          g:'linear-gradient(135deg,#ffd86b,#ff9e6b)' },
                    { v: -1, l: '👎 Not for me',   g:'linear-gradient(135deg,#ff6b9d,#c66bff)' }
                  ].map(b => (
                    <button key={b.v} onClick={() => recFeedback(b.v)}
                            className="px-4 py-2 rounded-full font-semibold text-sm"
                            style={{ background: b.g, color: '#1a1230' }}>
                      {b.l}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Soundtrack quick-links. We deep-link into each platform's search results
// rather than resolving the actual album URL — no extra API keys, no rate
// limits, and works for any movie. Users land on a results list and tap the
// right album.
// ---------------------------------------------------------------------------
function SoundtrackLinks({ title, year }) {
  if (!title) return null;
  const q = `${title} ${year || ''} soundtrack`.trim();
  const enc = encodeURIComponent(q);
  return (
    <div className="mt-4">
      <div className="text-[10px] uppercase tracking-wider opacity-70 font-bold mb-1.5">🎵 Soundtrack</div>
      <div className="flex gap-2">
        <a href={`https://open.spotify.com/search/${enc}/albums`}
           target="_blank" rel="noreferrer noopener"
           className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-full text-xs font-bold text-black"
           style={{ background: '#1DB954' }}
           aria-label={`Open Spotify search for ${title} soundtrack`}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.42 1.56-.301.42-1.02.599-1.56.3z"/>
          </svg>
          Spotify
        </a>
        <a href={`https://music.youtube.com/search?q=${enc}`}
           target="_blank" rel="noreferrer noopener"
           className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-full text-xs font-bold text-white"
           style={{ background: '#FF0033' }}
           aria-label={`Open YouTube Music search for ${title} soundtrack`}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 0C5.376 0 0 5.376 0 12s5.376 12 12 12 12-5.376 12-12S18.624 0 12 0zm0 19.104c-3.924 0-7.104-3.18-7.104-7.104S8.076 4.896 12 4.896s7.104 3.18 7.104 7.104-3.18 7.104-7.104 7.104zm0-13.332c-3.432 0-6.228 2.796-6.228 6.228 0 3.432 2.796 6.228 6.228 6.228 3.432 0 6.228-2.796 6.228-6.228 0-3.432-2.796-6.228-6.228-6.228zM9.684 15.54V8.46L15.864 12l-6.18 3.54z"/>
          </svg>
          YT Music
        </a>
      </div>
    </div>
  );
}
