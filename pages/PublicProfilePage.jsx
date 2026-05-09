import { useEffect, useState, useRef } from 'react';
import { supabase } from '../services/supabase';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { blockUser, unblockUser, isUserBlocked } from '../services/moderation';
import RatingStars from '../components/RatingStars';
import ReviewInteractions from '../components/ReviewInteractions';
import Avatar from '../components/Avatar';
import ReportModal from '../components/ReportModal';
import './Profile.css';

const LOAD_TIMEOUT_MS = 10000;

function withTimeout(promise, ms = LOAD_TIMEOUT_MS) {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Request timed out')), ms)
  );
  return Promise.race([promise, timeout]);
}

const TYPE_COLORS = {
  movie:   '#c9a84c',
  show:    '#60a5fa',
  season:  '#60a5fa',
  episode: '#60a5fa',
  book:    '#4ade80',
  game:    '#c084fc',
};

const TYPE_LABELS = {
  movie: 'Film',
  show:  'Show',
  book:  'Book',
  game:  'Game',
};

const TABS = [
  { key: 'completed',   label: 'Journal'   },
  { key: 'in_progress', label: 'Currently' },
  { key: 'want',        label: 'Watchlist' },
];

export default function PublicProfilePage() {
  const { userId } = useParams();
  const navigate   = useNavigate();
  const { user }   = useAuth();

  const [profile,    setProfile]    = useState(null);
  const [logs,       setLogs]       = useState([]);
  const [stats,      setStats]      = useState(null);
  const [top4,       setTop4]       = useState([]);
  const [activeTab,  setActiveTab]  = useState('completed');
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(false);

  const [menuOpen,      setMenuOpen]      = useState(false);
  const [reportOpen,    setReportOpen]    = useState(false);
  const [blocked,       setBlocked]       = useState(false);
  const [blockLoading,  setBlockLoading]  = useState(false);
  const [toast,         setToast]         = useState('');
  const menuRef = useRef(null);

  const mounted      = useRef(true);
  const isOwnProfile = user?.id === userId;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    }
    if (menuOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  useEffect(() => {
    if (!user || !userId || isOwnProfile) return;
    isUserBlocked(user.id, userId).then(b => { if (mounted.current) setBlocked(b); });
  }, [user, userId]);

  useEffect(() => {
    if (userId) fetchData();
  }, [userId]);

  async function fetchData() {
    if (!mounted.current) return;
    setLoading(true);
    setError(false);

    try {
      const { data: userData, error: userError } = await withTimeout(
        supabase.from('profiles').select('*').eq('id', userId).single()
      );
      if (userError) throw userError;
      if (!mounted.current) return;
      setProfile(userData);

      const { data: allLogsData, error: logsError } = await withTimeout(
        supabase.from('logs').select('*').eq('user_id', userId).order('logged_at', { ascending: false })
      );
      if (logsError) throw logsError;
      if (!mounted.current) return;

      const allLogs = allLogsData || [];
      setLogs(allLogs);

      const topIds = userData.top4_ids || [];
      if (topIds.length > 0) {
        setTop4(topIds.map(id => allLogs.find(item => item.id === id)).filter(Boolean));
      }

      const byType = allLogs.reduce((acc, l) => {
        const bucket = (l.media_type === 'season' || l.media_type === 'episode') ? 'show' : l.media_type;
        acc[bucket] = (acc[bucket] || 0) + 1;
        return acc;
      }, {});

      setStats({
        total: allLogs.length,
        movie: byType.movie || 0,
        show:  byType.show  || 0,
        book:  byType.book  || 0,
        game:  byType.game  || 0,
      });
    } catch (err) {
      console.error('[PublicProfile] fetchData failed:', err);
      if (mounted.current) setError(true);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }

  async function handleToggleBlock() {
    if (!user || blockLoading) return;
    setBlockLoading(true);
    setMenuOpen(false);
    if (blocked) {
      await unblockUser(user.id, userId);
      setBlocked(false);
      showToast('User unblocked.');
    } else {
      const confirmed = window.confirm(`Block @${profile?.username}? You will no longer see their content.`);
      if (!confirmed) { setBlockLoading(false); return; }
      await blockUser(user.id, userId);
      setBlocked(true);
      showToast(`@${profile?.username} has been blocked.`);
    }
    setBlockLoading(false);
  }

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 3500); }

  const memberSince  = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : null;
  const filteredLogs = logs.filter(l => l.status === activeTab);

  if (loading) return (
    <div className="profile-page page-wrapper">
      <div className="loading-center"><div className="spinner" /></div>
    </div>
  );

  if (error) return (
    <div className="profile-page page-wrapper">
      <div className="error-state">
        <p>Couldn't load this profile. Check your connection.</p>
        <button className="retry-btn" onClick={fetchData}>Try Again</button>
      </div>
    </div>
  );

  if (!profile) return (
    <div className="profile-page page-wrapper">
      <div className="empty-state"><p>User not found.</p></div>
    </div>
  );

  return (
    <div className="profile-page page-wrapper fade-in">
      {/* ── HERO ── */}
      <div className="profile-hero">
        <div className="profile-hero-bg" />
        <div className="profile-hero-content">
          <div className="profile-avatar-wrap">
            <Avatar url={profile?.avatar_url} username={profile?.username} size={76} className="profile-avatar" />
          </div>
          <div className="profile-info">
            <div className="profile-name-row" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <h1 className="profile-username" style={{ margin: 0 }}>{profile?.username || 'User'}</h1>
              <button onClick={() => navigate(-1)}
                style={{ background: 'var(--surface-glass)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', cursor: 'pointer', padding: '0.5rem', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                title="Go back">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
                </svg>
              </button>
              {!isOwnProfile && user && (
                <div className="kebab-wrap" ref={menuRef} style={{ marginLeft: 'auto' }}>
                  <button className="kebab-btn" onClick={() => setMenuOpen(o => !o)} aria-label="More options">···</button>
                  {menuOpen && (
                    <div className="kebab-menu">
                      <button onClick={() => { setMenuOpen(false); setReportOpen(true); }}>🚩 Report Profile</button>
                      <button className="danger" onClick={handleToggleBlock} disabled={blockLoading}>
                        🚫 {blocked ? 'Unblock User' : 'Block User'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
            {memberSince && <p className="profile-since" style={{ marginTop: '0.5rem' }}>Member since {memberSince}</p>}
            {profile?.bio && <p className="profile-bio">{profile.bio}</p>}
            {blocked && <p style={{ fontSize: '0.8rem', color: '#f87171', marginTop: '0.4rem' }}>You have blocked this user.</p>}
          </div>
        </div>

        {stats && (
          <div className="profile-stats">
            {[
              { label: 'Total', value: stats.total },
              { label: 'Films', value: stats.movie },
              { label: 'Shows', value: stats.show  },
              { label: 'Books', value: stats.book  },
              { label: 'Games', value: stats.game  },
            ].map(s => (
              <div key={s.label} className="stat-pill">
                <span className="stat-val">{s.value}</span>
                <span className="stat-lbl">{s.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {blocked ? (
        <div className="empty-state" style={{ padding: '3rem 1rem', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-secondary)' }}>You have blocked this user. Their content is hidden.</p>
          <button onClick={handleToggleBlock}
            style={{ marginTop: '1rem', background: 'none', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '0.5rem 1.25rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.875rem' }}>
            Unblock
          </button>
        </div>
      ) : (
        <>
          {/* ── TOP 4 ── */}
          {top4.length > 0 && (
            <section className="profile-section">
              <div className="section-header"><h2 className="section-title">Top 4</h2></div>
              <div className="top4-row">
                {[0, 1, 2, 3].map(i => {
                  const item = top4[i];
                  return (
                    <div key={i} className="top4-slot">
                      {item && (
                        <div className="top4-item" onClick={() => navigate(`/media/${item.media_id}`, { state: { media: item } })} style={{ cursor: 'pointer' }}>
                          <div className="top4-cover">
                            {item.cover_url
                              ? <img src={item.cover_url} alt={item.title} />
                              : <div className="top4-placeholder" style={{ borderTop: `3px solid ${TYPE_COLORS[item.media_type]}` }}>{item.title?.[0]}</div>
                            }
                          </div>
                          <p className="top4-title">{item.title}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* ── LOG TABS ── */}
          <section className="profile-section">
            <div className="profile-tabs">
              {TABS.map(t => {
                const count = logs.filter(l => l.status === t.key).length;
                return (
                  <button key={t.key} className={`tab-btn ${activeTab === t.key ? 'active' : ''}`} onClick={() => setActiveTab(t.key)}>
                    {t.label}
                    {count > 0 && <span className="tab-count">{count}</span>}
                  </button>
                );
              })}
            </div>
            <div className="log-list">
              {filteredLogs.length === 0 ? (
                <div className="empty-state">
                  <p>{activeTab === 'completed' ? 'No completed entries yet.' : activeTab === 'in_progress' ? 'Nothing in progress.' : 'Watchlist is empty.'}</p>
                </div>
              ) : filteredLogs.map(log => (
                <article key={log.id} className="log-entry fade-in">
                  <div className="log-cover">
                    {log.cover_url
                      ? <img src={log.cover_url} alt={log.title} loading="lazy" />
                      : <div className="log-cover-placeholder" style={{ borderTop: `2px solid ${TYPE_COLORS[log.media_type]}` }}>{log.title?.[0]}</div>
                    }
                  </div>
                  <div className="log-body">
                    <div className="log-top">
                      <div className="log-title-row">
                        <h3 className="log-title">{log.title}</h3>
                        {log.year && <span className="log-year">{log.year}</span>}
                      </div>
                      <span className="log-type-badge" style={{ color: TYPE_COLORS[log.media_type], borderColor: TYPE_COLORS[log.media_type] + '40' }}>
                        {TYPE_LABELS[log.media_type] || log.media_type}
                      </span>
                    </div>
                    {log.creator && <p className="log-creator">{log.creator}</p>}
                    {log.rating  ? <RatingStars rating={log.rating} readOnly size="sm" /> : null}
                    {log.notes   && <p className="log-review">"{log.notes}"</p>}
                    <div className="log-footer">
                      <span className="log-date">{new Date(log.logged_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                    </div>
                    {log.status === 'completed' && <ReviewInteractions log={log} />}
                  </div>
                </article>
              ))}
            </div>
          </section>
        </>
      )}

      <ReportModal isOpen={reportOpen} onClose={() => setReportOpen(false)}
        contentId={userId} contentType="profile" reportedUserId={userId} />

      {toast && (
        <div style={{ position: 'fixed', bottom: '5rem', left: '50%', transform: 'translateX(-50%)', background: 'var(--bg-primary, #1a1a1a)', border: '1px solid var(--border-color)', color: 'var(--text-primary, #fff)', padding: '0.65rem 1.25rem', borderRadius: '20px', fontSize: '0.875rem', zIndex: 3000, boxShadow: '0 4px 20px rgba(0,0,0,0.4)', whiteSpace: 'nowrap' }}>
          {toast}
        </div>
      )}
    </div>
  );
}
