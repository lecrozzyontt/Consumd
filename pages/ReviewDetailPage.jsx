import { useParams, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import ReviewInteractions from '../components/ReviewInteractions';
import Avatar from '../components/Avatar';
import './ReviewDetailPage.css';

const TYPE_COLORS = {
  movie:   '#c9a84c',
  show:    '#60a5fa',
  season:  '#60a5fa',
  episode: '#60a5fa',
  book:    '#4ade80',
  game:    '#c084fc',
};

export default function ReviewDetailPage() {
  const { logId } = useParams();
  const { state } = useLocation();
  const [log, setLog] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLog();
  }, [logId]);

  async function fetchLog() {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('logs')
        .select('*, profiles(username, avatar_url)')
        .eq('id', logId)
        .single();
      setLog(data);
    } catch (e) {
      console.error('fetchLog error:', e);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return (
    <div className="review-detail-page page-wrapper">
      <div className="loading-center"><div className="spinner" /></div>
    </div>
  );

  if (!log) return (
    <div className="review-detail-page page-wrapper">
      <p>Review not found</p>
    </div>
  );

  const typeColor = TYPE_COLORS[log.media_type] || 'var(--accent)';

  return (
    <div className="review-detail-page page-wrapper fade-in">
      <div className="review-detail-container">
        
        {/* Cover */}
        <div className="review-cover">
          {log.cover_url ? (
            <img src={log.cover_url} alt={log.title} />
          ) : (
            <div className="review-cover-placeholder" style={{ borderTop: `4px solid ${typeColor}` }}>
              {log.title?.[0]}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="review-content">
          <div className="review-header">
            <div className="review-user">
              <Avatar
                url={log.profiles?.avatar_url}
                username={log.profiles?.username}
                size={42}
                className="review-avatar"
              />
              <div className="review-user-info">
                <h2 className="review-username">{log.profiles?.username}</h2>
                <span className="review-date">
                  {new Date(log.logged_at).toLocaleDateString('en-US', { 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                  })}
                </span>
              </div>
            </div>
            <span className="review-type" style={{ color: typeColor }}>
              {log.media_type}
            </span>
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

          {log.review && (
            <div className="review-text">
              <p>{log.review}</p>
            </div>
          )}

          {log.status === 'completed' && (
            <div className="review-interactions-wrap">
              <ReviewInteractions log={log} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}