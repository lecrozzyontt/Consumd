import { cached } from './cache';

const BASE = 'https://openlibrary.org';

/* -----------------------------------------
   Fetch with timeout helper
------------------------------------------ */
async function fetchWithTimeout(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/* -----------------------------------------
   Normalize book format
------------------------------------------ */
function formatBook(item) {
  const coverId = item.cover_i;
  const title   = item.title || '';

  return {
    id:          `book_${item.key?.replace('/works/', '') || Math.random()}`,
    external_id: item.key,
    title,
    media_type:  'book',
    creator:     item.author_name?.[0] || '',
    year:        String(item.first_publish_year || ''),
    cover_url:   coverId
      ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg`
      : title
        ? `https://covers.openlibrary.org/b/title/${encodeURIComponent(title)}-M.jpg`
        : null,
    genre:       item.subject?.slice(0, 3).join(', ') || '',
    rating_avg:  null,
  };
}

/* -----------------------------------------
   TTL settings
------------------------------------------ */
const TRENDING_TTL = 30 * 60 * 1000;
const SEARCH_TTL   = 5  * 60 * 1000;
const DETAIL_TTL   = 60 * 60 * 1000;

/* -----------------------------------------
   Trending books — with fallback endpoint
------------------------------------------ */
export async function fetchTrendingBooks() {
  return cached('ol:trending', async () => {
    // Primary: weekly trending
    try {
      console.log('[OpenLibrary] Fetching trending books...');
      const res = await fetchWithTimeout(`${BASE}/trending/weekly.json?limit=20`);

      if (!res.ok) {
        console.warn(`[OpenLibrary] Trending endpoint returned ${res.status}, trying fallback...`);
        throw new Error(`HTTP ${res.status}`);
      }

      const data  = await res.json();
      const works = data.works || [];
      console.log(`[OpenLibrary] Trending response: ${works.length} works`);

      const books = works.map(formatBook).filter(b => b.title);
      console.log(`[OpenLibrary] Returning ${books.length} trending books`);
      return books;

    } catch (primaryErr) {
      console.error('[OpenLibrary] Primary trending fetch failed:', primaryErr);

      // Fallback: popular fiction via search API
      try {
        console.log('[OpenLibrary] Trying fallback search endpoint...');
        const res = await fetchWithTimeout(
          `${BASE}/search.json?q=bestseller&sort=rating&limit=20&fields=key,title,author_name,cover_i,first_publish_year,subject`
        );

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data  = await res.json();
        const docs  = data.docs || [];
        console.log(`[OpenLibrary] Fallback response: ${docs.length} books`);

        const books = docs.map(formatBook).filter(b => b.title);
        console.log(`[OpenLibrary] Returning ${books.length} fallback books`);
        return books;

      } catch (fallbackErr) {
        console.error('[OpenLibrary] Fallback also failed:', fallbackErr);
        return [];
      }
    }
  }, { ttl: TRENDING_TTL });
}

/* -----------------------------------------
   Top rated books
------------------------------------------ */
export async function fetchTopRatedBooks() {
  return cached('ol:top_rated', async () => {
    try {
      console.log('[OpenLibrary] Fetching top rated books...');
      const res = await fetchWithTimeout(
        `${BASE}/search.json?q=subject:fiction&sort=rating&limit=20`
      );

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data  = await res.json();
      const books = (data.docs || []).map(formatBook).filter(b => b.title);
      console.log(`[OpenLibrary] Top rated: ${books.length} books`);
      return books;

    } catch (err) {
      console.error('[OpenLibrary] fetchTopRatedBooks failed:', err);
      return [];
    }
  }, { ttl: TRENDING_TTL });
}

/* -----------------------------------------
   Search books
------------------------------------------ */
export async function searchBooks(query) {
  if (!query.trim()) return [];

  return cached(`ol:search:${query.toLowerCase()}`, async () => {
    try {
      const res = await fetchWithTimeout(
        `${BASE}/search.json?q=${encodeURIComponent(query)}&limit=20`
      );

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      return (data.docs || []).map(formatBook).filter(b => b.title);

    } catch (err) {
      console.error('[OpenLibrary] searchBooks failed:', err);
      return [];
    }
  }, { ttl: SEARCH_TTL });
}

/* -----------------------------------------
   Book details (deep fetch)
------------------------------------------ */
export async function fetchBookDetails(workKey) {
  return cached(`ol:book:${workKey}`, async () => {
    try {
      const cleanKey = workKey.startsWith('/')
        ? workKey
        : `/${workKey}`;

      const [workRes, ratingsRes] = await Promise.all([
        fetchWithTimeout(`${BASE}${cleanKey}.json`),
        fetchWithTimeout(`${BASE}${cleanKey}/ratings.json`),
      ]);

      const work    = await workRes.json();
      const ratings = ratingsRes.ok ? await ratingsRes.json() : null;

      let authors = [];

      if (work.authors?.length) {
        const authorFetches = work.authors
          .slice(0, 3)
          .map(a => {
            const key = a.author?.key || a.key;
            return key
              ? fetchWithTimeout(`${BASE}${key}.json`)
                  .then(r => r.json())
                  .catch(() => null)
              : null;
          });

        const authorData = await Promise.all(authorFetches);

        authors = authorData
          .filter(Boolean)
          .map(a => ({
            name:  a.name || '',
            bio:   typeof a.bio === 'string' ? a.bio : (a.bio?.value || ''),
            photo: a.photos?.[0]
              ? `https://covers.openlibrary.org/a/id/${a.photos[0]}-M.jpg`
              : null,
          }));
      }

      const overview = typeof work.description === 'string'
        ? work.description
        : (work.description?.value || '');

      const coverId   = work.covers?.[0];
      const title     = work.title || '';
      const cover_url = coverId
        ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg`
        : title
          ? `https://covers.openlibrary.org/b/title/${encodeURIComponent(title)}-L.jpg`
          : null;

      const subjects = work.subjects || [];

      return {
        id:           `book_${cleanKey.replace('/works/', '')}`,
        external_id:  cleanKey,
        title,
        media_type:   'book',
        cover_url,
        backdrop_url: cover_url,
        overview,
        year:         work.first_publish_date || '',
        genres:       subjects.slice(0, 6),
        keywords:     subjects.slice(0, 12),
        authors,
        creator:      authors[0]?.name || '',
        rating_avg:   ratings?.summary?.average?.toFixed(1) || null,
        vote_count:   ratings?.summary?.count || 0,
        subjects:     subjects.slice(0, 20),
      };

    } catch (e) {
      console.error('[OpenLibrary] fetchBookDetails failed:', e);
      return null;
    }
  }, { ttl: DETAIL_TTL });
}
