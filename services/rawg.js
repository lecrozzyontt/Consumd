import { cached } from './cache';

const RAWG_KEY = import.meta.env.VITE_RAWG_API_KEY;
const BASE     = 'https://api.rawg.io/api';

async function rawg(path) {
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(`${BASE}${path}${sep}key=${RAWG_KEY}`);
  if (!res.ok) throw new Error(`RAWG error: ${res.status}`);
  return res.json();
}

function formatGame(item) {
  return {
    id:          `game_${item.id}`,
    external_id: String(item.id),
    title:       item.name,
    media_type:  'game',
    creator:     item.developers?.[0]?.name || '',
    year:        item.released?.slice(0, 4) || '',
    cover_url:   item.background_image || null,
    genre:       item.genres?.map(g => g.name).join(', ') || '',
    rating_avg:  item.rating?.toFixed(1),
  };
}

const TRENDING_TTL = 30 * 60 * 1000;
const SEARCH_TTL   = 5  * 60 * 1000;
const DETAIL_TTL   = 60 * 60 * 1000;

export async function fetchTrendingGames() {
  return cached('rawg:trending', async () => {
    try {
      const data = await rawg('/games?ordering=-added&page_size=20');
      return data.results.map(formatGame);
    } catch { return []; }
  }, { ttl: TRENDING_TTL });
}

export async function fetchTopRatedGames() {
  return cached('rawg:top_rated', async () => {
    try {
      const data = await rawg('/games?ordering=-rating&page_size=20');
      return data.results.map(formatGame);
    } catch { return []; }
  }, { ttl: TRENDING_TTL });
}

export async function searchGames(query) {
  if (!query.trim()) return [];
  return cached(`rawg:search:${query.toLowerCase()}`, async () => {
    try {
      const data = await rawg(`/games?search=${encodeURIComponent(query)}&page_size=20`);
      return data.results.map(formatGame);
    } catch { return []; }
  }, { ttl: SEARCH_TTL });
}

export async function fetchGameDetails(id) {
  return cached(`rawg:game:${id}`, async () => {
    try {
      const [data, screenshots] = await Promise.all([
        rawg(`/games/${id}`),
        rawg(`/games/${id}/screenshots`),
      ]);

      // Strip HTML tags from description
      const description = data.description
        ? data.description.replace(/<[^>]*>/g, '').replace(/\n{3,}/g, '\n\n').trim()
        : '';

      return {
        id:            `game_${data.id}`,
        external_id:   String(data.id),
        title:         data.name,
        media_type:    'game',
        cover_url:     data.background_image || null,
        backdrop_url:  screenshots?.results?.[0]?.image || data.background_image || null,
        overview:      description,
        genres:        data.genres?.map(g => g.name) || [],
        keywords:      data.tags?.filter(t => t.language === 'eng').map(t => t.name).slice(0, 12) || [],
        year:          data.released?.slice(0, 4) || '',
        release_date:  data.released || '',
        rating_avg:    data.rating?.toFixed(1),
        metacritic:    data.metacritic || null,
        playtime:      data.playtime || null,
        platforms:     data.platforms?.map(p => p.platform.name) || [],
        developers:    data.developers?.map(d => d.name) || [],
        publishers:    data.publishers?.map(p => p.name) || [],
        creator:       data.developers?.[0]?.name || '',
        esrb:          data.esrb_rating?.name || null,
        website:       data.website || null,
        screenshots:   screenshots?.results?.slice(0, 6).map(s => s.image) || [],
      };
    } catch (e) { console.error(e); return null; }
  }, { ttl: DETAIL_TTL });
  const finalUrl = new URL(`${BASE}${path}${sep}key=${RAWG_KEY}`, BASE);
  if (finalUrl.hostname !== 'api.rawg.io') throw new Error('Invalid URL');
  const res = await fetch(finalUrl.href);
}