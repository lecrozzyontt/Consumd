import { useNavigate } from 'react-router-dom';
import './MediaCard.css';

const TYPE_COLORS = {
  movie: '#c9a84c',
  show:  '#60a5fa',
  book:  '#4ade80',
  game:  '#c084fc',
};

export default function MediaCard({ media, onLog }) {
  const navigate = useNavigate();

  const imageUrl  = media.cover_url || media.coverImage || null;
  const title     = media.title || 'Unknown';
  const year      = media.year || '';
  const typeColor = TYPE_COLORS[media.media_type] || 'var(--accent)';

  return (
    <div className="media-card" onClick={() => navigate('/media', { state: { media } })}>
      <div className="media-image">
        {imageUrl ? (
          <img src={imageUrl} alt={title} loading="lazy" />
        ) : (
          <div className="media-placeholder">
            <span>{title[0]}</span>
          </div>
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
              {media.media_type}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}