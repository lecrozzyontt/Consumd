import { useNavigate } from 'react-router-dom';
import ReviewInteractions from './ReviewInteractions';
import Avatar from './Avatar';
import './ActivityCard.css';

const STATUS_LABELS = {
  completed:   'Completed',
  in_progress: 'In Progress',
  want:        'Want to Consume',
};

const TYPE_LABELS = {
  movie: 'Film',
  show:  'Show',
  book:  'Book',
  game:  'Game',
};

const TYPE_COLORS = {
  movie: '#c9a84c',
  show:  '#60a5fa',
  book:  '#4ade80',
  game:  '#c084fc',
};

export default function ActivityCard({ activity, hideInteractions = false }) {
  const navigate = useNavigate();
  const {
    id,
    username,
    avatar_url,
    title,
    media_type,
    cover_url,
    rating,
    review,
    status,
    logged_at,
  } = activity;

  const timeAgo = getTimeAgo(logged_at);
  const typeColor = TYPE_COLORS[media_type] || 'var(--accent)';
  const typeLabel = TYPE_LABELS[media_type] || media_type;

  return (
    <article className="activity-card fade-in">
      <div className="activity-cover">
        {cover_url ? (
          <img src={cover_url} alt={title} loading="lazy" />
        ) : (
          <div className="activity-cover-placeholder">
            <span>{title?.[0] || '?'}</span>
          </div>
        )}
      </div>

      <div className="activity-body">
        <div className="activity-header">
          <div className="activity-user-row">
            <Avatar url={avatar_url} username={username} size={22} />
            <span className="activity-username">{username}</span>
            <span className="activity-dot">·</span>
            <span className="activity-time">{timeAgo}</span>
          </div>
          <span className="activity-type" style={{ color: typeColor }}>
            {typeLabel}
          </span>
        </div>

        <h4 className="activity-title">{title}</h4>

        {rating && (
          <div className="activity-stars">
            {Array.from({ length: 5 }).map((_, i) => (
              <span key={i} className={i < rating ? 'star-filled' : 'star-empty'}>★</span>
            ))}
          </div>
        )}

        {status && (
          <span className="activity-status">{STATUS_LABELS[status] || status}</span>
        )}

        {review && <p className="activity-review">"{review}"</p>}

        {status === 'completed' && !hideInteractions && <ReviewInteractions log={activity} />}
      </div>
    </article>
  );
}

function getTimeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
