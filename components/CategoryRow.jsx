import MediaCard from './MediaCard';
import './CategoryRow.css';

export default function CategoryRow({ title, items = [], onLog }) {
  if (!items.length) return null;

  return (
    <section className="category-row">
      {title && <h2 className="row-title">{title}</h2>}
      <div className="media-scroll">
        {items.map((item, index) => (
          <MediaCard 
            key={item.id || item.external_id ? `${item.media_type}-${item.id || item.external_id}` : index} 
            media={item} 
            onLog={onLog} 
          />
        ))}
      </div>
    </section>
  );
}