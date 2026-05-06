import { useEffect, useRef } from 'react';

/**
 * Calls `callback` whenever the app returns to the foreground
 * (tab becomes visible / PWA resumes from background).
 *
 * Uses a ref so the callback can change on every render without
 * causing the event listener to be re-registered.
 */
export function useOnFocus(callback) {
  const savedCallback = useRef(callback);

  useEffect(() => {
    savedCallback.current = callback;
  });

  useEffect(() => {
    const handle = () => {
      if (document.visibilityState === 'visible') {
        savedCallback.current();
      }
    };
    document.addEventListener('visibilitychange', handle);
    return () => document.removeEventListener('visibilitychange', handle);
  }, []);
}
