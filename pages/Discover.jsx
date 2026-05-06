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
import { fetchTrendingGames, searchGames } from '../services/rawg';
import { useOnFocus } from '../services/useOnFocus';
import './Discover.css';

const FILTERS = ['all', 'movies', 'shows', 'books', 'games'];

export default function Discover() {
  const [filter, setFilter]             = useState('all');
  const [query, setQuery]               = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching]       = useState(false);
  const [selectedMedia, setSelectedMedia] = useState(null);
  const [toast, setToast]               = useState('');

  // Category data
  const [trendingMovies, setTrendingMovies] = useState([]);
  const [topMovies, setTopMovies]           = useState([]);
  const [trendingShows, setTrendingShows]   = useState([]);
  const [topShows, setTopShows]             = useState([]);
  const [trendingBooks, setTrendingBooks]   = useState([]);
  const [trendingGames, setTrendingGames]   = useState([]);
  const [loading, setLoading]               = useState(true);

  const searchTimeout = useRef(null);

  useEffect(() => {
    loadAll();
  }, []);

  // Re-fetch categories when returning to the app from background — silently
  useOnFocus(() => { refreshAll(); });

  async function loadAll() {
    setLoading(true);
    try {
      await fetchAllCategories();
    } catch (e) {
      console.error('loadAll error:', e);
    } finally {
      setLoading(false);
    }
  }

  // Silent version — no loading state, used by useOnFocus
  async function refreshAll() {
    try { await fetchAllCategories(); } catch (e) { console.error(e); }
  }

  async function fetchAllCategories() {
    const [m, tm, s, ts, b, g] = await Promise.allSettled([
      fetchTrendingMovies(),
      fetchTopRatedMovies(),
      fetchTrendingShows(),
      fetchTopRatedShows(),
      fetchTrendingBooks(),
      fetchTrendingGames(),
    ]);
    setTrendingMovies(m.value || []);
    setTopMovies(tm.value || []);
    setTrendingShows(s.value || []);
    setTopShows(ts.value || []);
    setTrendingBooks(b.value || []);
    setTrendingGames(g.value || []);
  }

  const handleSearch = (q) => {
    setQuery(q);
    clearTimeout(searchTimeout.current);
    if (!q.trim()) { setSearchResults([]); return; }

    searchTimeout.current = setTimeout(async () => {
      setSearching(true);
      try {
        const searches = [];
        if (filter === 'all' || filter === 'movies') searches.push(searchMovies(q));
        if (filter === 'all' || filter === 'shows')  searches.push(searchShows(q));
        if (filter === 'all' || filter === 'books')  searches.push(searchBooks(q));
        if (filter === 'all' || filter === 'games')  searches.push(searchGames(q));
        const results = await Promise.allSettled(searches);
        const combined = results.flatMap(r => r.value || []).slice(0, 40);
        setSearchResults(combined);
      } catch (e) { console.error(e); }
      finally { setSearching(false); }
    }, 400);
  };

  const showCategories = !query.trim();

  const shouldShow = (type) =>
    filter === 'all' || filter === type;

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  return (
    <div className="discover-page page-wrapper fade-in">
      <h1 className="page-title">Discover</h1>
      <p className="page-subtitle">Search movies, shows, books, and games.</p>

      <SearchBar
        placeholder="Search anything…"
        onSearch={handleSearch}
      />

      <div className="filter-bar">
        {FILTERS.map(f => (
          <button
            key={f}
            className={`filter-pill ${filter === f ? 'active' : ''}`}
            onClick={() => {
              setFilter(f);

              // ensure search uses NEW filter value
              if (query.trim()) {
                clearTimeout(searchTimeout.current);

                searchTimeout.current = setTimeout(async () => {
                  setSearching(true);
                  try {
                    const searches = [];

                    const activeFilter = f; // IMPORTANT: use clicked value directly

                    if (activeFilter === 'all' || activeFilter === 'movies') searches.push(searchMovies(query));
                    if (activeFilter === 'all' || activeFilter === 'shows')  searches.push(searchShows(query));
                    if (activeFilter === 'all' || activeFilter === 'books')  searches.push(searchBooks(query));
                    if (activeFilter === 'all' || activeFilter === 'games')  searches.push(searchGames(query));

                    const results = await Promise.allSettled(searches);
                    const combined = results.flatMap(r => r.value || []).slice(0, 40);
                    setSearchResults(combined);
                  } catch (e) {
                    console.error(e);
                  } finally {
                    setSearching(false);
                  }
                }, 0);
              }
            }}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Search results */}
      {query.trim() && (
        <section className="search-results-section">
          {searching ? (
            <div className="loading-center"><div className="spinner" /></div>
          ) : searchResults.length > 0 ? (
            <CategoryRow
              title={`Results for "${query}"`}
              items={searchResults}
              onLog={setSelectedMedia}
            />
          ) : (
            <div className="empty-state">
              <p>No results found for "{query}"</p>
            </div>
          )}
        </section>
      )}

      {/* Browse categories */}
      {showCategories && !loading && (
        <>
          {shouldShow('movies') && (
            <>
              <CategoryRow title="Trending Movies"   items={trendingMovies} onLog={setSelectedMedia} />
              <CategoryRow title="Top Rated Movies"  items={topMovies}      onLog={setSelectedMedia} />
            </>
          )}
          {shouldShow('shows') && (
            <>
              <CategoryRow title="Trending Shows"    items={trendingShows}  onLog={setSelectedMedia} />
              <CategoryRow title="Top Rated Shows"   items={topShows}       onLog={setSelectedMedia} />
            </>
          )}
          {shouldShow('books') && (
            <CategoryRow title="Trending Books"      items={trendingBooks}  onLog={setSelectedMedia} />
          )}
          {shouldShow('games') && (
            <CategoryRow title="Popular Games"       items={trendingGames}  onLog={setSelectedMedia} />
          )}
        </>
      )}

      {showCategories && loading && (
        <div className="loading-center"><div className="spinner" /></div>
      )}

      {selectedMedia && (
        <LogModal
          media={selectedMedia}
          onClose={() => setSelectedMedia(null)}
          onSaved={() => showToast('Saved to your log!')}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
