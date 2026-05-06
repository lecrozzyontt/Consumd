import { useState } from 'react';
import './RatingStars.css';

export default function RatingStars({ rating = 0, setRating, readOnly = false, size = 'md' }) {
  const [hovered, setHovered] = useState(0);

  const handleMouseMove = (e, i) => {
    if (readOnly) return;
    const { left, width } = e.currentTarget.getBoundingClientRect();
    const isHalf = e.clientX - left < width / 2;
    setHovered(isHalf ? i - 0.5 : i);
  };

  const handleClick = (e, i) => {
    if (readOnly) return;
    const { left, width } = e.currentTarget.getBoundingClientRect();
    const isHalf = e.clientX - left < width / 2;
    const newVal = isHalf ? i - 0.5 : i;
    setRating(newVal === rating ? 0 : newVal);
  };

  const displayRating = hovered > 0 ? hovered : rating;

  return (
    <div 
      className={`rating-stars rating-stars--${size} ${readOnly ? 'readonly' : ''}`}
      onMouseLeave={() => !readOnly && setHovered(0)}
    >
      {[1, 2, 3, 4, 5].map(i => {
        const isFull = displayRating >= i;
        const isHalf = displayRating === i - 0.5;

        return (
          <button
            key={i}
            type="button"
            className={`star ${isFull ? 'filled' : isHalf ? 'half' : 'empty'}`}
            onClick={(e) => handleClick(e, i)}
            onMouseMove={(e) => handleMouseMove(e, i)}
            disabled={readOnly}
            aria-label={`Rate ${i} star${i > 1 ? 's' : ''}`}
            style={{ position: 'relative', display: 'inline-flex', padding: 0 }}
          >
            {/* Background empty star */}
            <span style={{ opacity: isFull ? 0 : 1 }}>★</span>

            {/* Foreground half or full star overlay */}
            {(isFull || isHalf) && (
              <span 
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  width: isHalf ? '50%' : '100%',
                  overflow: 'hidden',
                  color: isHalf ? 'var(--accent, #FFD700)' : 'inherit', // Uses your CSS var if available
                  pointerEvents: 'none'
                }}
              >
                ★
              </span>
            )}
          </button>
        );
      })}
      {rating > 0 && !readOnly && (
        <span className="rating-label">{rating}/5</span>
      )}
    </div>
  );
}