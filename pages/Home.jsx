import { useState, useEffect } from 'react';
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

export default function Home() {
  const { profile, user } = useAuth();
  const navigate = useNavigate();

  const [trendingMovies, setTrendingMovies] = useState(() => cacheGet('home:media')?.movies || []);
  const [trendingShows, setTrendingShows]   = useState(() => cacheGet('home:media')?.shows  || []);
  const [trendingBooks, setTrendingBooks]   = useState(() => cacheGet('home:media')?.books  || []);
  const [trendingGames, setTrendingGames]   = useState(() => cacheGet('home:media')?.games  || []);
  const [friendsActivity, setFriendsActivity]     = useState(() => cacheGet('home:feed')?.completed   || []);
  const [friendsInProgress, setFriendsInProgress] = useState(() => cacheGet('home:feed')?.inProgress || []);

  // Only show spinner if no cached data exists
  const [loadingMedia, setLoadingMedia] = useState(!cacheGet('home:media'));
  const [loadingFeed, setLoadingFeed]   = useState(!cacheGet('home:feed'));

  useEffect(() => { loadMedia(); }, []);

  useEffect(() => {
    if (!user?.id) return;
    loadFriendsFeed(user.id);
  }, [user?.id]);

  // On tab/app resume, refresh silently — cache guarantees no spinner
  useEffect(() => {
    const handle = () => {
      if (document.visibilityState !== 'visible') return;
      loadMedia();
      if (user?.id) loadFriendsFeed(user.id);
    };
    document.addEventListener('visibilitychange', handle);
    return () => document.removeEventListener('visibilitychange', handle);
  }, [user?.id]);

  async function loadMedia() {
    // Show spinner only on first load (no cache)
    if (!cacheGet('home:media')) setLoadingMedia(true);
    try {
      const [movies, shows, books, games] = await Promise.all([
        fetchTrendingMovies(),
        fetchTrendingShows(),
        fetchTrendingBooks(),
        fetchTrendingGames(),
      ]);
      setTrendingMovies(movies);
      setTrendingShows(shows);
      setTrendingBooks(books);
      setTrendingGames(games);
      cacheSet('home:media', { movies, shows, books, games });
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingMedia(false);
    }
  }

  async function loadFriendsFeed(userId) {
    if (!cacheGet('home:feed')) setLoadingFeed(true);
    try {
      const { data: friendships } = await supabase
        .from('friendships')
        .select('requester_id, addressee_id')
        .eq('status', 'accepted')
        .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);

      const friendIds = (friendships || []).map(f =>
        f.requester_id === userId ? f.addressee_id : f.requester_id
      );

      if (friendIds.length === 0) {
        setFriendsActivity([]);
        setFriendsInProgress([]);
        cacheSet('home:feed', { completed: [], inProgress: [] });
        return;
      }

      const [{ data: completedLogs }, { data: inProgressLogs }] = await Promise.all([
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
      ]);

      const allLogs = [...(completedLogs || []), ...(inProgressLogs || [])];
      if (allLogs.length === 0) {
        setFriendsActivity([]);
        setFriendsInProgress([]);
        cacheSet('home:feed', { completed: [], inProgress: [] });
        return;
      }

      const userIds = [...new Set(allLogs.map(l => l.user_id))];
      const { data: profiles } = await supabase
        .from('profiles').select('id, username').in('id', userIds);
      const profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p.username]));

      const completed   = (completedLogs  || []).map(l => ({ ...l, username: profileMap[l.user_id] || 'Unknown' }));
      const inProgress  = (inProgressLogs || []).map(l => ({ ...l, username: profileMap[l.user_id] || 'Unknown' }));

      setFriendsActivity(completed);
      setFriendsInProgress(inProgress);
      cacheSet('home:feed', { completed, inProgress });
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingFeed(false);
    }
  }

  function handleLogMedia(media) {
    navigate('/log', { state: { media } });
  }

  return (
    <div className="home-page page-wrapper fade-in">
      <div className="home-hero">
        <h1 className="page-title">
          Welcome back{profile?.username ? `, ${profile.username}` : ''}
        </h1>
        <p className="page-subtitle">Your personal media archive.</p>
      </div>

      {loadingMedia ? (
        <div className="loading-center"><div className="spinner" /></div>
      ) : (
        <section className="recommendations">
          <CategoryRow title="Trending Movies" items={trendingMovies} onLog={handleLogMedia} />
          <CategoryRow title="Trending Shows"  items={trendingShows}  onLog={handleLogMedia} />
          <CategoryRow title="Trending Books"  items={trendingBooks}  onLog={handleLogMedia} />
          <CategoryRow title="Trending Games"  items={trendingGames}  onLog={handleLogMedia} />
        </section>
      )}

      <div className="feeds-container">
        <section className="feed-section">
          <h2 className="section-title accent-line">Friends recent activity!</h2>
          {loadingFeed ? (
            <div className="loading-center"><div className="spinner" /></div>
          ) : friendsActivity.length === 0 ? (
            <div className="empty-state">
              <p>No activity yet — add some friends to see what they're watching!</p>
            </div>
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
          ) : friendsInProgress.length === 0 ? (
            <div className="empty-state">
              <p>Your friends aren't currently tracking anything in progress.</p>
            </div>
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
