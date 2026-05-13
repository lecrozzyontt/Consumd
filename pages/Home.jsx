import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../services/supabase';
import { fetchTrendingMovies, fetchTrendingShows } from '../services/tmdb';
import { fetchTrendingGames } from '../services/rawg';
import { fetchTrendingBooks } from '../services/openLibrary';
import { fetchRecommendations } from '../services/recommendations';
import { fetchNextEpisodes } from '../services/nextEpisode';
import { cacheGet, cacheSet } from '../services/dataCache';
import CategoryRow from '../components/CategoryRow';
import ActivityCard from '../components/ActivityCard';
import './Home.css';

const LOAD_TIMEOUT_MS = 10000;

function withTimeout(promise, ms = LOAD_TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

/**
 * Interleave arrays round-robin so the combined rec row feels balanced
 * e.g. [movie, show, book, game, movie, show, ...]
 */
function interleave(...arrays) {
  const result = [];
  const maxLen = Math.max(...arrays.map(a => a.length));
  for (let i = 0; i < maxLen; i++) {
    for (const arr of arrays) {
      if (arr[i] !== undefined) result.push(arr[i]);
    }
  }
  return result;
}

export default function Home() {
  const { profile, user } = useAuth();
  const navigate = useNavigate();

  // ── Next episodes ────────────────────────────────────────────
  const [nextEpisodes,   setNextEpisodes]   = useState(() => cacheGet('home:nextEps') || []);
  const [loadingNextEps, setLoadingNextEps] = useState(!cacheGet('home:nextEps'));

  // ── Recommendations (combined) ───────────────────────────────
  const [recommendations, setRecommendations] = useState(() => cacheGet('home:recs:combined') || []);
  const [loadingRecs,     setLoadingRecs]     = useState(!cacheGet('home:recs:combined'));
  const [recsError,       setRecsError]       = useState(false);

  // ── Consumd Top Rated ────────────────────────────────────────
  const [topRatedApp, setTopRatedApp] = useState(() => cacheGet('home:topRatedApp') || []);

  // ── Trending rows ────────────────────────────────────────────
  const [trendingMovies, setTrendingMovies] = useState(() => cacheGet('home:media')?.movies || []);
  const [trendingShows,  setTrendingShows]  = useState(() => cacheGet('home:media')?.shows  || []);
  const [trendingBooks,  setTrendingBooks]  = useState(() => cacheGet('home:media')?.books  || []);
  const [trendingGames,  setTrendingGames]  = useState(() => cacheGet('home:media')?.games  || []);
  const [loadingMedia,   setLoadingMedia]   = useState(!cacheGet('home:media'));
  const [mediaError,     setMediaError]     = useState(false);

  // ── Friends feed ─────────────────────────────────────────────
  const [friendsActivity,   setFriendsActivity]   = useState(() => cacheGet('home:feed')?.completed  || []);
  const [friendsInProgress, setFriendsInProgress] = useState(() => cacheGet('home:feed')?.inProgress || []);
  const [loadingFeed,       setLoadingFeed]        = useState(!cacheGet('home:feed'));
  const [feedError,         setFeedError]          = useState(false);

  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  // ── Initial loads ────────────────────────────────────────────
  useEffect(() => { loadMedia(); }, []);
  useEffect(() => {
    if (!user?.id) return;
    loadNextEpisodes(user.id);
    loadRecs(user.id);
    loadFriendsFeed(user.id);
  }, [user?.id]);

  // ── Tab switch: always silent ────────────────────────────────
  useEffect(() => {
    const handle = () => {
      if (document.visibilityState !== 'visible') return;
      setTimeout(() => {
        silentRefreshMedia();
        if (user?.id) {
          silentRefreshNextEps(user.id);
          silentRefreshRecs(user.id);
          silentRefreshFeed(user.id);
        }
      }, 150);
    };
    document.addEventListener('visibilitychange', handle);
    return () => document.removeEventListener('visibilitychange', handle);
  }, [user?.id]);

  // ── Next episodes ─────────────────────────────────────────────
  const fetchNextEpsData = useCallback(async (userId) => {
    const eps = await withTimeout(fetchNextEpisodes(userId));
    if (!mounted.current) return;
    setNextEpisodes(eps || []);
    cacheSet('home:nextEps', eps || []);
  }, []);

  const loadNextEpisodes = useCallback(async (userId) => {
    setLoadingNextEps(true);
    try { await fetchNextEpsData(userId); }
    catch (e) { console.error('[Home] loadNextEps:', e); }
    finally { if (mounted.current) setLoadingNextEps(false); }
  }, [fetchNextEpsData]);

  const silentRefreshNextEps = useCallback(async (userId) => {
    try { await fetchNextEpsData(userId); } catch {}
  }, [fetchNextEpsData]);

  // ── Recommendations ───────────────────────────────────────────
  const fetchRecsData = useCallback(async (userId) => {
    const recs = await withTimeout(fetchRecommendations(userId));
    if (!mounted.current) return;
    // Interleave all types into one mixed row (max 20 items total)
    const combined = interleave(
      recs.movies || [],
      recs.shows  || [],
      recs.books  || [],
      recs.games  || [],
    ).slice(0, 20);
    setRecommendations(combined);
    cacheSet('home:recs:combined', combined);
  }, []);

  const loadRecs = useCallback(async (userId) => {
    setLoadingRecs(true); setRecsError(false);
    try { await fetchRecsData(userId); }
    catch (e) { console.error('[Home] loadRecs:', e); if (mounted.current) setRecsError(true); }
    finally { if (mounted.current) setLoadingRecs(false); }
  }, [fetchRecsData]);

  const silentRefreshRecs = useCallback(async (userId) => {
    try { await fetchRecsData(userId); } catch {}
  }, [fetchRecsData]);

  // ── App Top Rated ─────────────────────────────────────────────
  const fetchTopRatedAppData = useCallback(async () => {
    const { data: logs, error } = await supabase
      .from('logs')
      .select('title, media_type, external_id, cover_url, rating')
      .not('rating', 'is', null)
      .order('logged_at', { ascending: false })
      .limit(2000);

    if (error || !logs) return;

    const stats = {};
    for (const log of logs) {
      if (!log.external_id) continue;
      const key = `${log.media_type}-${log.external_id}`;
      if (!stats[key]) {
        stats[key] = {
          title: log.title,
          media_type: log.media_type,
          external_id: log.external_id,
          cover_url: log.cover_url,
          sum: 0,
          count: 0
        };
      }
      stats[key].sum += log.rating;
      stats[key].count += 1;
    }

    const top = Object.values(stats)
      .map(s => ({ ...s, avg: s.sum / s.count }))
      .sort((a, b) => b.avg - a.avg || b.count - a.count)
      .slice(0, 20);

    if (!mounted.current) return;
    setTopRatedApp(top);
    cacheSet('home:topRatedApp', top);
  }, []);

  // ── Trending media ────────────────────────────────────────────
  const fetchMediaData = useCallback(async () => {
    const [movies, shows, books, games] = await withTimeout(
      Promise.all([fetchTrendingMovies(), fetchTrendingShows(), fetchTrendingBooks(), fetchTrendingGames()])
    );
    if (!mounted.current) return;
    setTrendingMovies(movies); setTrendingShows(shows);
    setTrendingBooks(books);   setTrendingGames(games);
    cacheSet('home:media', { movies, shows, books, games });
  }, []);

  const loadMedia = useCallback(async () => {
    setLoadingMedia(true); setMediaError(false);
    try { await Promise.all([fetchMediaData(), fetchTopRatedAppData()]); }
    catch (e) { console.error('[Home] loadMedia:', e); if (mounted.current) setMediaError(true); }
    finally { if (mounted.current) setLoadingMedia(false); }
  }, [fetchMediaData, fetchTopRatedAppData]);

  const silentRefreshMedia = useCallback(async () => {
    try { await Promise.all([fetchMediaData(), fetchTopRatedAppData()]); } catch {}
  }, [fetchMediaData, fetchTopRatedAppData]);

  // ── Friends feed ──────────────────────────────────────────────
  const fetchFeedData = useCallback(async (userId) => {
    const { data: friendships, error: fErr } = await supabase
      .from('friendships').select('requester_id, addressee_id').eq('status', 'accepted')
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
    if (fErr) throw fErr;

    const friendIds = (friendships || []).map(f =>
      f.requester_id === userId ? f.addressee_id : f.requester_id
    );

    if (!friendIds.length) {
      if (mounted.current) { setFriendsActivity([]); setFriendsInProgress([]); }
      cacheSet('home:feed', { completed: [], inProgress: [] });
      return;
    }

    const [{ data: completedLogs, error: cErr }, { data: inProgressLogs, error: iErr }] =
      await Promise.all([
        supabase.from('logs').select('id, title, media_type, cover_url, rating, review, status, logged_at, user_id')
          .in('user_id', friendIds).eq('status', 'completed').order('logged_at', { ascending: false }).limit(20),
        supabase.from('logs').select('id, title, media_type, cover_url, rating, review, status, logged_at, user_id')
          .in('user_id', friendIds).eq('status', 'in_progress').order('logged_at', { ascending: false }).limit(20),
      ]);
    if (cErr || iErr) throw cErr || iErr;

    const allLogs = [...(completedLogs || []), ...(inProgressLogs || [])];
    if (!allLogs.length) {
      if (mounted.current) { setFriendsActivity([]); setFriendsInProgress([]); }
      cacheSet('home:feed', { completed: [], inProgress: [] });
      return;
    }

    const userIds = [...new Set(allLogs.map(l => l.user_id))];
    const { data: profiles } = await supabase.from('profiles').select('id, username').in('id', userIds);
    const profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p.username]));
    const completed  = (completedLogs  || []).map(l => ({ ...l, username: profileMap[l.user_id] || 'Unknown' }));
    const inProgress = (inProgressLogs || []).map(l => ({ ...l, username: profileMap[l.user_id] || 'Unknown' }));

    if (!mounted.current) return;
    setFriendsActivity(completed); setFriendsInProgress(inProgress);
    cacheSet('home:feed', { completed, inProgress });
  }, []);

  const loadFriendsFeed = useCallback(async (userId) => {
    setLoadingFeed(true); setFeedError(false);
    try { await withTimeout(fetchFeedData(userId)); }
    catch (e) { console.error('[Home] loadFeed:', e); if (mounted.current) setFeedError(true); }
    finally { if (mounted.current) setLoadingFeed(false); }
  }, [fetchFeedData]);

  const silentRefreshFeed = useCallback(async (userId) => {
    try { await withTimeout(fetchFeedData(userId)); } catch {}
  }, [fetchFeedData]);

  return (
    <div className="home-page page-wrapper fade-in">
      <div className="home-hero">
        <h1 className="page-title">Welcome back{profile?.username ? `, ${profile.username}` : ''}</h1>
        <p className="page-subtitle">Your personal media archive.</p>
      </div>

      {/* ① Continue Watching — top of page */}
      {!loadingNextEps && nextEpisodes.length > 0 && (
        <section className="recommendations">
          <CategoryRow
            title="Continue Watching"
            items={nextEpisodes}
            onLog={m => navigate('/log', { state: { media: m } })}
          />
        </section>
      )}

      {/* ② Recommendations — one mixed row */}
      {loadingRecs ? (
        <div className="loading-center"><div className="spinner" /></div>
      ) : recsError ? (
        <div className="error-state">
          <p>Couldn't load recommendations.</p>
          <button className="retry-btn" onClick={() => user?.id && loadRecs(user.id)}>Try Again</button>
        </div>
      ) : recommendations.length > 0 ? (
        <section className="recommendations">
          <CategoryRow
            title="Recommended for You"
            items={recommendations}
            onLog={m => navigate('/log', { state: { media: m } })}
          />
        </section>
      ) : (
        <div className="empty-recs-hint">
          <p>Rate things above ★★½ to get personalised recommendations.</p>
        </div>
      )}

      {/* ③ Top Rated on Consumd */}
      {!loadingMedia && topRatedApp.length > 0 && (
        <section className="recommendations">
          <CategoryRow
            title="Top Rated"
            items={topRatedApp}
            onLog={m => navigate('/log', { state: { media: m } })}
          />
        </section>
      )}

      {/* ④ Trending rows */}
      {loadingMedia ? (
        <div className="loading-center"><div className="spinner" /></div>
      ) : mediaError ? (
        <div className="error-state">
          <p>Couldn't load trending content.</p>
          <button className="retry-btn" onClick={loadMedia}>Try Again</button>
        </div>
      ) : (
        <section className="recommendations">
          <CategoryRow title="Trending Films" items={trendingMovies} onLog={m => navigate('/log', { state: { media: m } })} />
          <CategoryRow title="Trending Shows" items={trendingShows}  onLog={m => navigate('/log', { state: { media: m } })} />
          <CategoryRow title="Trending Books" items={trendingBooks}  onLog={m => navigate('/log', { state: { media: m } })} />
          <CategoryRow title="Trending Games" items={trendingGames}  onLog={m => navigate('/log', { state: { media: m } })} />
        </section>
      )}

      {/* ⑤ Friends feed */}
      <div className="feeds-container">
        <section className="feed-section">
          <h2 className="section-title accent-line">Friends recent activity!</h2>
          {loadingFeed ? (
            <div className="loading-center"><div className="spinner" /></div>
          ) : feedError ? (
            <div className="error-state">
              <p>Couldn't load friend activity.</p>
              <button className="retry-btn" onClick={() => user?.id && loadFriendsFeed(user.id)}>Try Again</button>
            </div>
          ) : friendsActivity.length === 0 ? (
            <div className="empty-state"><p>No activity yet — add some friends to see what they're watching!</p></div>
          ) : (
            <div className="activity-feed-scroll">
              <div className="activity-feed">
                {friendsActivity.map(item => (
                  <Link key={item.id} to={`/user/${item.user_id}`} className="activity-card-link">
                    <ActivityCard activity={item} hideInteractions={true} />
                  </Link>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="feed-section">
          <h2 className="section-title accent-line">Friends current consumption!</h2>
          {loadingFeed ? (
            <div className="loading-center"><div className="spinner" /></div>
          ) : feedError ? (
            <div className="error-state">
              <p>Couldn't load friends in progress.</p>
              <button className="retry-btn" onClick={() => user?.id && loadFriendsFeed(user.id)}>Try Again</button>
            </div>
          ) : friendsInProgress.length === 0 ? (
            <div className="empty-state"><p>Your friends aren't currently tracking anything in progress.</p></div>
          ) : (
            <div className="activity-feed-scroll">
              <div className="activity-feed">
                {friendsInProgress.map(item => (
                  <Link key={item.id} to={`/user/${item.user_id}`} className="activity-card-link">
                    <ActivityCard activity={item} hideInteractions={true} />
                  </Link>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}