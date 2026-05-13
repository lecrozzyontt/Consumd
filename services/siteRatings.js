import { supabase } from './supabase';
import { cached } from './cache';

/**
 * Fetch community ratings from our own logs table.
 * Returns a Map: external_id (string) → { avg, count }
 *
 * Cached for 10 minutes since this is queried on every Discover load.
 */
export async function fetchSiteRatingMap(mediaType) {
  return cached(`site:ratings:${mediaType}`, async () => {
    // Fetch all completed logs of this type that have a rating
    const { data, error } = await supabase
      .from('logs')
      .select('external_id, rating')
      .eq('media_type', mediaType)
      .eq('status', 'completed')
      .not('rating', 'is', null);

    if (error || !data?.length) return new Map();

    // Aggregate: group by external_id
    const groups = {};
    for (const log of data) {
      const id = String(log.external_id);
      if (!groups[id]) groups[id] = { sum: 0, count: 0 };
      groups[id].sum   += log.rating;
      groups[id].count += 1;
    }

    // Build map: only include items with at least 2 ratings
    const ratingMap = new Map();
    for (const [id, { sum, count }] of Object.entries(groups)) {
      if (count >= 2) {
        ratingMap.set(id, { avg: sum / count, count });
      }
    }

    return ratingMap;
  }, { ttl: 10 * 60 * 1000 });
}

/**
 * Re-sort a list of media items by site community rating.
 *
 * Items with site ratings come first, sorted by avg DESC.
 * Items with no site ratings follow, in their original order.
 *
 * @param {Array}  items      - Array of media objects (must have external_id)
 * @param {Map}    ratingMap  - Map from fetchSiteRatingMap()
 */
export function sortBySiteRating(items, ratingMap) {
  const withRating    = [];
  const withoutRating = [];

  for (const item of items) {
    const id   = String(item.external_id);
    const data = ratingMap.get(id);
    if (data) {
      withRating.push({ ...item, site_avg: data.avg, site_count: data.count });
    } else {
      withoutRating.push(item);
    }
  }

  withRating.sort((a, b) => b.site_avg - a.site_avg);

  return [...withRating, ...withoutRating];
}

/**
 * Convenience: fetch rating map AND sort in one call.
 */
export async function sortedBySiteRating(items, mediaType) {
  if (!items?.length) return items;
  try {
    const ratingMap = await fetchSiteRatingMap(mediaType);
    return sortBySiteRating(items, ratingMap);
  } catch (e) {
    console.error('[siteRatings] sort failed, returning original order:', e);
    return items;
  }
}
