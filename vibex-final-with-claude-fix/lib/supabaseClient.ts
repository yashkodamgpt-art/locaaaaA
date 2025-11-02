
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://rblpwmgbuqjwevqngqkm.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJibHB3bWdidXFqd2V2cW5ncWttIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIwMjQ1MTMsImV4cCI6MjA3NzYwMDUxM30.kF7KQQCqpEQUCJl6PNFAY0kyZy_4qqHbdyW3YFsH6YY';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});

const clearStaleSessionData = () => {
    // Supabase's JS client stores the session in a key like `sb-<project_ref>-auth-token`
    Object.keys(localStorage).forEach(key => {
        if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
            console.log(`Removing stale Supabase auth token: ${key}`);
            localStorage.removeItem(key);
        }
    });
};

// Function to check session validity and clear if necessary
export const validateAndCleanSession = () => {
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
      const item = localStorage.getItem(key);
      if (item) {
        try {
          const session = JSON.parse(item);
          const isExpired = session.expires_at && session.expires_at < Date.now() / 1000;
          const isUnauthenticated = !session.user || session.user.aud !== 'authenticated';

          if (isExpired || isUnauthenticated) {
            console.warn('⚠️ Stale or invalid session detected. Cleaning up.');
            localStorage.removeItem(key);
            i--; // Decrement i because removeItem will shift indices
          }
        } catch (e) {
          console.error('🚨 Error parsing session data, removing item:', e);
          localStorage.removeItem(key);
          i--; // Decrement i because removeItem will shift indices
        }
      }
    }
  }
};

// Refresh session when app becomes visible
if (typeof window !== 'undefined') {
    document.addEventListener('visibilitychange', async () => {
        if (document.visibilityState === 'visible') {
            console.log('🔄 App became visible, validating session...');
            await supabase.auth.getSession();
        }
    });
}
