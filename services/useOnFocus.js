import { useEffect, useRef } from 'react';

/**
 * Calls `callback` whenever the app/tab returns to the foreground.
 * The callback should be a SILENT refresh — do not call setLoading(true)
 * inside it, so existing content stays visible while data refreshes.
 */
export function useOnFocus(callback) {
  const savedCallback = useRef(callback);

  useEffect(() => {
    savedCallback.current = callback;
  });

  useEffect(() => {
    const handle = () => {
      if (document.visibilityState === 'visible') {
        // Add a 150ms delay to let the browser network stack wake up
        setTimeout(() => {
          if (savedCallback.current) savedCallback.current();
        }, 150);
      }
    };
    document.addEventListener('visibilitychange', handle);
    return () => document.removeEventListener('visibilitychange', handle);
  }, []);
}