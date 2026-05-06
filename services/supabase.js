import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: window.localStorage,
    // This bypasses the browser's Web Locks API, fixing the PWA freezing issue 
    // when returning from the background.
    lock: async (name, acquireTimeout, fn) => fn(),
  }
});

// Globally pause Supabase auth timers when the tab sleeps, 
// and jumpstart them when the tab wakes up. 
// This prevents ALL app-wide database fetches from hanging.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      supabase.auth.startAutoRefresh();
      // Force a fast wakeup call so pending fetches can resolve
      setTimeout(() => supabase.auth.getSession(), 100);
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}