import { CATEGORY_COLORS, CATEGORY_LABELS } from '../lib/constants.js';

function PosterArt({ movie }) {
  if (movie.poster_url) {
    return (
      <div className="relative overflow-hidden rounded-2xl aspect-[2/3]">
        <img src={movie.poster_url} alt={movie.title} loading="lazy" className="w-full h-full object-cover" />
      </div>
    );
  }
  return (
    <div className="relative overflow-hidden rounded-2xl aspect-[2/3] bg-gradient-to-br from-pink-500 to-purple-600 flex flex-col justify-end p-3">
      <div className="text-base font-extrabold drop-shadow">{movie.title}</div>
    </div>
  );
}

export default function MovieCard({ movie, rank, category, onClick, userRating }) {
  const isOverall = category === 'overall';
  const score = isOverall
    ? movie.overall
    : (movie.sources
        ? Object.values(movie.sources).reduce((a, s) => a + (s[category] ?? 0), 0) / Object.keys(movie.sources).length
        : 0);
  const c = CATEGORY_COLORS[category] || CATEGORY_COLORS.overall;
  return (
    <button onClick={onClick}
            className="text-left rounded-2xl overflow-hidden hover:scale-[1.025] transition-transform focus:outline-none focus:ring-2 focus:ring-pink-400">
      <div className="relative">
        <PosterArt movie={movie} />
        <div className="absolute top-2 left-2 px-2 py-1 rounded-lg glass-strong text-[11px] font-bold">
          <span style={{ color: c }}>#{rank}</span>{' '}
          <span className="opacity-70">{isOverall ? 'Overall' : CATEGORY_LABELS[category]}</span>
        </div>
        <div className="absolute top-2 right-2 px-2 py-1 rounded-lg font-bold text-xs"
             style={{ background: c, color: '#1a1230' }}>
          {(score || 0).toFixed(1)}
        </div>
        {userRating && (
          <div className="absolute bottom-2 right-2 px-2 py-1 rounded-lg glass-strong text-[10px] font-semibold">
            ⭐ You: {userRating.overall.toFixed(1)}
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
      </div>
      <div className="px-3 py-2.5 bg-white/5">
        <div className="font-semibold truncate text-sm">{movie.title}</div>
        <div className="text-[11px] text-white/60">{movie.year}</div>
      </div>
    </button>
  );
}
