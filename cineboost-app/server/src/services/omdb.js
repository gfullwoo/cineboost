// OMDb is the cheapest legal way to get IMDb ratings + Rotten Tomatoes + Metacritic
// from one endpoint. Free tier gives 1000 calls/day. https://www.omdbapi.com
import fetch from 'node-fetch';

const BASE = 'http://www.omdbapi.com/';

export async function lookupByTitle(title, year) {
  const key = process.env.OMDB_KEY;
  if (!key) return null;
  const params = new URLSearchParams({ apikey: key, t: title });
  if (year) params.set('y', String(year));
  const res = await fetch(`${BASE}?${params}`);
  if (!res.ok) return null;
  const data = await res.json();
  if (data.Response !== 'True') return null;
  // Normalize ratings
  const ratings = {};
  for (const r of data.Ratings || []) {
    if (r.Source === 'Internet Movie Database') ratings.imdb = parseFloat(r.Value); // "8.1/10"
    else if (r.Source === 'Rotten Tomatoes')   ratings.rt   = parseInt(r.Value, 10) / 10; // "78%" → 7.8
    else if (r.Source === 'Metacritic')         ratings.metacritic = parseInt(r.Value, 10) / 10; // "78/100" → 7.8
  }
  if (!ratings.imdb && data.imdbRating && data.imdbRating !== 'N/A') ratings.imdb = parseFloat(data.imdbRating);
  return {
    imdbID: data.imdbID,
    plot: data.Plot,
    genre: data.Genre,
    director: data.Director,
    actors: data.Actors,
    ratings
  };
}
