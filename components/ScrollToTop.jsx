import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export default function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    const forceScrollTop = () => {
      // 1. Reset standard window/document scrolling
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      document.body.scrollTop = 0;
      document.documentElement.scrollTop = 0;

      // 2. Reset scrolling on any internal layout containers
      const containers = document.querySelectorAll(
        '#root, .app-container, .main-content, .page-wrapper, main'
      );
      containers.forEach(container => {
        container.scrollTop = 0;
      });
    };

    // Try immediately
    forceScrollTop();

    // Try again after React finishes painting the new DOM
    setTimeout(forceScrollTop, 0);
    setTimeout(forceScrollTop, 50);

  }, [pathname]);

  return null;
}