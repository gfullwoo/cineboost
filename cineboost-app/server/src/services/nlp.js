// Lightweight category-aware sentiment scoring.
// Approach: for each category, check if a comment mentions any category keywords;
// if so, score the surrounding window with a small AFINN-style lexicon and
// average across all category-mentioning comments.
//
// This is intentionally simple (no model deps). Swap in a real model
// (e.g. transformers / Cohere / OpenAI / a hosted classifier) inside `scoreCorpus`.

const CATEGORY_KEYWORDS = {
  story:      ['story', 'plot', 'script', 'writing', 'screenplay', 'narrative', 'pacing', 'twist', 'ending', 'dialogue'],
  effects:    ['effects', 'vfx', 'cgi', 'visuals', 'cinematography', 'shots', 'camera', 'practical effects', 'spectacle', 'set design'],
  soundtrack: ['soundtrack', 'score', 'music', 'songs', 'composer', 'theme', 'sound design', 'audio'],
  acting:     ['acting', 'performance', 'cast', 'actor', 'actress', 'chemistry', 'lead', 'supporting']
};

// tiny AFINN-style lexicon
const POS = ['amazing','great','brilliant','incredible','beautiful','stunning','perfect','love','loved','fantastic','masterpiece','best','strong','tight','excellent','phenomenal','awesome','memorable','epic','engaging','captivating','superb','outstanding'];
const NEG = ['bad','terrible','awful','boring','weak','flat','dull','wooden','forgettable','mid','meh','disappointing','generic','derivative','mess','muddled','convoluted','overlong','tedious','cringe','worst'];
const INTENS = ['really','very','so','quite','extremely','incredibly','absolutely'];

function scoreText(text) {
  // returns a number roughly in [-1, +1]
  const tokens = text.toLowerCase().match(/[a-z']+/g) || [];
  let pos = 0, neg = 0;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const intens = i > 0 && INTENS.includes(tokens[i - 1]) ? 1.5 : 1;
    const negated = i > 0 && (tokens[i - 1] === 'not' || tokens[i - 1] === 'no' || tokens[i - 1] === "n't");
    if (POS.includes(t)) {
      if (negated) neg += intens; else pos += intens;
    }
    if (NEG.includes(t)) {
      if (negated) pos += intens; else neg += intens;
    }
  }
  if (pos + neg === 0) return 0;
  return (pos - neg) / (pos + neg);
}

function categoryHit(text, cat) {
  const lower = text.toLowerCase();
  return CATEGORY_KEYWORDS[cat].some(k => lower.includes(k));
}

// Map [-1, +1] sentiment to a 1..10 score, anchored on a base (e.g. overall TMDB rating).
// If we have lots of category mentions, sentiment dominates; if few, base dominates.
function sentimentToScore(base, sentiment, mentions) {
  const confidence = Math.min(1, mentions / 8);
  // sentiment in [-1,1] → swing of ±2 around the base
  const adjusted = base + sentiment * 2 * confidence;
  return Math.max(1, Math.min(10, Math.round(adjusted * 10) / 10));
}

export function scoreCorpus(corpus, base = 7) {
  // corpus: [{ body, score }]
  const out = { story: null, effects: null, soundtrack: null, acting: null, sample_count: corpus.length };
  for (const cat of Object.keys(CATEGORY_KEYWORDS)) {
    let s = 0, n = 0;
    for (const c of corpus) {
      if (!categoryHit(c.body, cat)) continue;
      const w = Math.max(1, Math.log10(Math.max(1, c.score) + 1)); // weight by upvotes
      s += scoreText(c.body) * w;
      n += w;
    }
    const sentiment = n > 0 ? s / n : 0;
    out[cat] = sentimentToScore(base, sentiment, n);
  }
  return out;
}
