import { cached } from './cache';

const BASE = 'https://openlibrary.org';

/* -----------------------------------------
   Normalize book format
------------------------------------------ */
function formatBook(item) {
  const coverId = item.cover_i;

  return {
    id:          `book_${item.key?.replace('/works/', '')}`,
    external_id: item.key,
    title:       item.title,
    media_type:  'book',
    creator:     item.author_name?.[0] || '',
    year:        String(item.first_publish_year || ''),
    cover_url:   coverId
      ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg`
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
   Trending books
------------------------------------------ */
export async function fetchTrendingBooks() {
  return cached('ol:trending', async () => {
    try {
      const res = await fetch(`${BASE}/trending/weekly.json?limit=20`);
      const data = await res.json();

      return (data.works || [])
        .map(formatBook)
        .filter(b => b.cover_url);
    } catch {
      return [];
    }
  }, { ttl: TRENDING_TTL });
}

/* -----------------------------------------
   Top rated books
------------------------------------------ */
export async function fetchTopRatedBooks() {
  return cached('ol:top_rated', async () => {
    try {
      const res = await fetch(`${BASE}/search.json?q=subject:fiction&sort=rating&limit=20`);
      const data = await res.json();

      return (data.docs || [])
        .map(formatBook)
        .filter(b => b.cover_url);
    } catch {
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
      const res = await fetch(
        `${BASE}/search.json?q=${encodeURIComponent(query)}&limit=20`
      );
      const data = await res.json();

      return (data.docs || [])
        .map(formatBook)
        .filter(b => b.cover_url);
    } catch {
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
        fetch(`${BASE}${cleanKey}.json`),
        fetch(`${BASE}${cleanKey}/ratings.json`),
      ]);

      const work = await workRes.json();
      const ratings = ratingsRes.ok ? await ratingsRes.json() : null;

      // authors
      let authors = [];

      if (work.authors?.length) {
        const authorFetches = work.authors
          .slice(0, 3)
          .map(a => {
            const key = a.author?.key || a.key;
            return key
              ? fetch(`${BASE}${key}.json`)
                  .then(r => r.json())
                  .catch(() => null)
              : null;
          });

        const authorData = await Promise.all(authorFetches);

        authors = authorData
          .filter(Boolean)
          .map(a => ({
            name: a.name || '',
            bio: typeof a.bio === 'string'
              ? a.bio
              : (a.bio?.value || ''),
            photo: a.photos?.[0]
              ? `https://covers.openlibrary.org/a/id/${a.photos[0]}-M.jpg`
              : null,
          }));
      }

      const overview = typeof work.description === 'string'
        ? work.description
        : (work.description?.value || '');

      const coverId = work.covers?.[0];

      const cover_url = coverId
        ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg`
        : null;

      const subjects = work.subjects || [];

      return {
        id: `book_${cleanKey.replace('/works/', '')}`,
        external_id: cleanKey,
        title: work.title || '',
        media_type: 'book',
        cover_url,
        backdrop_url: cover_url,
        overview,
        year: work.first_publish_date || '',
        genres: subjects.slice(0, 6),
        keywords: subjects.slice(0, 12),
        authors,
        creator: authors[0]?.name || '',
        rating_avg: ratings?.summary?.average?.toFixed(1) || null,
        vote_count: ratings?.summary?.count || 0,
        subjects: subjects.slice(0, 20),
      };
    } catch (e) {
      console.error('[OpenLibrary error]', e);
      return null;
    }
  }, { ttl: DETAIL_TTL });
}