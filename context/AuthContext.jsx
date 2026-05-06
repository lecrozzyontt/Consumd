import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../services/supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const u = session?.user ?? null;
      setUser(u);
      setLoading(false);
      if (u) await ensureProfile(u.id, u);
    };

    initSession();

    const { data: { subscription } } =
      supabase.auth.onAuthStateChange(async (event, session) => {
        const u = session?.user ?? null;
        setUser(u);
        setLoading(false);
        if (u) {
          await ensureProfile(u.id, u);
        } else {
          setProfile(null);
        }
      });

    // Re-check session whenever the PWA comes back to the foreground.
    // On iOS, backgrounding suspends JS — on resume auth state may be stale.
    // Spreading the user object ensures a new reference so any useEffect([user])
    // in pages re-fires and reloads its data.
    const handleVisibility = async () => {
      if (document.visibilityState === 'visible') {
        const { data: { session } } = await supabase.auth.getSession();
        const u = session?.user ?? null;
        setUser(u ? { ...u } : null);
        if (u) await ensureProfile(u.id, u);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      subscription.unsubscribe();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  /**
   * SAFE PROFILE CREATION (ONLY PLACE THAT WRITES PROFILE FOR OAUTH/FALLBACK)
   * For email signup, the profile is inserted directly in signUp() with the
   * correct username — this function just loads it if it already exists, or
   * creates a fallback for OAuth users who have no username input.
   */
  async function ensureProfile(userId, authUser = null) {
    try {
      const { data: existing, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        console.error('[ensureProfile] fetch error:', error);
        return;
      }

      // If profile exists → check if the username needs correcting.
      // user_metadata.username is set from the signup form and is always the
      // intended value. If the stored username looks like an email prefix
      // (i.e. it was auto-generated instead of using what the user typed),
      // update it now so the account self-heals on next login.
      if (existing) {
        const metaUsername = authUser?.user_metadata?.username;
        if (metaUsername && metaUsername !== existing.username) {
          const { data: fixed, error: fixError } = await supabase
            .from('profiles')
            .update({ username: metaUsername })
            .eq('id', userId)
            .select()
            .single();

          if (fixError) {
            console.error('[ensureProfile] username fix error:', fixError);
            setProfile(existing); // fall back to what we have
          } else {
            console.log('[ensureProfile] fixed username:', existing.username, '→', metaUsername);
            setProfile(fixed);
          }
        } else {
          setProfile(existing);
        }
        return;
      }

      // Fallback: only reached for OAuth users (no username input)
      const username =
        authUser?.user_metadata?.username ||
        authUser?.user_metadata?.full_name?.replace(/\s+/g, '_').toLowerCase() ||
        authUser?.email?.split('@')[0] ||
        `user_${userId.slice(0, 6)}`;

      const { data: newProfile, error: insertError } = await supabase
        .from('profiles')
        .insert([
          {
            id: userId,
            username,
            created_at: new Date().toISOString(),
          },
        ])
        .select()
        .single();

      if (insertError) {
        console.error('[ensureProfile] insert error:', insertError);
        return;
      }

      setProfile(newProfile);
    } catch (err) {
      console.error('[ensureProfile] crash:', err);
    }
  }

  /**
   * SIGN UP
   * Profile is inserted HERE with the exact username the user typed,
   * before onAuthStateChange can race and fall back to the email prefix.
   */
  async function signUp(email, password, username) {
    const cleanUsername = username?.trim();

    if (!cleanUsername) {
      throw new Error('Username is required');
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username: cleanUsername,
        },
      },
    });

    if (error) throw error;

    // Insert the profile immediately using the username from the form.
    // upsert is safe — if onAuthStateChange already ran, it won't duplicate.
    if (data.user) {
      const { data: newProfile, error: profileError } = await supabase
        .from('profiles')
        .upsert([
          {
            id: data.user.id,
            username: cleanUsername,
            created_at: new Date().toISOString(),
          },
        ])
        .select()
        .single();

      if (profileError) {
        console.error('[signUp] profile upsert error:', profileError);
      } else {
        setProfile(newProfile);
      }
    }

    return data;
  }

  /**
   * SIGN IN
   */
  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;

    if (data.user) {
      await ensureProfile(data.user.id, data.user);
    }

    return data;
  }

  /**
   * SIGN OUT
   */
  async function signOut() {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
  }

  /**
   * UPDATE PROFILE
   */
  async function updateProfile(updates) {
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', user.id)
      .select()
      .single();

    if (error) throw error;

    setProfile(data);
    return data;
  }

  /**
   * FETCH PROFILE
   */
  async function fetchProfile(userId) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.error('[fetchProfile]', error);
      return null;
    }

    setProfile(data);
    return data;
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        signUp,
        signIn,
        signOut,
        updateProfile,
        fetchProfile,
        ensureProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
