/**
 * prefetch.js
 *
 * Kicks off all slow API calls the moment the user authenticates,
 * before they even navigate to Home or Discover.
 *
 * Because every fetch writes into the shared cache (cache.js +
 * sessionStorage), by the time the user taps Home or Discover the
 * data is already there and the page renders instantly.
 *
 * Fire-and-forget: errors are swallowed so they never block the app.
 */

import { fetchTrendingMovies, fetchTopRatedMovies, fetchTrendingShows, fetchTopRatedShows } from './tmdb';
import { fetchTrendingBooks } from './openLibrary';
import { fetchTrendingGames } from './rawg';

let prefetchFired = false;

export function prefetchAll() {
  // Only fire once per session — the cache handles the rest
  if (prefetchFired) return;
  prefetchFired = true;

  // Small delay so auth/render completes first, then we use idle bandwidth
  setTimeout(() => {
    Promise.allSettled([
      fetchTrendingMovies(),
      fetchTopRatedMovies(),
      fetchTrendingShows(),
      fetchTopRatedShows(),
      fetchTrendingBooks(),
      fetchTrendingGames(),
    ]).then(results => {
      const succeeded = results.filter(r => r.status === 'fulfilled').length;
      const failed    = results.filter(r => r.status === 'rejected').length;
      console.log(`[Prefetch] Done — ${succeeded} succeeded, ${failed} failed`);
    });
  }, 300);
}

export function resetPrefetch() {
  prefetchFired = false;
}
