const memCache = new Map();   // key -> { value, expires }
const inflight = new Map();   // key -> Promise

const SESSION_PREFIX = 'consumd_cache:';

/* -----------------------------------------
   Session storage helpers
------------------------------------------ */
function readSession(key) {
  try {
    const raw = sessionStorage.getItem(SESSION_PREFIX + key);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.expires !== 'number') return null;

    if (parsed.expires < Date.now()) {
      sessionStorage.removeItem(SESSION_PREFIX + key);
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function writeSession(key, entry) {
  try {
    sessionStorage.setItem(SESSION_PREFIX + key, JSON.stringify(entry));
  } catch {}
}

/* -----------------------------------------
   Validation (OpenLibrary-safe)
------------------------------------------ */
function isBadValue(v) {
  if (!v) return true;

  if (Array.isArray(v)) return v.length === 0;

  if (typeof v === 'object') {
    if (Object.keys(v).length === 0) return true;
    if (v.error) return true;

    if (v.docs && v.docs.length === 0) return true;
    if (v.works && v.works.length === 0) return true;
  }

  return false;
}

/* -----------------------------------------
   Main cache
------------------------------------------ */
export async function cached(key, fetcher, opts = {}) {
  const ttl = opts.ttl ?? 600000; // 10 min
  const persist = opts.persist ?? true;
  const force = opts.force ?? false;

  const now = Date.now();

  // FORCE refresh
  if (force) {
    memCache.delete(key);
    try { sessionStorage.removeItem(SESSION_PREFIX + key); } catch {}
  }

  // 1. Memory cache (fastest path)
  const mem = memCache.get(key);
  if (mem && mem.expires > now) {
    return mem.value;
  }

  // 2. Session cache
  if (persist) {
    const ses = readSession(key);
    if (ses && !isBadValue(ses.value)) {
      memCache.set(key, ses);
      return ses.value;
    }
  }

  // 3. Deduplicate inflight
  const existing = inflight.get(key);
  if (existing) return existing;

  const promise = fetcher()
    .then((value) => {
      if (!isBadValue(value)) {
        const entry = {
          value,
          expires: now + ttl,
        };

        memCache.set(key, entry);

        if (persist) writeSession(key, entry);
      }
      return value;
    })
    .catch((err) => {
      console.error('[cache error]', key, err);
      return [];
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, promise);
  return promise;
}

/* -----------------------------------------
   Invalidate single key
------------------------------------------ */
export function invalidate(key) {
  memCache.delete(key);
  try { sessionStorage.removeItem(SESSION_PREFIX + key); } catch {}
}

/* -----------------------------------------
   Invalidate prefix (faster loop)
------------------------------------------ */
export function invalidatePrefix(prefix) {
  for (const key of memCache.keys()) {
    if (key.startsWith(prefix)) memCache.delete(key);
  }

  try {
    const fullPrefix = SESSION_PREFIX + prefix;

    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i);
      if (k?.startsWith(fullPrefix)) {
        sessionStorage.removeItem(k);
      }
    }
  } catch {}
}

/* -----------------------------------------
   Clear all
------------------------------------------ */
export function clearAll() {
  memCache.clear();

  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i);
      if (k?.startsWith(SESSION_PREFIX)) {
        sessionStorage.removeItem(k);
      }
    }
  } catch {}
}