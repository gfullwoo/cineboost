import { useEffect, useMemo, useState } from 'react';
import Header from './components/Header.jsx';
import MovieCard from './components/MovieCard.jsx';
import MovieDetail from './components/MovieDetail.jsx';
import { CATEGORIES, CATEGORY_LABELS, CATEGORY_ICONS, CATEGORY_COLORS } from './lib/constants.js';
import { fetchNowPlaying, fetchMyRatings, getUser } from './lib/api.js';

export default function App() {
  const [user, setUser] = useState(getUser());
  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [category, setCategory] = useState('overall');
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState(null);
  const [ratings, setRatings] = useState({}); // movieId -> rating row

  async function loadAll() {
    setLoading(true); setError(null);
    try {
      const data = await fetchNowPlaying(50);
      setMovies(data.movies);
      if (user) {
        const r = await fetchMyRatings();
        const map = {};
        for (const row of r.ratings) map[row.movie_id] = row;
        setRatings(map);
      } else {
        setRatings({});
      }
    } catch (e) { setError(e.message); }
    setLoading(false);
  }

  useEffect(() => { loadAll(); }, [user?.id]);

  const ranked = useMemo(() => {
    const filtered = movies.filter(m => !search || m.title.toLowerCase().includes(search.toLowerCase()));
    if (category === 'overall') return filtered.slice().sort((a, b) => (b.overall || 0) - (a.overall || 0));
    return filtered.slice().sort((a, b) => {
      const sa = a.sources ? Object.values(a.sources).reduce((acc, s) => acc + (s[category] || 0), 0) / Object.values(a.sources).length : 0;
      const sb = b.sources ? Object.values(b.sources).reduce((acc, s) => acc + (s[category] || 0), 0) / Object.values(b.sources).length : 0;
      return sb - sa;
    });
  }, [movies, category, search]);

  const top = ranked[0];
  const openMovie = movies.find(m => m.id === openId);

  return (
    <>
      <Header user={user} onUser={setUser} search={search} setSearch={setSearch} />

      <main className="max-w-7xl mx-auto px-4 md:px-8 py-6 md:py-10 space-y-8">
        {error && (
          <div className="rounded-2xl p-4 glass border border-red-500/40">
            <div className="font-bold mb-1">Backend unreachable</div>
            <div className="text-sm text-white/70">{error}</div>
            <div className="text-xs text-white/50 mt-2">
              Make sure the server is running (<code>cd server && npm run dev</code>) and your env vars are set.
            </div>
          </div>
        )}

        {top && (
          <section className="rounded-3xl p-6 md:p-8 glass-strong">
            <div className="grid md:grid-cols-[200px_1fr] gap-6 items-center">
              <div className="float w-44 mx-auto md:mx-0">
                {top.poster_url
                  ? <img src={top.poster_url} className="rounded-2xl w-full" alt="" />
                  : <div className="aspect-[2/3] rounded-2xl bg-gradient-to-br from-pink-500 to-purple-600" />}
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.25em] gradient-text font-bold mb-1">Today's top pick</div>
                <h2 className="text-3xl md:text-4xl font-extrabold">{top.title}</h2>
                <p className="text-white/85 mt-3 max-w-xl leading-relaxed">{top.overview}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {CATEGORIES.map(c => {
                    const v = top.sources ? Object.values(top.sources).reduce((acc, s) => acc + (s[c] || 0), 0) / Object.values(top.sources).length : 0;
                    return (
                      <div key={c} className="px-3 py-1 rounded-full glass text-xs font-semibold flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ background: CATEGORY_COLORS[c] }} />
                        <span>{CATEGORY_LABELS[c]}</span>
                        <span>{v.toFixed(1)}</span>
                      </div>
                    );
                  })}
                </div>
                <button onClick={() => setOpenId(top.id)}
                        className="mt-5 px-5 py-2.5 rounded-full font-bold text-sm"
                        style={{ background: 'linear-gradient(135deg,#ffd86b,#ff6bd4)', color: '#1a1230' }}>
                  See full breakdown →
                </button>
              </div>
            </div>
          </section>
        )}

        <section>
          <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
            <h2 className="text-2xl md:text-3xl font-extrabold">
              Top 50, ranked by <span className="gradient-text">{category === 'overall' ? 'Overall' : CATEGORY_LABELS[category]}</span>
            </h2>
            <div className="scroll-tabs sm:flex-wrap sm:overflow-visible">
              {['overall', ...CATEGORIES].map(c => (
                <button key={c} onClick={() => setCategory(c)}
                        className={`px-4 py-2 rounded-full font-semibold text-sm whitespace-nowrap ${category === c ? 'scale-105 shadow-lg' : 'glass'}`}
                        style={category === c ? { background: CATEGORY_COLORS[c] || CATEGORY_COLORS.overall, color:'#1a1230' } : {}}>
                  {c === 'overall' ? '✨ Overall' : `${CATEGORY_ICONS[c]} ${CATEGORY_LABELS[c]}`}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="text-center text-white/60 py-12">Loading top 50…</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-4">
              {ranked.map((m, i) => (
                <MovieCard key={m.id} movie={m} rank={i + 1} category={category}
                           userRating={ratings[m.id]}
                           onClick={() => setOpenId(m.id)} />
              ))}
            </div>
          )}
        </section>

        <footer className="text-center text-xs text-white/50 pt-4 pb-10">
          CineBoost · React + Vite + Tailwind on the front, Express + SQLite on the back.
        </footer>
      </main>

      {openMovie && (
        <MovieDetail movie={openMovie}
                     user={user}
                     userRating={ratings[openMovie.id]}
                     onClose={() => setOpenId(null)}
                     onUpdated={loadAll} />
      )}
    </>
  );
}
