/* ============================================================
   Profile cache — single source of truth for username + avatar
   lookups. Avoids fetching the same profile 5 times across the
   feed, comment threads, notifications, etc.

   Two functions:
     getProfiles(ids)  - returns { id -> { id, username, avatar_url } }
     primeProfile(p)   - seeds the cache with a profile we already
                         have (e.g. from a join), so we don't refetch.
   ============================================================ */

import { supabase } from './supabase';

const memCache = new Map();  // id -> { id, username, avatar_url, fetchedAt }
const TTL = 5 * 60 * 1000;   // 5 minutes — profiles don't change often

const inflight = new Map();  // id -> Promise<profile>

function isFresh(entry) {
  return entry && (Date.now() - entry.fetchedAt) < TTL;
}

/**
 * Seed the cache with a profile fetched elsewhere (e.g. from a
 * Supabase relational select). Skip the network round-trip later.
 */
export function primeProfile(profile) {
  if (!profile?.id) return;
  memCache.set(profile.id, {
    id: profile.id,
    username:   profile.username   ?? null,
    avatar_url: profile.avatar_url ?? null,
    fetchedAt:  Date.now(),
  });
}

export function primeProfiles(profiles) {
  (profiles || []).forEach(primeProfile);
}

/**
 * Resolve one user id. Returns null if the user doesn't exist or
 * the lookup fails — callers should always handle null gracefully.
 */
export async function getProfile(id) {
  if (!id) return null;
  const map = await getProfiles([id]);
  return map[id] || null;
}

/**
 * Batched profile lookup for an array of user ids. Hits the cache
 * for any fresh ids and runs a single `in()` query for the misses.
 *
 * Returns an object keyed by user id.
 */
export async function getProfiles(ids = []) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return {};

  const out  = {};
  const need = [];

  for (const id of unique) {
    const cached = memCache.get(id);
    if (isFresh(cached)) {
      out[id] = cached;
    } else if (inflight.has(id)) {
      // Reuse an existing fetch so we don't double-hit the DB
      out[id] = await inflight.get(id);
    } else {
      need.push(id);
    }
  }

  if (need.length > 0) {
    const fetchPromise = supabase
      .from('profiles')
      .select('id, username, avatar_url')
      .in('id', need)
      .then(({ data }) => {
        const fetched = {};
        (data || []).forEach(p => {
          const entry = {
            id: p.id,
            username:   p.username,
            avatar_url: p.avatar_url,
            fetchedAt:  Date.now(),
          };
          memCache.set(p.id, entry);
          fetched[p.id] = entry;
        });
        return fetched;
      });

    // Mark each requested id as in-flight so concurrent callers
    // share this promise instead of starting their own.
    need.forEach(id => {
      const idPromise = fetchPromise.then(map => map[id] || null);
      inflight.set(id, idPromise);
    });

    try {
      const fetched = await fetchPromise;
      Object.assign(out, fetched);
    } finally {
      need.forEach(id => inflight.delete(id));
    }
  }

  return out;
}

/** Drop a profile from cache (e.g. after the user updates their avatar). */
export function invalidateProfile(id) {
  if (id) memCache.delete(id);
}

export function clearProfileCache() {
  memCache.clear();
}