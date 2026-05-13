import { cached } from './cache';

const API_KEY = import.meta.env.VITE_TMDB_API_KEY;
const BASE    = 'https://api.themoviedb.org/3';

// w342 for list thumbnails (was w500 — ~60% smaller files, same perceived quality in a row)
const IMG     = 'https://image.tmdb.org/t/p/w342';
const IMG_BIG = 'https://image.tmdb.org/t/p/w1280';
const IMG_SM  = 'https://image.tmdb.org/t/p/w342';

async function tmdb(endpoint) {
  const separator = endpoint.includes('?') ? '&' : '?';
  const url       = `${BASE}${endpoint}${separator}api_key=${API_KEY}`;
  const parsedUrl = new URL(url, BASE);

  if (parsedUrl.hostname !== 'api.themoviedb.org') {
    throw new Error('Invalid API request origin.');
  }

  const res = await fetch(parsedUrl.href);
  if (!res.ok) throw new Error(`TMDB error: ${res.status}`);
  return res.json();
}

// TTLs
const LIST_TTL   = 60 * 60 * 1000;  // 1 hour — trending/top-rated lists
const DETAIL_TTL = 60 * 60 * 1000;  // 1 hour — movie/show detail pages
const SEARCH_TTL = 5  * 60 * 1000;  // 5 min  — search results

// ─────────────────────────────────────────────────────────────
// DISCOVERY / LISTS
// ─────────────────────────────────────────────────────────────

export async function fetchTrendingMovies() {
  return cached('tmdb:trending:movies', async () => {
    const d = await tmdb('/trending/movie/week');
    return d.results.map(m => ({
      media_type:  'movie',
      external_id: m.id,
      title:       m.title,
      cover_url:   m.poster_path ? IMG + m.poster_path : null,
      year:        m.release_date?.split('-')[0] ?? null,
    }));
  }, { ttl: LIST_TTL });
}

export async function fetchTrendingShows() {
  return cached('tmdb:trending:shows', async () => {
    const d = await tmdb('/trending/tv/week');
    return d.results.map(s => ({
      media_type:  'show',
      external_id: s.id,
      title:       s.name,
      cover_url:   s.poster_path ? IMG + s.poster_path : null,
      year:        s.first_air_date?.split('-')[0] ?? null,
    }));
  }, { ttl: LIST_TTL });
}

export async function fetchTopRatedMovies() {
  return cached('tmdb:top_rated:movies', async () => {
    const d = await tmdb('/movie/top_rated');
    return d.results.map(m => ({
      media_type:  'movie',
      external_id: m.id,
      title:       m.title,
      cover_url:   m.poster_path ? IMG + m.poster_path : null,
      year:        m.release_date?.split('-')[0] ?? null,
    }));
  }, { ttl: LIST_TTL });
}

export async function fetchTopRatedShows() {
  return cached('tmdb:top_rated:shows', async () => {
    const d = await tmdb('/tv/top_rated');
    return d.results.map(s => ({
      media_type:  'show',
      external_id: s.id,
      title:       s.name,
      cover_url:   s.poster_path ? IMG + s.poster_path : null,
      year:        s.first_air_date?.split('-')[0] ?? null,
    }));
  }, { ttl: LIST_TTL });
}

// ─────────────────────────────────────────────────────────────
// SEARCH
// ─────────────────────────────────────────────────────────────

export async function searchTMDB(query) {
  if (!query) return [];
  const d = await tmdb(`/search/multi?query=${encodeURIComponent(query)}`);
  return d.results
    .filter(item => item.media_type === 'movie' || item.media_type === 'tv')
    .map(item => ({
      media_type:  item.media_type === 'tv' ? 'show' : 'movie',
      external_id: item.id,
      title:       item.title || item.name,
      cover_url:   item.poster_path ? IMG + item.poster_path : null,
      year:        (item.release_date || item.first_air_date)?.split('-')[0] ?? null,
      overview:    item.overview,
    }));
}

export async function searchMovies(query) {
  if (!query) return [];
  return cached(`tmdb:search:movies:${query.toLowerCase()}`, async () => {
    const d = await tmdb(`/search/movie?query=${encodeURIComponent(query)}`);
    return d.results.map(m => ({
      media_type:  'movie',
      external_id: m.id,
      title:       m.title,
      cover_url:   m.poster_path ? IMG + m.poster_path : null,
      year:        m.release_date?.split('-')[0] ?? null,
      overview:    m.overview,
    }));
  }, { ttl: SEARCH_TTL });
}

export async function searchShows(query) {
  if (!query) return [];
  return cached(`tmdb:search:shows:${query.toLowerCase()}`, async () => {
    const d = await tmdb(`/search/tv?query=${encodeURIComponent(query)}`);
    return d.results.map(s => ({
      media_type:  'show',
      external_id: s.id,
      title:       s.name,
      cover_url:   s.poster_path ? IMG + s.poster_path : null,
      year:        s.first_air_date?.split('-')[0] ?? null,
      overview:    s.overview,
    }));
  }, { ttl: SEARCH_TTL });
}

// ─────────────────────────────────────────────────────────────
// DETAILS
// ─────────────────────────────────────────────────────────────

export async function fetchMovieDetails(id) {
  return cached(`tmdb:movie:${id}`, async () => {
    const d = await tmdb(`/movie/${id}?append_to_response=credits,keywords,release_dates`);
    return {
      overview:             d.overview,
      backdrop_url:         d.backdrop_path ? IMG_BIG + d.backdrop_path : null,
      runtime:              d.runtime,
      budget:               d.budget,
      revenue:              d.revenue,
      tagline:              d.tagline,
      status:               d.status,
      original_language:    d.original_language,
      release_date:         d.release_date,
      genres:               d.genres?.map(g => g.name) || [],
      production_companies: d.production_companies?.map(c => c.name) || [],
      keywords:             d.keywords?.keywords?.map(k => k.name) || [],
      director:             d.credits?.crew?.find(c => c.job === 'Director')?.name,
      writers:              d.credits?.crew?.filter(c => ['Screenplay', 'Writer'].includes(c.job)).map(w => w.name) || [],
      cast:                 (d.credits?.cast || []).slice(0, 10).map(c => ({
        id:           c.id,
        name:         c.name,
        character:    c.character,
        profile_path: c.profile_path,
      })),
    };
  }, { ttl: DETAIL_TTL });
}

export async function fetchShowDetails(id) {
  return cached(`tmdb:show:${id}`, async () => {
    const d = await tmdb(`/tv/${id}?append_to_response=credits,keywords`);
    return {
      overview:          d.overview,
      backdrop_url:      d.backdrop_path ? IMG_BIG + d.backdrop_path : null,
      episode_runtime:   d.episode_run_time?.[0] || null,
      first_air_date:    d.first_air_date,
      last_air_date:     d.last_air_date,
      status:            d.status,
      original_language: d.original_language,
      genres:            d.genres?.map(g => g.name) || [],
      networks:          d.networks?.map(n => n.name) || [],
      keywords:          d.keywords?.results?.map(k => k.name) || [],
      seasons:           d.seasons || [],
      creators:          d.created_by?.map(c => c.name) || [],
      cast:              (d.credits?.cast || []).slice(0, 10).map(c => ({
        id:           c.id,
        name:         c.name,
        character:    c.character,
        profile_path: c.profile_path,
      })),
    };
  }, { ttl: DETAIL_TTL });
}

export async function fetchSeasonDetails(showId, seasonNumber) {
  return cached(`tmdb:season:${showId}:${seasonNumber}`, async () => {
    const d = await tmdb(`/tv/${showId}/season/${seasonNumber}?language=en-US`);
    return {
      overview:      d.overview      || null,
      cover_url:     d.poster_path   ? `${IMG_SM}${d.poster_path}` : null,
      air_date:      d.air_date      || null,
      season_number: d.season_number,
      episodes:      d.episodes      || [],
    };
  }, { ttl: DETAIL_TTL });
}

export async function fetchEpisodeDetails(showId, seasonNumber, episodeNumber) {
  return cached(`tmdb:episode:${showId}:${seasonNumber}:${episodeNumber}`, async () => {
    const d = await tmdb(
      `/tv/${showId}/season/${seasonNumber}/episode/${episodeNumber}?language=en-US&append_to_response=credits`
    );
    return {
      overview:       d.overview       || null,
      cover_url:      d.still_path ? `https://image.tmdb.org/t/p/w300${d.still_path}` : null,
      backdrop_url:   d.still_path ? `https://image.tmdb.org/t/p/w780${d.still_path}` : null,
      air_date:       d.air_date       || null,
      runtime:        d.runtime        || null,
      season_number:  d.season_number,
      episode_number: d.episode_number,
      guest_stars: (d.credits?.guest_stars || d.guest_stars || []).slice(0, 12).map(g => ({
        id:           g.id,
        name:         g.name,
        character:    g.character,
        profile_path: g.profile_path,
      })),
      crew: (d.credits?.crew || d.crew || [])
        .filter(c => ['Director', 'Writer', 'Story'].includes(c.job))
        .map(c => ({ name: c.name, job: c.job })),
    };
  }, { ttl: DETAIL_TTL });
}
