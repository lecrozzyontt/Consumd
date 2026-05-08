import { Link, useLocation } from 'react-router-dom';
import NotificationsBell from './NotificationsBell';
import './Navbar.css';

/**
 * Navbar icons — custom-drawn so each route has its own visual
 * identity rather than a stock house / magnifier / silhouette.
 *
 *   Home      → asymmetric tile grid (your media dashboard)
 *   Discover  → compass needle (exploration)
 *   Social    → overlapping speech bubbles (conversations)
 *   Profile   → user (your collection)
 */
const NAV_ITEMS = [
  {
    path: '/',
    label: 'Home',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3"  y="3"  width="8"  height="10" rx="1.5" />
        <rect x="13" y="3"  width="8"  height="6"  rx="1.5" />
        <rect x="13" y="11" width="8"  height="10" rx="1.5" />
        <rect x="3"  y="15" width="8"  height="6"  rx="1.5" />
      </svg>
    ),
  },
  {
    path: '/discover',
    label: 'Discover',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        {/* compass needle: filled diamond, rotated */}
        <path d="M12 5.5 L14 12 L12 18.5 L10 12 Z" fill="currentColor" stroke="none" />
        <circle cx="12" cy="12" r="1.2" fill="var(--bg, #131E32)" stroke="none" />
      </svg>
    ),
  },
  {
    path: '/social',
    label: 'Social',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {/* back bubble */}
        <path d="M16 4h3a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-1v3l-3-3" />
        {/* front bubble */}
        <path d="M3 9a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H7l-4 3z" />
      </svg>
    ),
  },
  {
    path: '/profile',
    label: 'Profile',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="9" r="4" />
        <path d="M4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5" />
      </svg>
    ),
  },
];

export default function Navbar() {
  const { pathname } = useLocation();

  const isActive = (path) =>
    path === '/' ? pathname === '/' : pathname.startsWith(path);

  return (
    <header className="navbar">
      <div className="navbar-inner">
        <Link to="/" className="navbar-brand">
          <span className="brand-text">Consumd</span>
        </Link>
          <nav className="navbar-links">
            {NAV_ITEMS.map(({ path, label, icon }) => (
              <Link
                key={path}
                to={path}
                className={`nav-item ${isActive(path) ? 'active' : ''}`}
              >
                <span className="nav-icon">{icon}</span>
                <span className="nav-label">{label}</span>
              </Link>
            ))}
            <NotificationsBell />
          </nav>
      </div>
    </header>
  );
}