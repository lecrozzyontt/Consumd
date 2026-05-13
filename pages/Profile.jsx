import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { useAuth } from '../context/AuthContext';
import { invalidateProfile } from '../services/profileCache';
import { cacheGet, cacheSet } from '../services/dataCache';
import RatingStars from '../components/RatingStars';
import ReviewInteractions from '../components/ReviewInteractions';
import Avatar from '../components/Avatar';
import './Profile.css';

const LOAD_TIMEOUT_MS = 10000;

function withTimeout(promise, ms = LOAD_TIMEOUT_MS) {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Request timed out')), ms)
  );
  return Promise.race([promise, timeout]);
}

const TYPE_COLORS = { movie: '#c9a84c', show: '#60a5fa', season: '#60a5fa', episode: '#60a5fa', book: '#4ade80', game: '#c084fc' };
const TYPE_LABELS = { movie: 'Film', show: 'Show', book: 'Book', game: 'Game' };
const TABS = [
  { key: 'completed',   label: 'Journal'   },
  { key: 'in_progress', label: 'Currently' },
  { key: 'want',        label: 'Watchlist' },
];

export default function Profile() {
  const { profile, updateProfile } = useAuth();

  const profileCache = () => profile?.id ? cacheGet('profile:' + profile.id) : null;

  const [logs,   setLogs]   = useState(() => profileCache()?.logs   || []);
  const [stats,  setStats]  = useState(() => profileCache()?.stats  || null);
  const [top4,   setTop4]   = useState(() => profileCache()?.top4   || []);
  const [recent, setRecent] = useState(() => profileCache()?.recent || []);

  const [activeTab,  setActiveTab]  = useState('completed');
  const [loading,    setLoading]    = useState(!profileCache());
  const [error,      setError]      = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const [editingBio,  setEditingBio]  = useState(false);
  const [bioInput,    setBioInput]    = useState('');
  const [savingBio,   setSavingBio]   = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarUrl,       setAvatarUrl]       = useState(null);

  const [pickerOpen,   setPickerOpen]   = useState(false);
  const [pickerSlot,   setPickerSlot]   = useState(null);
  const [pickerSearch, setPickerSearch] = useState('');
  const [savingTop4,   setSavingTop4]   = useState(false);

  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  // ── Core fetcher (shared by load + silent) ───────────────────
  const fetchProfileData = useCallback(async () => {
    if (!profile) return;
    const { data, error: fetchError } = await supabase
      .from('logs').select('*').eq('user_id', profile.id).order('logged_at', { ascending: false });
    if (fetchError) throw fetchError;

    const allLogs       = data || [];
    const resolved      = (profile.top4_ids || []).map(id => allLogs.find(l => l.id === id)).filter(Boolean);
    const recentLogs    = allLogs.slice(0, 10);
    const completedLogs = allLogs.filter(l => l.status === 'completed');
    const byType        = completedLogs.reduce((acc, l) => {
      const b = (l.media_type === 'season' || l.media_type === 'episode') ? 'show' : l.media_type;
      acc[b] = (acc[b] || 0) + 1; return acc;
    }, {});
    const newStats = { total: completedLogs.length, movie: byType.movie || 0, show: byType.show || 0, book: byType.book || 0, game: byType.game || 0 };

    if (!mounted.current) return;
    setLogs(allLogs); setRecent(recentLogs); setTop4(resolved); setStats(newStats);
    cacheSet('profile:' + profile.id, { logs: allLogs, recent: recentLogs, top4: resolved, stats: newStats });
  }, [profile]);

  // ── Load with spinner (initial + retry) ─────────────────────
  const loadProfileData = useCallback(async () => {
    if (!mounted.current || !profile) return;
    setLoading(true);
    setError(false);
    try {
      await withTimeout(fetchProfileData());
    } catch (e) {
      console.error('[Profile] load failed:', e);
      if (mounted.current) setError(true);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [fetchProfileData, profile]);

  // ── Silent refresh (NO spinner — tab switch only) ────────────
  const silentRefresh = useCallback(async () => {
    if (!mounted.current || !profile) return;
    try { await withTimeout(fetchProfileData()); }
    catch (e) { console.error('[Profile] silent refresh failed (silent):', e); }
  }, [fetchProfileData, profile]);

  useEffect(() => {
    if (profile) { loadProfileData(); setBioInput(profile.bio || ''); setAvatarUrl(profile.avatar_url || null); }
  }, [profile?.id]);

  // ── Tab switch: silent only ──────────────────────────────────
  useEffect(() => {
    const handle = () => {
      if (document.visibilityState === 'visible' && profile) setTimeout(silentRefresh, 150);
    };
    document.addEventListener('visibilitychange', handle);
    return () => document.removeEventListener('visibilitychange', handle);
  }, [profile?.id, silentRefresh]);

  const deleteLog = async (id) => {
    setDeletingId(id);
    await supabase.from('logs').delete().eq('id', id);
    const updated       = logs.filter(l => l.id !== id);
    const completedLogs = updated.filter(l => l.status === 'completed');
    const byType        = completedLogs.reduce((acc, l) => {
      const b = (l.media_type === 'season' || l.media_type === 'episode') ? 'show' : l.media_type;
      acc[b] = (acc[b] || 0) + 1; return acc;
    }, {});
    setLogs(updated);
    setRecent(prev => prev.filter(l => l.id !== id));
    setTop4(prev  => prev.filter(l => l.id !== id));
    setStats({ total: completedLogs.length, movie: byType.movie || 0, show: byType.show || 0, book: byType.book || 0, game: byType.game || 0 });
    setDeletingId(null);
  };

  const saveBio = async () => {
    setSavingBio(true);
    try { await updateProfile({ bio: bioInput.trim() }); setEditingBio(false); }
    catch (e) { console.error(e); } finally { setSavingBio(false); }
  };

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const ext  = file.name.split('.').pop();
      const path = `${profile.id}/avatar.${ext}`;
      if (path.includes('..')) throw new Error('Invalid path');
      const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
      await updateProfile({ avatar_url: publicUrl });
      invalidateProfile(profile.id);
      setAvatarUrl(publicUrl);
    } catch (err) { console.error(err); alert('Failed to upload avatar: ' + err.message); }
    setUploadingAvatar(false);
  };

  const openPicker = (i) => { setPickerSlot(i); setPickerSearch(''); setPickerOpen(true); };
  const pickLog    = async (log) => {
    const newTop4  = [...top4];
    const existing = newTop4.findIndex(l => l.id === log.id);
    if (existing !== -1) newTop4.splice(existing, 1);
    newTop4[pickerSlot] = log;
    const cleaned = newTop4.filter(Boolean).slice(0, 4);
    setTop4(cleaned); setPickerOpen(false); setSavingTop4(true);
    try { await updateProfile({ top4_ids: cleaned.map(l => l.id) }); }
    catch (e) { console.error(e); } finally { setSavingTop4(false); }
  };
  const removeFromTop4 = async (i) => {
    const newTop4 = top4.filter((_, idx) => idx !== i);
    setTop4(newTop4);
    try { await updateProfile({ top4_ids: newTop4.map(l => l.id) }); }
    catch (e) { console.error(e); }
  };

  const filteredLogs  = logs.filter(l => l.status === activeTab);
  const memberSince   = profile?.created_at ? new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : null;
  const pickerResults = logs.filter(l => l.title.toLowerCase().includes(pickerSearch.toLowerCase()));

  if (loading) return <div className="profile-page page-wrapper"><div className="loading-center"><div className="spinner" /></div></div>;
  if (error)   return (
    <div className="profile-page page-wrapper">
      <div className="error-state">
        <p>Couldn't load your profile. Check your connection.</p>
        <button className="retry-btn" onClick={loadProfileData}>Try Again</button>
      </div>
    </div>
  );

  return (
    <div className="profile-page page-wrapper fade-in">
      <div className="profile-hero">
        <div className="profile-hero-bg" />
        <div className="profile-hero-content">
          <div className="profile-avatar-wrap">
            <label className="avatar-upload-label" title="Change profile picture">
              <input type="file" accept="image/*" className="avatar-file-input" onChange={handleAvatarChange} disabled={uploadingAvatar} />
              {uploadingAvatar
                ? <div className="profile-avatar"><span className="avatar-spinner" /></div>
                : <Avatar url={avatarUrl} username={profile?.username} size={76} className="profile-avatar" />
              }
              <div className="avatar-overlay"><span>✎</span></div>
            </label>
          </div>
          <div className="profile-info">
            <div className="profile-name-row">
              <h1 className="profile-username">{profile?.username || 'User'}</h1>
              <Link to="/settings" className="settings-btn" title="Settings">⚙</Link>
            </div>
            {memberSince && <p className="profile-since">Member since {memberSince}</p>}
            <div className="profile-bio-wrap">
              {editingBio ? (
                <div className="bio-editor">
                  <textarea className="bio-input" value={bioInput} onChange={e => setBioInput(e.target.value)} maxLength={200} rows={3} placeholder="Write a short bio…" autoFocus />
                  <div className="bio-editor-actions">
                    <span className="bio-char">{bioInput.length}/200</span>
                    <button className="bio-cancel" onClick={() => { setEditingBio(false); setBioInput(profile?.bio || ''); }}>Cancel</button>
                    <button className="bio-save" onClick={saveBio} disabled={savingBio}>{savingBio ? '…' : 'Save'}</button>
                  </div>
                </div>
              ) : (
                <p className="profile-bio" onClick={() => setEditingBio(true)}>
                  {profile?.bio || <span className="bio-placeholder">Add a bio…</span>}
                </p>
              )}
            </div>
          </div>
        </div>
        {stats && (
          <div className="profile-stats">
            {[{ label: 'Total', value: stats.total }, { label: 'Films', value: stats.movie }, { label: 'Shows', value: stats.show }, { label: 'Books', value: stats.book }, { label: 'Games', value: stats.game }].map(s => (
              <div key={s.label} className="stat-pill"><span className="stat-val">{s.value}</span><span className="stat-lbl">{s.label}</span></div>
            ))}
          </div>
        )}
      </div>

      <section className="profile-section">
        <div className="section-header">
          <h2 className="section-title">Top 4</h2>
          {savingTop4 && <span className="saving-indicator">Saving…</span>}
        </div>
        <div className="top4-row">
          {[0, 1, 2, 3].map(i => {
            const item = top4[i];
            return (
              <div key={i} className="top4-slot">
                {item ? (
                  <div className="top4-item">
                    <div className="top4-cover" onClick={() => openPicker(i)} title="Change">
                      {item.cover_url ? <img src={item.cover_url} alt={item.title} /> : <div className="top4-placeholder" style={{ borderTop: `3px solid ${TYPE_COLORS[item.media_type]}` }}>{item.title?.[0]}</div>}
                      <div className="top4-overlay"><span>✎</span></div>
                    </div>
                    <button className="top4-remove" onClick={() => removeFromTop4(i)} title="Remove">✕</button>
                    <p className="top4-title">{item.title}</p>
                  </div>
                ) : (
                  <button className="top4-empty" onClick={() => openPicker(i)}><span className="top4-plus">+</span><span className="top4-add-label">Add</span></button>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {recent.length > 0 && (
        <section className="profile-section">
          <div className="section-header"><h2 className="section-title">Recent Activity</h2><span className="section-count">{recent.length} entries</span></div>
          <div className="recent-grid">
            {recent.map(log => (
              <Link key={log.id} to={`/media/${log.media_id}`} state={{ media: log }}>
                <div className="recent-item" title={`${log.title}${log.rating ? ` · ${log.rating} ★` : ''}`}>
                  {log.cover_url ? <img src={log.cover_url} alt={log.title} loading="lazy" /> : <div className="recent-placeholder" style={{ borderTop: `3px solid ${TYPE_COLORS[log.media_type]}` }}>{log.title?.[0]}</div>}
                  {typeof log.rating === 'number' && <div className="recent-rating" style={{ display: 'inline-flex', gap: '2px', paddingBottom: '4px' }}><RatingStars rating={log.rating} size={12} /></div>}
                  <div className="recent-type-dot" style={{ background: TYPE_COLORS[log.media_type] }} />
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="profile-section">
        <div className="profile-tabs">
          {TABS.map(t => {
            const count = logs.filter(l => l.status === t.key).length;
            return (
              <button key={t.key} className={`tab-btn ${activeTab === t.key ? 'active' : ''}`} onClick={() => setActiveTab(t.key)}>
                {t.label}{count > 0 && <span className="tab-count">{count}</span>}
              </button>
            );
          })}
        </div>
        <div className="log-list">
          {filteredLogs.length === 0 ? (
            <div className="empty-state"><p>{activeTab === 'completed' ? 'No completed entries yet.' : activeTab === 'in_progress' ? 'Nothing in progress.' : 'Your watchlist is empty.'}</p></div>
          ) : filteredLogs.map(log => (
            <article key={log.id} className="log-entry fade-in">
              <div className="log-cover">
                {log.cover_url ? <img src={log.cover_url} alt={log.title} loading="lazy" /> : <div className="log-cover-placeholder" style={{ borderTop: `2px solid ${TYPE_COLORS[log.media_type]}` }}>{log.title?.[0]}</div>}
              </div>
              <div className="log-body">
                <div className="log-top">
                  <div className="log-title-row"><h3 className="log-title">{log.title}</h3>{log.year && <span className="log-year">{log.year}</span>}</div>
                  <span className="log-type-badge" style={{ color: TYPE_COLORS[log.media_type], borderColor: TYPE_COLORS[log.media_type] + '40' }}>{TYPE_LABELS[log.media_type] || log.media_type}</span>
                </div>
                {log.creator && <p className="log-creator">{log.creator}</p>}
                {log.rating  ? <RatingStars rating={log.rating} readOnly size="sm" /> : null}
                {log.review  && <p className="log-review">"{log.review}"</p>}
                <div className="log-footer">
                  <span className="log-date">{new Date(log.logged_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                  <button className="log-delete" onClick={() => deleteLog(log.id)} disabled={deletingId === log.id}>{deletingId === log.id ? '…' : 'Remove'}</button>
                </div>
                {log.status === 'completed' && <ReviewInteractions log={log} />}
              </div>
            </article>
          ))}
        </div>
      </section>

      {pickerOpen && (
        <div className="picker-backdrop" onClick={() => setPickerOpen(false)}>
          <div className="picker-modal" onClick={e => e.stopPropagation()}>
            <div className="picker-header"><h3 className="picker-title">Pick for slot {pickerSlot + 1}</h3><button className="picker-close" onClick={() => setPickerOpen(false)}>✕</button></div>
            <input className="picker-search" placeholder="Search your logs…" value={pickerSearch} onChange={e => setPickerSearch(e.target.value)} autoFocus />
            <div className="picker-grid">
              {pickerResults.length === 0 ? <p className="picker-empty">No results</p> : pickerResults.map(log => (
                <div key={log.id} className={`picker-item ${top4.some(t => t.id === log.id) ? 'already-picked' : ''}`} onClick={() => pickLog(log)} title={log.title}>
                  {log.cover_url ? <img src={log.cover_url} alt={log.title} loading="lazy" /> : <div className="picker-placeholder" style={{ borderTop: `3px solid ${TYPE_COLORS[log.media_type]}` }}>{log.title?.[0]}</div>}
                  <div className="picker-item-title">{log.title}</div>
                  {top4.some(t => t.id === log.id) && <div className="picker-check">✓</div>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
