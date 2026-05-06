import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../services/supabase';
import { fetchTrendingMovies, fetchTrendingShows } from '../services/tmdb';
import { fetchTrendingGames } from '../services/rawg';
import { fetchTrendingBooks } from '../services/openLibrary';
import { useOnFocus } from '../services/useOnFocus';
import CategoryRow from '../components/CategoryRow';
import ActivityCard from '../components/ActivityCard';
import './Home.css';

export default function Home() {
  // ── Pull user + profile from context (no extra network calls needed) ──
  const { profile, user } = useAuth();
  const navigate = useNavigate();

  const [trendingMovies, setTrendingMovies] = useState([]);
  const [trendingShows, setTrendingShows]   = useState([]);
  const [trendingBooks, setTrendingBooks]   = useState([]);
  const [trendingGames, setTrendingGames]   = useState([]);
  const [friendsActivity, setFriendsActivity]     = useState([]);
  const [friendsInProgress, setFriendsInProgress] = useState([]);
  const [loadingMedia, setLoadingMedia] = useState(true);
  const [loadingFeed, setLoadingFeed]   = useState(true);

  // Trending media doesn't need auth — load immediately on mount
  useEffect(() => {
    loadMedia();
  }, []);

  // Friends feed DOES need auth — wait until we have a confirmed user ID.
  // On a first-install PWA launch (no refresh), AuthContext.initSession()
  // is async, so user starts as null. This effect re-runs once it resolves.
  useEffect(() => {
    if (!user?.id) return;
    loadFriendsFeed(user.id);
  }, [user?.id]);

  // Re-fetch on tab focus — silent (no spinner, existing content stays visible)
  useOnFocus(() => {
    refreshMedia();
    if (user?.id) refreshFriendsFeed(user.id);
  });

  async function loadMedia() {
    setLoadingMedia(true);
    try {
      await fetchMediaData();
    } finally {
      setLoadingMedia(false);
    }
  }

  // Silent version — no loading state, used by useOnFocus
  async function refreshMedia() {
    try { await fetchMediaData(); } catch (e) { console.error(e); }
  }

  async function fetchMediaData() {
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
  }

  async function loadFriendsFeed(userId) {
    setLoadingFeed(true);
    try {
      await fetchFeedData(userId);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingFeed(false);
    }
  }

  // Silent version — no loading state, used by useOnFocus
  async function refreshFriendsFeed(userId) {
    try { await fetchFeedData(userId); } catch (e) { console.error(e); }
  }

  async function fetchFeedData(userId) {
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
      return;
    }

    const [{ data: completedLogs }, { data: inProgressLogs }] = await Promise.all([
      supabase
        .from('logs')
        .select('id, title, media_type, cover_url, rating, review, status, logged_at, user_id')
        .in('user_id', friendIds)
        .eq('status', 'completed')
        .order('logged_at', { ascending: false })
        .limit(20),
      supabase
        .from('logs')
        .select('id, title, media_type, cover_url, rating, review, status, logged_at, user_id')
        .in('user_id', friendIds)
        .eq('status', 'in_progress')
        .order('logged_at', { ascending: false })
        .limit(20),
    ]);

    const allLogs = [...(completedLogs || []), ...(inProgressLogs || [])];
    if (allLogs.length === 0) {
      setFriendsActivity([]);
      setFriendsInProgress([]);
      return;
    }

    const userIds = [...new Set(allLogs.map(l => l.user_id))];
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username')
      .in('id', userIds);

    const profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p.username]));

    setFriendsActivity((completedLogs || []).map(log => ({
      ...log,
      username: profileMap[log.user_id] || 'Unknown',
    })));
    setFriendsInProgress((inProgressLogs || []).map(log => ({
      ...log,
      username: profileMap[log.user_id] || 'Unknown',
    })));
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
        {/* Friends Completed Activity */}
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

        {/* Friends In Progress */}
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
