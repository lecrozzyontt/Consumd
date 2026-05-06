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
        savedCallback.current();
      }
    };
    document.addEventListener('visibilitychange', handle);
    return () => document.removeEventListener('visibilitychange', handle);
  }, []);
}
