/**
 * Simple in-memory cache for Supabase data.
 *
 * Persists across React re-renders and tab switches (JS stays alive).
 * Resets on true page reload (which is fine — that's a fresh start).
 *
 * Usage:
 *   import { cacheGet, cacheSet } from '../services/dataCache';
 *   const cached = cacheGet('profile:abc123');
 *   cacheSet('profile:abc123', { logs, stats });
 */

const store = {};

export function cacheGet(key) {
  return store[key] ?? null;
}

export function cacheSet(key, data) {
  store[key] = data;
}

export function cacheClear(key) {
  delete store[key];
}
