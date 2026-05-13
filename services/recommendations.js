import { cached } from './cache';
import { supabase } from './supabase';

const TMDB_KEY = import.meta.env.VITE_TMDB_API_KEY;
const TMDB     = 'https://api.themoviedb.org/3';
const RAWG_KEY = import.meta.env.VITE_RAWG_API_KEY;
const RAWG     = 'https://api.rawg.io/api';
const IMG      = 'https://image.tmdb.org/t/p/w342';

// TMDB genre name → ID map (stable, never changes)
const TMDB_MOVIE_GENRES = {
  'action': 28, 'adventure': 12, 'animation': 16, 'comedy': 35,
  'crime': 80, 'documentary': 99, 'drama': 18, 'family': 10751,
  'fantasy': 14, 'history': 36, 'horror': 27, 'music': 10402,
  'mystery': 9648, 'romance': 10749, 'science fiction': 878,
  'sci-fi': 878, 'thriller': 53, 'war': 10752, 'western': 37,
};

const TMDB_TV_GENRES = {
  'action': 10759, 'adventure': 10759, 'animation': 16, 'comedy': 35,
  'crime': 80, 'documentary': 99, 'drama': 18, 'family': 10751,
  'kids': 10762, 'mystery': 9648, 'news': 10763, 'reality': 10764,
  'sci-fi': 10765, 'science fiction': 10765, 'fantasy': 10765,
  'soap': 10766, 'talk': 10767, 'war': 10768, 'western': 10768,
};

async function tmdbFetch(path) {
  const sep = path.includes('?') ? '&' : '?';
  const url = new URL(`${TMDB}${path}${sep}api_key=${TMDB_KEY}`);
  if (url.hostname !== 'api.themoviedb.org') throw new Error('Invalid URL');
  const res = await fetch(url.href);
  if (!res.ok) throw new Error(`TMDB ${res.status}`);
  return res.json();
}

async function rawgFetch(path) {
  const sep = path.includes('?') ? '&' : '?';
  const url = new URL(`${RAWG}${path}${sep}key=${RAWG_KEY}`);
  if (url.hostname !== 'api.rawg.io') throw new Error('Invalid URL');
  const res = await fetch(url.href);
  if (!res.ok) throw new Error(`RAWG ${res.status}`);
  return res.json();
}

/**
 * Main export — call with the current user's ID.
 * Returns { movies, shows, books, games } each an array of media objects,
 * or empty arrays if the user hasn't rated enough content yet.
 */
export async function fetchRecommendations(userId) {
  // Bumped to v5 to bypass old cached recommendations immediately
  const cacheKey = `recs_v5:${userId}`;
  return cached(cacheKey, async () => {
    // ── 1. Fetch ALL user's logs (watched, watching, watchlist) ──
    const { data: allLogs, error } = await supabase
      .from('logs')
      .select('title, media_type, genre, external_id, rating')
      .eq('user_id', userId);

    if (error || !allLogs?.length) return { movies: [], shows: [], books: [], games: [] };

    // Exclude EVERYTHING the user has interacted with
    const loggedIds = new Set(allLogs.map(l => String(l.external_id)));

    // ── 2. Build genre preference maps per type ONLY from high ratings
    const genreScores = { movie: {}, show: {}, book: {}, game: {} };
    let hasHighRatings = false;

    for (const log of allLogs) {
      // Only base preferences on items rated > 2.5
      if (!log.rating || log.rating <= 2.5) continue;
      
      hasHighRatings = true;
      const typeStr = (log.media_type || '').toLowerCase();
      const type = typeStr === 'season' || typeStr === 'episode' ? 'show' : typeStr;
      const weight = log.rating; 
      if (!genreScores[type]) continue;

      const genres = (log.genre || '').split(',').map(g => g.trim().toLowerCase()).filter(Boolean);
      for (const g of genres) {
        genreScores[type][g] = (genreScores[type][g] || 0) + weight;
      }
    }
    
    // If the user hasn't rated anything highly yet, return empty
    if (!hasHighRatings) return { movies: [], shows: [], books: [], games: [] };

    // Top 3 genres by score for each type
    const topGenres = (type) =>
      Object.entries(genreScores[type] || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([g]) => g);

    // ── 3. Fetch recommendations in parallel ─────────────────────
    const [movies, shows, books, games] = await Promise.allSettled([
      recommendMovies(topGenres('movie'), loggedIds),
      recommendShows(topGenres('show'),  loggedIds),
      recommendBooks(topGenres('book'),  loggedIds, allLogs.filter(l => l.media_type === 'book')),
      recommendGames(topGenres('game'),  loggedIds),
    ]);

    if (movies.status === 'rejected') console.error('Movie Recs Failed:', movies.reason);
    if (shows.status === 'rejected') console.error('Show Recs Failed:', shows.reason);
    if (books.status === 'rejected') console.error('Book Recs Failed:', books.reason);
    if (games.status === 'rejected') console.error('Game Recs Failed:', games.reason);

    return {
      movies: movies.status === 'fulfilled' ? movies.value : [],
      shows:  shows.status  === 'fulfilled' ? shows.value  : [],
      books:  books.status  === 'fulfilled' ? books.value  : [],
      games:  games.status  === 'fulfilled' ? games.value  : [],
    };
  }, { ttl: 30 * 60 * 1000 }); // refresh every 30 min
}

// ── Movie recommendations ────────────────────────────────────────
async function recommendMovies(genres, loggedIds) {
  const genreIds = genres
    .map(g => TMDB_MOVIE_GENRES[g])
    .filter(Boolean)
    .join(',');

  const path = genreIds
    ? `/discover/movie?sort_by=vote_average.desc&vote_count.gte=500&with_genres=${genreIds}&language=en-US&page=1`
    : `/discover/movie?sort_by=vote_average.desc&vote_count.gte=1000&language=en-US&page=1`;

  const d = await tmdbFetch(path);
  return (d.results || [])
    .filter(m => !loggedIds.has(String(m.id)))
    .slice(0, 20)
    .map(m => ({
      media_type:  'movie',
      external_id: String(m.id),
      title:       m.title,
      cover_url:   m.poster_path ? IMG + m.poster_path : null,
      year:        m.release_date?.split('-')[0] ?? null,
      genre:       genres.length ? genres.join(', ') : 'Recommended',
    }));
}

// ── Show recommendations ─────────────────────────────────────────
async function recommendShows(genres, loggedIds) {
  const genreIds = genres
    .map(g => TMDB_TV_GENRES[g])
    .filter(Boolean)
    .join(',');

  const path = genreIds
    ? `/discover/tv?sort_by=vote_average.desc&vote_count.gte=300&with_genres=${genreIds}&language=en-US&page=1`
    : `/discover/tv?sort_by=vote_average.desc&vote_count.gte=500&language=en-US&page=1`;

  const d = await tmdbFetch(path);
  return (d.results || [])
    .filter(s => !loggedIds.has(String(s.id)))
    .slice(0, 20)
    .map(s => ({
      media_type:  'show',
      external_id: String(s.id),
      title:       s.name,
      cover_url:   s.poster_path ? IMG + s.poster_path : null,
      year:        s.first_air_date?.split('-')[0] ?? null,
      genre:       genres.length ? genres.join(', ') : 'Recommended',
    }));
}

// ── Book recommendations ─────────────────────────────────────────
async function recommendBooks(genres, loggedIds, bookLogs) {
  const subjects = genres.length
    ? genres.slice(0, 2).join('+')
    : 'fiction';

  const res  = await fetch(
    `https://openlibrary.org/search.json?q=subject:${encodeURIComponent(subjects)}&sort=rating&limit=30`
  );
  const data = await res.json();
  const loggedTitles = new Set(bookLogs.map(l => l.title?.toLowerCase()));

  return (data.docs || [])
    .filter(b => b.title && !loggedIds.has(b.key) && !loggedTitles.has(b.title?.toLowerCase()))
    .slice(0, 20)
    .map(b => {
      const coverId = b.cover_i;
      return {
        media_type:  'book',
        external_id: b.key,
        title:       b.title,
        cover_url:   coverId
          ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg`
          : `https://covers.openlibrary.org/b/title/${encodeURIComponent(b.title)}-M.jpg`,
        creator:     b.author_name?.[0] || '',
        year:        String(b.first_publish_year || ''),
        genre:       subjects,
      };
    });
}

// ── Game recommendations ─────────────────────────────────────────
async function recommendGames(genres, loggedIds) {
  const genreQuery = genres.length ? genres.join(',') : 'action';
  const data = await rawgFetch(
    `/games?genres=${encodeURIComponent(genreQuery)}&ordering=-rating&page_size=30`
  );

  return (data.results || [])
    .filter(g => !loggedIds.has(String(g.id)))
    .slice(0, 20)
    .map(g => ({
      media_type:  'game',
      external_id: String(g.id),
      title:       g.name,
      cover_url:   g.background_image || null,
      year:        g.released?.slice(0, 4) || '',
      genre:       genres.length ? genres.join(', ') : 'Recommended',
    }));
}