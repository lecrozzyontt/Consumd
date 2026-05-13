/**
 * dataCache.js
 *
 * Simple key-value cache for Supabase data (profile logs, feeds, social).
 * Backed by sessionStorage so data survives React navigation and tab switches.
 * Resets on full page reload (intentional — stale DB data should refresh).
 *
 * Usage (unchanged from before):
 *   import { cacheGet, cacheSet, cacheClear } from '../services/dataCache';
 */

const PREFIX  = 'consumd_data:';
const MAX_AGE = 5 * 60 * 1000; // 5 minutes — Supabase data goes stale faster than API data

// In-memory layer on top of sessionStorage for instant reads
const mem = {};

function ssGet(key) {
  try {
    const raw = sessionStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.ts !== 'number') return null;
    if (Date.now() - parsed.ts > MAX_AGE) {
      sessionStorage.removeItem(PREFIX + key);
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

function ssSet(key, data) {
  try {
    sessionStorage.setItem(PREFIX + key, JSON.stringify({ data, ts: Date.now() }));
  } catch {
    // sessionStorage full — clear old entries and try once more
    try {
      for (let i = sessionStorage.length - 1; i >= 0; i--) {
        const k = sessionStorage.key(i);
        if (k?.startsWith(PREFIX)) sessionStorage.removeItem(k);
      }
      sessionStorage.setItem(PREFIX + key, JSON.stringify({ data, ts: Date.now() }));
    } catch {}
  }
}

export function cacheGet(key) {
  // 1. Memory (fastest)
  if (mem[key] !== undefined) return mem[key];
  // 2. SessionStorage (survives navigation)
  const fromSession = ssGet(key);
  if (fromSession !== null) {
    mem[key] = fromSession; // warm memory layer
    return fromSession;
  }
  return null;
}

export function cacheSet(key, data) {
  mem[key] = data;
  ssSet(key, data);
}

export function cacheClear(key) {
  delete mem[key];
  try { sessionStorage.removeItem(PREFIX + key); } catch {}
}

export function cacheClearAll() {
  Object.keys(mem).forEach(k => delete mem[k]);
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i);
      if (k?.startsWith(PREFIX)) sessionStorage.removeItem(k);
    }
  } catch {}
}
