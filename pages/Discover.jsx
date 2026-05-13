import { useState, useEffect, useRef } from 'react';
import SearchBar from '../components/SearchBar';
import CategoryRow from '../components/CategoryRow';
import LogModal from '../components/LogModal';
import {
  fetchTrendingMovies, fetchTopRatedMovies,
  fetchTrendingShows, fetchTopRatedShows,
  searchMovies, searchShows,
} from '../services/tmdb';
import { fetchTrendingBooks, searchBooks } from '../services/openLibrary';
import { fetchTrendingGames, fetchTopRatedGames, searchGames } from '../services/rawg';
import { sortedBySiteRating } from '../services/siteRatings';
import { useOnFocus } from '../services/useOnFocus';
import './Discover.css';

const FILTERS         = ['all', 'films', 'shows', 'books', 'games'];
const LOAD_TIMEOUT_MS = 10000;

function withTimeout(promise, ms = LOAD_TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

export default function Discover() {
  const [filter, setFilter]               = useState('all');
  const [query, setQuery]                 = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching]         = useState(false);
  const [searchError, setSearchError]     = useState(false);
  const [lastQuery, setLastQuery]         = useState('');
  const [selectedMedia, setSelectedMedia] = useState(null);
  const [toast, setToast]                 = useState('');

  const [trendingMovies, setTrendingMovies]     = useState([]);
  const [topMovies, setTopMovies]               = useState([]);
  const [trendingShows, setTrendingShows]       = useState([]);
  const [topShows, setTopShows]                 = useState([]);
  const [trendingBooks, setTrendingBooks]       = useState([]);
  const [trendingGames, setTrendingGames]       = useState([]);
  const [topGames, setTopGames]                 = useState([]);
  const [loading, setLoading]                   = useState(true);
  const [categoriesError, setCategoriesError]   = useState(false);

  const searchTimeout = useRef(null);
  const mounted       = useRef(true);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { loadAll(); }, []);
  useOnFocus(() => { if (!categoriesError) refreshAll(); });

  async function loadAll() {
    if (!mounted.current) return;
    setLoading(true); setCategoriesError(false);
    try { await fetchAllCategories(); }
    catch (e) { console.error('[Discover] loadAll:', e); if (mounted.current) setCategoriesError(true); }
    finally { if (mounted.current) setLoading(false); }
  }

  async function refreshAll() {
    try { await fetchAllCategories(); } catch (e) { console.error('[Discover] refresh:', e); }
  }

  async function fetchAllCategories() {
    const [mT, mR, sT, sR, b, gT, gR] = await withTimeout(
      Promise.allSettled([
        fetchTrendingMovies(),
        fetchTopRatedMovies(),
        fetchTrendingShows(),
        fetchTopRatedShows(),
        fetchTrendingBooks(),
        fetchTrendingGames(),
        fetchTopRatedGames(),
      ])
    );

    if (!mounted.current) return;

    if (mT.status === 'fulfilled') setTrendingMovies(mT.value || []);
    if (sT.status === 'fulfilled') setTrendingShows(sT.value  || []);
    if (b.status  === 'fulfilled') setTrendingBooks(b.value   || []);
    if (gT.status === 'fulfilled') setTrendingGames(gT.value  || []);

    // Re-sort Top Rated rows by site community ratings
    if (mR.status === 'fulfilled' && mR.value?.length) {
      const sorted = await sortedBySiteRating(mR.value, 'movie');
      if (mounted.current) setTopMovies(sorted);
    }
    if (sR.status === 'fulfilled' && sR.value?.length) {
      const sorted = await sortedBySiteRating(sR.value, 'show');
      if (mounted.current) setTopShows(sorted);
    }
    if (gR.status === 'fulfilled' && gR.value?.length) {
      const sorted = await sortedBySiteRating(gR.value, 'game');
      if (mounted.current) setTopGames(sorted);
    }

    const allFailed = [mT, mR, sT, sR, b, gT, gR].every(r => r.status === 'rejected');
    if (allFailed) throw new Error('All fetches failed');
  }

  function runSearch(q, activeFilter) {
    clearTimeout(searchTimeout.current);
    if (!q.trim()) { setSearchResults([]); setSearchError(false); return; }

    searchTimeout.current = setTimeout(async () => {
      if (!mounted.current) return;
      setSearching(true); setSearchError(false); setLastQuery(q);
      try {
        const searches = [];
        if (activeFilter === 'all' || activeFilter === 'films') searches.push(searchMovies(q));
        if (activeFilter === 'all' || activeFilter === 'shows') searches.push(searchShows(q));
        if (activeFilter === 'all' || activeFilter === 'books') searches.push(searchBooks(q));
        if (activeFilter === 'all' || activeFilter === 'games') searches.push(searchGames(q));
        const results = await withTimeout(Promise.allSettled(searches));
        if (!mounted.current) return;
        const combined = results.flatMap(r => r.value || []).slice(0, 40);
        setSearchResults(combined);
        if (!combined.length && results.every(r => r.status === 'rejected')) setSearchError(true);
      } catch (e) {
        console.error('[Discover] search:', e);
        if (mounted.current) setSearchError(true);
      } finally {
        if (mounted.current) setSearching(false);
      }
    }, 400);
  }

  const handleSearch       = (q) => { setQuery(q); runSearch(q, filter); };
  const handleFilterChange = (f) => { setFilter(f); if (query.trim()) runSearch(query, f); };
  const shouldShow         = (type) => filter === 'all' || filter === type;
  const showCategories     = !query.trim();

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 3000); }

  return (
    <div className="discover-page page-wrapper fade-in">
      <h1 className="page-title">Discover</h1>
      <p className="page-subtitle">Search films, shows, books, and games.</p>

      <SearchBar placeholder="Search anything…" onSearch={handleSearch} />

      <div className="filter-bar">
        {FILTERS.map(f => (
          <button
            key={f}
            className={`filter-pill ${filter === f ? 'active' : ''}`}
            onClick={() => handleFilterChange(f)}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* ── Search results ── */}
      {query.trim() && (
        <section className="search-results-section">
          {searching ? (
            <div className="loading-center"><div className="spinner" /></div>
          ) : searchError ? (
            <div className="error-state">
              <p>Search failed. Check your connection.</p>
              <button className="retry-btn" onClick={() => runSearch(query, filter)}>Try Again</button>
            </div>
          ) : searchResults.length > 0 ? (
            <CategoryRow title={`Results for "${lastQuery}"`} items={searchResults} onLog={setSelectedMedia} />
          ) : (
            <div className="empty-state"><p>No results found for "{lastQuery}"</p></div>
          )}
        </section>
      )}

      {/* ── Browse categories ── */}
      {showCategories && loading && <div className="loading-center"><div className="spinner" /></div>}

      {showCategories && !loading && categoriesError && (
        <div className="error-state">
          <p>Couldn't load content. Check your connection.</p>
          <button className="retry-btn" onClick={loadAll}>Try Again</button>
        </div>
      )}

      {showCategories && !loading && !categoriesError && (
        <>
          {shouldShow('films') && (
            <>
              <CategoryRow title="Trending Films"                    items={trendingMovies} onLog={setSelectedMedia} />
              <CategoryRow title="Top Rated Films — Community Picks" items={topMovies}      onLog={setSelectedMedia} />
            </>
          )}
          {shouldShow('shows') && (
            <>
              <CategoryRow title="Trending Shows"                    items={trendingShows}  onLog={setSelectedMedia} />
              <CategoryRow title="Top Rated Shows — Community Picks" items={topShows}       onLog={setSelectedMedia} />
            </>
          )}
          {shouldShow('books') && (
            <CategoryRow title="Trending Books" items={trendingBooks} onLog={setSelectedMedia} />
          )}
          {shouldShow('games') && (
            <>
              <CategoryRow title="Trending Games"                    items={trendingGames} onLog={setSelectedMedia} />
              <CategoryRow title="Top Rated Games — Community Picks" items={topGames}      onLog={setSelectedMedia} />
            </>
          )}
        </>
      )}

      {selectedMedia && (
        <LogModal
          media={selectedMedia}
          onClose={() => setSelectedMedia(null)}
          onSaved={() => { setSelectedMedia(null); showToast('Saved to your log!'); }}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
