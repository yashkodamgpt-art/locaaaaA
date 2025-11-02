
import React, { useState, useEffect, useCallback } from 'react';
import type { User } from './types';
import Login from './components/auth/Login';
import SignUp from './components/auth/SignUp';
import MainApp from './MainApp';
import { supabase, validateAndCleanSession } from './lib/supabaseClient';

type AuthView = 'login' | 'signup';

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authView, setAuthView] = useState<AuthView>('login');
  const [loading, setLoading] = useState(true);
  const [initComplete, setInitComplete] = useState(false);

  const loadUserProfile = useCallback(async (authUser: any) => {
    if (authUser.aud !== 'authenticated') {
      console.log('User session detected, but email not confirmed.');
      setCurrentUser(null);
      return;
    }
    console.log(`📥 Loading profile for: ${authUser.id}`);
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authUser.id)
      .maybeSingle();

    if (error) {
      console.error("Error fetching profile:", error.message);
      setCurrentUser(null);
    } else if (profile) {
      console.log(`✅ Profile loaded: ${profile.username}`);
      setCurrentUser({
        id: authUser.id,
        email: authUser.email,
        profile: {
          username: profile.username,
          bio: profile.bio,
          privacy: profile.privacy,
        }
      });
    } else {
      const newUsername = authUser.user_metadata?.username;
      if (newUsername) {
        console.warn(`Profile for user ${authUser.id} not found. Attempting to create one.`);
        const { data: newProfile, error: insertError } = await supabase
          .from('profiles')
          .insert({
            id: authUser.id,
            username: newUsername,
            bio: authUser.user_metadata?.bio || '',
            privacy: authUser.user_metadata?.privacy || 'public',
          })
          .select()
          .single();

        if (insertError) {
          console.error("Error creating profile fallback:", insertError.message);
          setCurrentUser(null);
        } else if (newProfile) {
          console.log("Successfully created fallback profile.");
          setCurrentUser({
            id: authUser.id,
            email: authUser.email,
            profile: {
              username: newProfile.username,
              bio: newProfile.bio,
              privacy: newProfile.privacy,
            }
          });
        }
      } else {
        console.error(`No profile found for user ${authUser.id} and username not found in metadata.`);
        setCurrentUser(null);
      }
    }
  }, []);

  useEffect(() => {
    console.log('🔄 Initializing authentication...');
    setLoading(true);
    setInitComplete(false);

    // Validate session on startup to prevent getting stuck on stale data
    validateAndCleanSession();

    const timer = setTimeout(() => {
        if (!initComplete) {
            console.warn('⏰ Auth initialization timeout after 3 seconds.');
            setLoading(false);
            setInitComplete(true); // Mark init as complete to unblock UI
        }
    }, 3000);

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        console.log(`✅ Found existing session: ${session.user.id}`);
        await loadUserProfile(session.user);
      } else {
        setCurrentUser(null);
      }
    }).catch((err) => {
        console.error("Error getting session on initial load:", err);
    }).finally(() => {
        clearTimeout(timer);
        if (!initComplete) {
            setLoading(false);
            setInitComplete(true);
        }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log(`🔔 Auth state changed: ${event}`);
      if (event === 'INITIAL_SESSION') return;

      if (session?.user) {
        await loadUserProfile(session.user);
      } else {
        setCurrentUser(null);
      }
      if (!initComplete) {
          setLoading(false);
          setInitComplete(true);
      }
    });

    return () => {
      subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, [loadUserProfile]);
  
  const handleLogout = async () => {
    console.log('👋 Logging out...');
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) {
        console.error('Error logging out:', error);
    } else {
        // Also manually clear any related local storage as a fallback
        Object.keys(localStorage).forEach(key => {
            if (key.startsWith('sb-')) {
                localStorage.removeItem(key);
            }
        });
        console.log('✅ Logged out successfully');
    }
    setCurrentUser(null);
    setAuthView('login');
  };

  const handleProfileUpdate = async (updatedProfile: User['profile']) => {
      if (!currentUser) return;
      const { data, error } = await supabase
        .from('profiles')
        .update({
            bio: updatedProfile.bio,
            privacy: updatedProfile.privacy,
        })
        .eq('id', currentUser.id)
        .select()
        .single();
    
      if (error) {
          console.error("Error updating profile:", error);
      } else if (data) {
          setCurrentUser(prevUser => prevUser ? { ...prevUser, profile: { ...prevUser.profile, bio: data.bio, privacy: data.privacy } } : null);
      }
  };

  if (loading && !initComplete) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-green-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Initializing...</p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    if (authView === 'login') {
      return <Login switchToSignUp={() => setAuthView('signup')} />;
    } else {
      return <SignUp switchToLogin={() => setAuthView('login')} />;
    }
  }

  return <MainApp user={currentUser} onLogout={handleLogout} onProfileUpdate={handleProfileUpdate} />;
};

export default App;
