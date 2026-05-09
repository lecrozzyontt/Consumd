import { useParams } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from '../context/AuthContext';
import ReviewInteractions from '../components/ReviewInteractions';
import Avatar from '../components/Avatar';
import ReportModal from '../components/ReportModal';
import './ReviewDetailPage.css';

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

export default function ReviewDetailPage() {
  const { logId } = useParams();
  const { user }  = useAuth();

  const [log, setLog]           = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const menuRef = useRef(null);
  const mounted = useRef(true);

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

  useEffect(() => { fetchLog(); }, [logId]);

  async function fetchLog() {
    if (!mounted.current) return;
    setLoading(true);
    setError(false);

    try {
      const { data, error: fetchErr } = await withTimeout(
        supabase
          .from('logs')
          .select('*, profiles(id, username, avatar_url)')
          .eq('id', logId)
          .single()
      );

      if (fetchErr) throw fetchErr;
      if (mounted.current) setLog(data);
    } catch (e) {
      console.error('[ReviewDetail] fetchLog failed:', e);
      if (mounted.current) setError(true);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }

  if (loading) return (
    <div className="review-detail-page page-wrapper">
      <div className="loading-center"><div className="spinner" /></div>
    </div>
  );

  if (error) return (
    <div className="review-detail-page page-wrapper">
      <div className="error-state">
        <p>Couldn't load this review. Check your connection.</p>
        <button className="retry-btn" onClick={fetchLog}>Try Again</button>
      </div>
    </div>
  );

  if (!log) return (
    <div className="review-detail-page page-wrapper">
      <p>Review not found.</p>
    </div>
  );

  const typeColor = TYPE_COLORS[log.media_type] || 'var(--accent)';
  const typeLabel = TYPE_LABELS[log.media_type] || log.media_type;
  const isOwnLog  = user?.id === log.user_id;
  const authorId  = log.profiles?.id || log.user_id;

  return (
    <div className="review-detail-page page-wrapper fade-in">
      <div className="review-detail-container">

        <div className="review-cover">
          {log.cover_url ? (
            <img src={log.cover_url} alt={log.title} />
          ) : (
            <div className="review-cover-placeholder" style={{ borderTop: `4px solid ${typeColor}` }}>
              {log.title?.[0]}
            </div>
          )}
        </div>

        <div className="review-content">
          <div className="review-header">
            <div className="review-user">
              <Avatar url={log.profiles?.avatar_url} username={log.profiles?.username} size={42} className="review-avatar" />
              <div className="review-user-info">
                <h2 className="review-username">{log.profiles?.username}</h2>
                <span className="review-date">
                  {new Date(log.logged_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span className="review-type" style={{ color: typeColor }}>{typeLabel}</span>
              {!isOwnLog && user && (
                <div className="kebab-wrap" ref={menuRef}>
                  <button className="kebab-btn" onClick={() => setMenuOpen(o => !o)} aria-label="More options">···</button>
                  {menuOpen && (
                    <div className="kebab-menu">
                      <button onClick={() => { setMenuOpen(false); setReportOpen(true); }}>🚩 Report Review</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <h1 className="review-title">{log.title}</h1>
          {log.creator && <p className="review-creator">{log.creator}</p>}

          {typeof log.rating === 'number' && (
            <div className="review-rating">
              {Array.from({ length: 5 }).map((_, i) => (
                <span key={i} className={i < log.rating ? 'star-filled' : 'star-empty'}>★</span>
              ))}
              <span className="rating-text">{log.rating}/5</span>
            </div>
          )}

          {log.review && <div className="review-text"><p>{log.review}</p></div>}

          {log.status === 'completed' && (
            <div className="review-interactions-wrap">
              <ReviewInteractions log={log} />
            </div>
          )}
        </div>
      </div>

      <ReportModal isOpen={reportOpen} onClose={() => setReportOpen(false)}
        contentId={log.id} contentType="review" reportedUserId={authorId} />
    </div>
  );
}
