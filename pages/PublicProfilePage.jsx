import { useEffect, useState } from "react";
import { supabase } from "../services/supabase";
import { useParams, useNavigate } from "react-router-dom";
import RatingStars from '../components/RatingStars';
import ReviewInteractions from '../components/ReviewInteractions';
import Avatar from '../components/Avatar';
import './Profile.css';

const TYPE_COLORS = {
  movie:   '#c9a84c',
  show:    '#60a5fa',
  season:  '#60a5fa',
  episode: '#60a5fa',
  book:    '#4ade80',
  game:    '#c084fc',
};

const TABS = [
  { key: 'completed',   label: 'Journal'    },
  { key: 'in_progress', label: 'Currently'  },
  { key: 'want',        label: 'Watchlist'  },
];

export default function PublicProfilePage() {
  const { userId } = useParams();
  const navigate = useNavigate();

  const [profile, setProfile] = useState(null);
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState(null);
  const [top4, setTop4] = useState([]);
  const [recent, setRecent] = useState([]);
  const [activeTab, setActiveTab] = useState('completed');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      if (!userId) return;

      try {
        // 1. FETCH PROFILE
        const { data: userData, error: userError } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", userId)
          .single();

        if (userError) {
          console.error(userError);
          return;
        }

        setProfile(userData);

        // 2. FETCH ALL LOGS
        const { data: allLogsData, error: logsError } = await supabase
          .from("logs")
          .select("*")
          .eq("user_id", userId)
          .order("logged_at", { ascending: false });

        if (logsError) {
          console.error("Error fetching public logs (Likely an RLS policy issue!):", logsError);
        }

        const allLogs = allLogsData || [];
        setLogs(allLogs);
        setRecent(allLogs.slice(0, 8));

        // 3. FETCH TOP 4 (from profile.top4_ids)
        const topIds = userData.top4_ids || [];
        if (topIds.length > 0) {
          const orderedTop = topIds
            .map((id) => allLogs.find((item) => item.id === id))
            .filter(Boolean);
          setTop4(orderedTop);
        }

        // 4. CALCULATE STATS
        const byType = allLogs.reduce((acc, l) => {
          const bucket = (l.media_type === 'season' || l.media_type === 'episode')
            ? 'show'
            : l.media_type;
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
        console.error('Error fetching data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [userId]);

  if (loading) return (
    <div className="profile-page page-wrapper">
      <div className="loading-center"><div className="spinner" /></div>
    </div>
  );

  if (!profile) return (
    <div className="profile-page page-wrapper">
      <div className="empty-state"><p>User not found</p></div>
    </div>
  );

  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : null;
  
  const filteredLogs = logs.filter(l => l.status === activeTab);

  return (
    <div className="profile-page page-wrapper fade-in">

      {/* ── HERO ── */}
      <div className="profile-hero">
        <div className="profile-hero-bg" />
        <div className="profile-hero-content">
          <div className="profile-avatar-wrap">
            <Avatar
              url={profile?.avatar_url}
              username={profile?.username}
              size={76}
              className="profile-avatar"
            />
          </div>

          <div className="profile-info">
            <div className="profile-name-row" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <h1 className="profile-username" style={{ margin: 0 }}>{profile?.username || 'User'}</h1>
              <button 
                onClick={() => navigate(-1)} 
                style={{ 
                  background: 'var(--surface-glass)', 
                  border: '1px solid var(--border-color)', 
                  color: 'var(--text-primary)', 
                  cursor: 'pointer', 
                  padding: '0.5rem', 
                  borderRadius: 'var(--radius-md)',
                  display: 'flex', 
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all var(--transition)'
                }}
                title="Go back"
                onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                onMouseOut={(e) => e.currentTarget.style.background = 'var(--surface-glass)'}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="19" y1="12" x2="5" y2="12"></line>
                  <polyline points="12 19 5 12 12 5"></polyline>
                </svg>
              </button>
            </div>
            {memberSince && <p className="profile-since" style={{ marginTop: '0.5rem' }}>Member since {memberSince}</p>}
            {profile?.bio && <p className="profile-bio">{profile.bio}</p>}
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

      {/* ── TOP 4 ── */}
      {top4.length > 0 && (
        <section className="profile-section">
          <div className="section-header">
            <h2 className="section-title">Top 4</h2>
          </div>
          <div className="top4-row">
            {[0, 1, 2, 3].map(i => {
              const item = top4[i];
              return (
                <div key={i} className="top4-slot">
                  {item ? (
                      <div
                        className="top4-item"
                        onClick={() => navigate(`/media/${item.media_id}`, { state: { media: item } })}
                        style={{ cursor: "pointer" }}
                      >
                      <div className="top4-cover">
                        {item.cover_url
                          ? <img src={item.cover_url} alt={item.title} />
                          : <div className="top4-placeholder"
                              style={{ borderTop: `3px solid ${TYPE_COLORS[item.media_type]}` }}>
                              {item.title?.[0]}
                            </div>
                        }
                      </div>
                      <p className="top4-title">{item.title}</p>
                    </div>
                  ) : null}
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
              <button key={t.key}
                className={`tab-btn ${activeTab === t.key ? 'active' : ''}`}
                onClick={() => setActiveTab(t.key)}>
                {t.label}
                {count > 0 && <span className="tab-count">{count}</span>}
              </button>
            );
          })}
        </div>
        <div className="log-list">
          {filteredLogs.length === 0 ? (
            <div className="empty-state">
              <p>{activeTab === 'completed' ? 'No completed entries yet.'
                : activeTab === 'in_progress' ? 'Nothing in progress.'
                : 'Watchlist is empty.'}</p>
            </div>
          ) : filteredLogs.map(log => (
            <article key={log.id} className="log-entry fade-in">
              <div className="log-cover">
                {log.cover_url
                  ? <img src={log.cover_url} alt={log.title} loading="lazy" />
                  : <div className="log-cover-placeholder"
                      style={{ borderTop: `2px solid ${TYPE_COLORS[log.media_type]}` }}>
                      {log.title?.[0]}
                    </div>
                }
              </div>
              <div className="log-body">
                <div className="log-top">
                  <div className="log-title-row">
                    <h3 className="log-title">{log.title}</h3>
                    {log.year && <span className="log-year">{log.year}</span>}
                  </div>
                  <span className="log-type-badge"
                    style={{ color: TYPE_COLORS[log.media_type], borderColor: TYPE_COLORS[log.media_type] + '40' }}>
                    {log.media_type}
                  </span>
                </div>
                {log.creator && <p className="log-creator">{log.creator}</p>}
                {log.rating ? <RatingStars rating={log.rating} readOnly size="sm" /> : null}
                {log.notes && <p className="log-review">"{log.notes}"</p>}
                <div className="log-footer">
                  <span className="log-date">
                    {new Date(log.logged_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                  </span>
                </div>
                {log.status === 'completed' && <ReviewInteractions log={log} />}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}