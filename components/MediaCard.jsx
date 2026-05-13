import { useNavigate } from 'react-router-dom';
import './MediaCard.css';

const TYPE_LABELS = {
  movie:   'Film',
  show:    'Show',
  book:    'Book',
  game:    'Game',
  episode: 'Episode',
  season:  'Season',
};

const TYPE_COLORS = {
  movie:   '#c9a84c',
  show:    '#60a5fa',
  book:    '#4ade80',
  game:    '#c084fc',
  episode: '#60a5fa',
  season:  '#60a5fa',
};

export default function MediaCard({ media, onLog, imageLoading = 'lazy' }) {
  const navigate = useNavigate();

  const imageUrl  = media.cover_url || media.coverImage || null;
  const title     = media.title || 'Unknown';
  const year      = media.year  || '';
  const typeColor = TYPE_COLORS[media.media_type] || 'var(--accent)';
  const typeLabel = TYPE_LABELS[media.media_type] || media.media_type;

  function handleClick() {
    navigate('/media', { state: { media } });
  }

  return (
    <div className="media-card" onClick={handleClick}>
      <div className="media-image">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={title}
            loading={imageLoading}
            decoding="async"
          />
        ) : (
          <div className="media-placeholder">
            <span>{title[0]}</span>
          </div>
        )}

        {/* Episode badge — shown on next-episode row cards */}
        {media.episode_badge && (
          <div className="episode-badge">{media.episode_badge}</div>
        )}

        <div className="media-overlay">
          <span className="overlay-view">View</span>
        </div>
      </div>

      <div className="media-info">
        <h3 title={title}>{title}</h3>
        <div className="media-meta">
          {year && <span className="meta-year">{year}</span>}
          {media.media_type && (
            <span className="meta-type" style={{ color: typeColor }}>
              {typeLabel}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
