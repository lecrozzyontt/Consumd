import { supabase } from './supabase';
import { cached } from './cache';

const TMDB_KEY = import.meta.env.VITE_TMDB_API_KEY;
const TMDB     = 'https://api.themoviedb.org/3';
const IMG      = 'https://image.tmdb.org/t/p/w342';
const STILL    = 'https://image.tmdb.org/t/p/w300';

async function tmdbFetch(path) {
  const sep = path.includes('?') ? '&' : '?';
  const url = new URL(`${TMDB}${path}${sep}api_key=${TMDB_KEY}`);
  if (url.hostname !== 'api.themoviedb.org') throw new Error('Invalid URL');
  const res = await fetch(url.href);
  if (!res.ok) throw new Error(`TMDB ${res.status}`);
  return res.json();
}

/**
 * Parse season + episode numbers from an episode external_id.
 * Format: "{showId}_s{season}_e{episode}"
 * Returns { season, episode } or null.
 */
function parseEpisodeId(externalId) {
  const match = String(externalId).match(/_s(\d+)_e(\d+)$/);
  if (!match) return null;
  return { season: parseInt(match[1]), episode: parseInt(match[2]) };
}

/**
 * For a given show (external_id), fetch all its season episode counts
 * so we know when to roll over to the next season.
 */
async function getSeasonEpisodeCounts(showId) {
  return cached(`tmdb:show:seasons:${showId}`, async () => {
    const d = await tmdbFetch(`/tv/${showId}`);
    // Map season_number → episode_count
    const counts = {};
    for (const s of d.seasons || []) {
      if (s.season_number > 0) counts[s.season_number] = s.episode_count;
    }
    return { counts, totalSeasons: d.number_of_seasons || 0 };
  }, { ttl: 6 * 60 * 60 * 1000 }); // 6 hours
}

/**
 * Fetch basic info for a specific episode (for the card thumbnail).
 */
async function getEpisodeInfo(showId, season, episode) {
  return cached(`tmdb:ep:${showId}:${season}:${episode}`, async () => {
    try {
      const d = await tmdbFetch(`/tv/${showId}/season/${season}/episode/${episode}`);
      return {
        name:           d.name || `Episode ${episode}`,
        still_path:     d.still_path || null,
        air_date:       d.air_date   || null,
        overview:       d.overview   || null,
        season_number:  d.season_number,
        episode_number: d.episode_number,
      };
    } catch {
      return null;
    }
  }, { ttl: 6 * 60 * 60 * 1000 });
}

/**
 * Main export.
 * Returns an array of media-shaped objects ready for CategoryRow.
 * Each item navigates to the episode detail page when clicked.
 */
export async function fetchNextEpisodes(userId) {
  // ── 1. Get in-progress shows ─────────────────────────────────
  const { data: showLogs, error: showError } = await supabase
    .from('logs')
    .select('id, title, media_type, external_id, cover_url, genre, creator')
    .eq('user_id', userId)
    .eq('media_type', 'show')
    .eq('status', 'in_progress');

  if (showError || !showLogs?.length) return [];

  // ── 2. Get all episode logs for this user ────────────────────
  const { data: epLogs } = await supabase
    .from('logs')
    .select('external_id')
    .eq('user_id', userId)
    .eq('media_type', 'episode');

  // Map: showId → { season, episode } of the LAST watched episode
  const lastWatched = {};

  for (const log of epLogs || []) {
    const parsed = parseEpisodeId(log.external_id);
    if (!parsed) continue;

    // Extract show ID from episode external_id: "{showId}_s{s}_e{e}"
    const showId = String(log.external_id).replace(/_s\d+_e\d+$/, '');
    const prev   = lastWatched[showId];

    if (
      !prev ||
      parsed.season > prev.season ||
      (parsed.season === prev.season && parsed.episode > prev.episode)
    ) {
      lastWatched[showId] = parsed;
    }
  }

  // ── 3. Determine next episode for each show ──────────────────
  const nextEpisodes = await Promise.allSettled(
    showLogs.map(async (showLog) => {
      const showId = String(showLog.external_id);
      const last   = lastWatched[showId];

      let nextSeason, nextEpisode;

      if (!last) {
        // No episodes logged at all → start from S01E01
        nextSeason  = 1;
        nextEpisode = 1;
      } else {
        // Check if there are more episodes in the current season
        const { counts, totalSeasons } = await getSeasonEpisodeCounts(showId);
        const epCountInSeason = counts[last.season] || 0;

        if (last.episode < epCountInSeason) {
          // Next episode in same season
          nextSeason  = last.season;
          nextEpisode = last.episode + 1;
        } else if (last.season < totalSeasons) {
          // Roll over to next season ep 1
          nextSeason  = last.season + 1;
          nextEpisode = 1;
        } else {
          // Finished the show
          return null;
        }
      }

      // ── 4. Fetch episode info for thumbnail ─────────────────
      const epInfo = await getEpisodeInfo(showId, nextSeason, nextEpisode);

      const episodeCode = `S${String(nextSeason).padStart(2, '0')}E${String(nextEpisode).padStart(2, '0')}`;
      const epTitle     = epInfo?.name || `Episode ${nextEpisode}`;

      // Build a media-shaped object CategoryRow / MediaCard can render
      return {
        // Navigation: clicking goes to episode detail page
        media_type:       'episode',
        external_id:      `${showId}_s${nextSeason}_e${nextEpisode}`,
        show_external_id: showId,
        show_title:       showLog.title,
        season_number:    nextSeason,
        episode_number:   nextEpisode,

        // Display fields
        title:      `${episodeCode} · ${showLog.title}`,
        subtitle:   epTitle,
        cover_url:  epInfo?.still_path
          ? STILL + epInfo.still_path
          : showLog.cover_url,   // fall back to show poster
        year:       epInfo?.air_date?.split('-')[0] || showLog.year || '',
        creator:    showLog.creator || '',
        genre:      showLog.genre   || '',
        overview:   epInfo?.overview || '',

        // Badge shown on card
        episode_badge: episodeCode,
      };
    })
  );

  return nextEpisodes
    .filter(r => r.status === 'fulfilled' && r.value !== null)
    .map(r => r.value);
}
