import MediaCard from './MediaCard';
import './CategoryRow.css';

/**
 * CategoryRow
 *
 * Renders a horizontally scrollable row of media cards.
 *
 * Performance:
 * - First 4 items get loading="eager" so they appear immediately above the fold
 * - Remaining items get loading="lazy" so the browser only fetches them when
 *   the user scrolls — prevents 20 simultaneous image requests per row
 */
export default function CategoryRow({ title, items = [], onLog }) {
  if (!items.length) return null;

  return (
    <section className="category-row">
      {title && <h2 className="row-title">{title}</h2>}
      <div className="media-scroll">
        {items.map((item, index) => (
          <MediaCard
            key={
              item.id || item.external_id
                ? `${item.media_type}-${item.id || item.external_id}`
                : index
            }
            media={item}
            onLog={onLog}
            // Eagerly load first 4 — they're visible immediately
            // Everything else is lazy — only loads when scrolled into view
            imageLoading={index < 4 ? 'eager' : 'lazy'}
          />
        ))}
      </div>
    </section>
  );
}
