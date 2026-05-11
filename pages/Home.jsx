import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../services/supabase';
import { fetchTrendingMovies, fetchTrendingShows } from '../services/tmdb';
import { fetchTrendingGames } from '../services/rawg';
import { fetchTrendingBooks } from '../services/openLibrary';
import { cacheGet, cacheSet } from '../services/dataCache';
import CategoryRow from '../components/CategoryRow';
import ActivityCard from '../components/ActivityCard';
import './Home.css';

const LOAD_TIMEOUT_MS = 10000;

function withTimeout(promise, ms = LOAD_TIMEOUT_MS) {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Request timed out')), ms)
  );
  return Promise.race([promise, timeout]);
}

export default function Home() {
  const { profile, user } = useAuth();
  const navigate = useNavigate();

  const [trendingMovies, setTrendingMovies] = useState(() => cacheGet('home:media')?.movies || []);
  const [trendingShows,  setTrendingShows]  = useState(() => cacheGet('home:media')?.shows  || []);
  const [trendingBooks,  setTrendingBooks]  = useState(() => cacheGet('home:media')?.books  || []);
  const [trendingGames,  setTrendingGames]  = useState(() => cacheGet('home:media')?.games  || []);
  const [friendsActivity,    setFriendsActivity]    = useState(() => cacheGet('home:feed')?.completed  || []);
  const [friendsInProgress,  setFriendsInProgress]  = useState(() => cacheGet('home:feed')?.inProgress || []);

  const [loadingMedia, setLoadingMedia] = useState(!cacheGet('home:media'));
  const [loadingFeed,  setLoadingFeed]  = useState(!cacheGet('home:feed'));
  const [mediaError,   setMediaError]   = useState(false);
  const [feedError,    setFeedError]    = useState(false);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => { loadMedia(); }, []);

  useEffect(() => {
    if (!user?.id) return;
    loadFriendsFeed(user.id);
  }, [user?.id]);

  useEffect(() => {
    const handle = () => {
      if (document.visibilityState !== 'visible') return;
      setTimeout(() => {
        if (cacheGet('home:media')) loadMedia();
        if (cacheGet('home:feed') && user?.id) loadFriendsFeed(user.id);
      }, 150);
    };
    document.addEventListener('visibilitychange', handle);
    return () => document.removeEventListener('visibilitychange', handle);
  }, [user?.id]);

  async function loadMedia() {
    if (!mounted.current) return;
    setLoadingMedia(true);
    setMediaError(false);
    try {
      const [movies, shows, books, games] = await withTimeout(
        Promise.all([
          fetchTrendingMovies(),
          fetchTrendingShows(),
          fetchTrendingBooks(),
          fetchTrendingGames(),
        ])
      );
      if (!mounted.current) return;
      setTrendingMovies(movies);
      setTrendingShows(shows);
      setTrendingBooks(books);
      setTrendingGames(games);
      cacheSet('home:media', { movies, shows, books, games });
    } catch (e) {
      console.error('[Home] loadMedia failed:', e);
      if (mounted.current) setMediaError(true);
    } finally {
      if (mounted.current) setLoadingMedia(false);
    }
  }

  async function loadFriendsFeed(userId) {
    if (!mounted.current) return;
    setLoadingFeed(true);
    setFeedError(false);
    try {
      const { data: friendships, error: fErr } = await withTimeout(
        supabase
          .from('friendships')
          .select('requester_id, addressee_id')
          .eq('status', 'accepted')
          .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
      );
      if (fErr) throw fErr;
      if (!mounted.current) return;

      const friendIds = (friendships || []).map(f =>
        f.requester_id === userId ? f.addressee_id : f.requester_id
      );

      if (friendIds.length === 0) {
        setFriendsActivity([]);
        setFriendsInProgress([]);
        cacheSet('home:feed', { completed: [], inProgress: [] });
        return;
      }

      const [{ data: completedLogs, error: cErr }, { data: inProgressLogs, error: iErr }] =
        await withTimeout(Promise.all([
          supabase
            .from('logs')
            .select('id, title, media_type, cover_url, rating, review, status, logged_at, user_id')
            .in('user_id', friendIds).eq('status', 'completed')
            .order('logged_at', { ascending: false }).limit(20),
          supabase
            .from('logs')
            .select('id, title, media_type, cover_url, rating, review, status, logged_at, user_id')
            .in('user_id', friendIds).eq('status', 'in_progress')
            .order('logged_at', { ascending: false }).limit(20),
        ]));

      if (cErr || iErr) throw cErr || iErr;
      if (!mounted.current) return;

      const allLogs = [...(completedLogs || []), ...(inProgressLogs || [])];
      if (allLogs.length === 0) {
        setFriendsActivity([]);
        setFriendsInProgress([]);
        cacheSet('home:feed', { completed: [], inProgress: [] });
        return;
      }

      const userIds = [...new Set(allLogs.map(l => l.user_id))];
      const { data: profiles } = await withTimeout(
        supabase.from('profiles').select('id, username').in('id', userIds)
      );
      const profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p.username]));

      const completed  = (completedLogs  || []).map(l => ({ ...l, username: profileMap[l.user_id] || 'Unknown' }));
      const inProgress = (inProgressLogs || []).map(l => ({ ...l, username: profileMap[l.user_id] || 'Unknown' }));

      if (!mounted.current) return;
      setFriendsActivity(completed);
      setFriendsInProgress(inProgress);
      cacheSet('home:feed', { completed, inProgress });
    } catch (e) {
      console.error('[Home] loadFriendsFeed failed:', e);
      if (mounted.current) setFeedError(true);
    } finally {
      if (mounted.current) setLoadingFeed(false);
    }
  }

  return (
    <div className="home-page page-wrapper fade-in">
      <div className="home-hero">
        <h1 className="page-title">Welcome back{profile?.username ? `, ${profile.username}` : ''}</h1>
        <p className="page-subtitle">Your personal media archive.</p>
      </div>

      {/* ── Media rows ── */}
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

      {/* ── Friends feed ── */}
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
