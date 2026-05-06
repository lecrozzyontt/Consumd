import { useState } from 'react';
import './Avatar.css';

/**
 * Reusable avatar that prefers the user's profile picture and falls back
 * to a colored circle with their first initial. One component, one source
 * of truth for how a user is rendered everywhere in the app.
 *
 * Props:
 *   url       — profile picture URL (avatar_url). Optional.
 *   username  — used for the fallback initial and alt text.
 *   size      — number (px) or one of 'xs' | 'sm' | 'md' | 'lg' | 'xl'. Default 'md'.
 *   className — extra classes for layout overrides.
 *   style     — inline style overrides (e.g. custom border).
 */
const SIZE_PX = { xs: 22, sm: 28, md: 36, lg: 48, xl: 76 };

export default function Avatar({
  url,
  username,
  size = 'md',
  className = '',
  style = {},
}) {
  const [broken, setBroken] = useState(false);

  const px = typeof size === 'number' ? size : (SIZE_PX[size] || SIZE_PX.md);
  const initial = (username?.[0] || '?').toUpperCase();
  const showImage = url && !broken;

  const dimStyle = {
    width:  `${px}px`,
    height: `${px}px`,
    fontSize: `${Math.max(10, Math.round(px * 0.42))}px`,
    ...style,
  };

  return (
    <div
      className={`app-avatar ${className}`}
      style={dimStyle}
      title={username || ''}
      aria-label={username ? `${username}'s avatar` : 'avatar'}
    >
      {showImage ? (
        <img
          src={url}
          alt={username || ''}
          loading="lazy"
          onError={() => setBroken(true)}
        />
      ) : (
        <span className="app-avatar-initial">{initial}</span>
      )}
    </div>
  );
}