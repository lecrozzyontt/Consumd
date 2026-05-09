import { useState } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from '../context/AuthContext';
import RatingStars from './RatingStars';
import './LogModal.css';

const SAVE_TIMEOUT_MS = 10000;

function withTimeout(promise, ms = SAVE_TIMEOUT_MS) {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Request timed out')), ms)
  );
  return Promise.race([promise, timeout]);
}

const TYPE_LABELS = {
  movie:   'Film',
  show:    'Show',
  season:  'Season',
  episode: 'Episode',
  book:    'Book',
  game:    'Game',
};

export default function LogModal({ media, onClose, onSaved }) {
  const { user } = useAuth();

  const todayStr = new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
    .toISOString().split('T')[0];

  const [rating, setRating]         = useState(0);
  const [notes, setNotes]           = useState('');
  const [status, setStatus]         = useState('completed');
  const [loggedDate, setLoggedDate] = useState(todayStr);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');

  if (!media) return null;

  const handleSave = async () => {
    if (!user) { setError('Not authenticated.'); return; }

    setLoading(true);
    setError('');

    try {
      const finalDate = new Date(`${loggedDate}T12:00:00`).toISOString();

      const { error: saveError } = await withTimeout(
        supabase.from('logs').insert([{
          user_id:     user.id,
          title:       media.title || '',
          media_type:  media.media_type || 'movie',
          creator:     media.creator || '',
          year:        media.year ? parseInt(media.year) : null,
          cover_url:   media.cover_url || media.coverImage || null,
          genre:       media.genre || '',
          external_id: media.external_id || '',
          rating:      rating > 0 ? rating : null,
          review:      notes.trim() || null,
          status:      status || 'completed',
          logged_at:   finalDate,
        }])
      );

      if (saveError) throw saveError;
      if (onSaved) onSaved();
      else onClose();
    } catch (err) {
      console.error('[LogModal] save failed:', err);
      const isTimeout = err.message === 'Request timed out';
      setError(isTimeout
        ? 'Save timed out — check your connection and try again.'
        : (err.message || 'Something went wrong.')
      );
    } finally {
      setLoading(false);
    }
  };

  const STATUS_OPTIONS = [
    { value: 'completed',   label: '✓ Completed'       },
    { value: 'in_progress', label: '▶ In Progress'      },
    { value: 'want',        label: '＋ Want to Consume' },
  ];

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal fade-in">
        <button className="modal-close" onClick={onClose}>✕</button>

        <div className="modal-header">
          {media.cover_url ? (
            <img className="modal-cover" src={media.cover_url} alt={media.title} />
          ) : (
            <div className="modal-cover-placeholder">{media.title?.[0]}</div>
          )}
          <div className="modal-meta">
            <span className="modal-type">{TYPE_LABELS[media.media_type] || media.media_type}</span>
            <h2 className="modal-title">{media.title}</h2>
            {media.year    && <p className="modal-year">{media.year}</p>}
            {media.creator && <p className="modal-creator">{media.creator}</p>}
          </div>
        </div>

        <div className="modal-body">
          <div className="field-group">
            <label>Status</label>
            <div className="status-buttons">
              {STATUS_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  className={`status-btn ${status === opt.value ? 'active' : ''}`}
                  onClick={() => setStatus(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="field-group-row">
            <div className="field-group" style={{ flex: 1 }}>
              <label>Date Logged</label>
              <input
                type="date"
                className="log-date-input"
                value={loggedDate}
                onChange={(e) => setLoggedDate(e.target.value)}
                required
              />
            </div>
            <div className="field-group" style={{ flex: 1 }}>
              <label>Your Rating</label>
              <div className="rating-wrap-center">
                <RatingStars rating={rating} setRating={setRating} size="lg" />
              </div>
            </div>
          </div>

          <div className="field-group">
            <label>Notes <span>(optional)</span></label>
            <textarea
              placeholder="What did you think?"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              maxLength={500}
            />
            <span className="char-count">{notes.length}/500</span>
          </div>

          {error && (
            <div className="modal-error">
              <p>{error}</p>
              <button className="retry-btn" onClick={handleSave} disabled={loading}>Try Again</button>
            </div>
          )}

          <div className="modal-actions">
            <button className="btn-cancel" onClick={onClose} disabled={loading}>Cancel</button>
            <button className="btn-save" onClick={handleSave} disabled={loading}>
              {loading ? <span className="btn-spinner" /> : 'Save to Log'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
