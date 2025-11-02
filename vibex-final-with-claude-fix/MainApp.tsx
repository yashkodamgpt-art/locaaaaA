
import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { User, Event, VibeMessage, Profile } from './types';
import Header from './components/layout/Header';
import MapView, { type MapViewRef } from './components/map/MapView';
import HistoryPanel from './components/history/HistoryPanel';
import FloatingActionButton from './components/common/FloatingActionButton';
import CreateEventButton from './components/common/CreateEventButton';
import CreateEventModal from './components/events/CreateEventModal';
import MyLocationButton from './components/common/MyLocationButton';
import VibeChatPanel from './components/vibes/VibeChatPanel';
import SettingsModal from './components/profile/SettingsModal';
import ProfileModal from './components/profile/ProfileModal';
import ProfileQuickView from './components/layout/ProfileQuickView';
import { supabase } from './lib/supabaseClient';

interface MainAppProps {
  user: User;
  onLogout: () => void;
  onProfileUpdate: (profile: User['profile']) => void;
}

const MainApp: React.FC<MainAppProps> = ({ user, onLogout, onProfileUpdate }) => {
  const [isHistoryVisible, setIsHistoryVisible] = useState(false);
  const [isCreateMode, setIsCreateMode] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newEventCoords, setNewEventCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [activeVibe, setActiveVibe] = useState<Event | null>(null);
  const [isChatVisible, setIsChatVisible] = useState(false);
  const [chatMessages, setChatMessages] = useState<VibeMessage[]>([]);
  const [activeVibeParticipants, setActiveVibeParticipants] = useState<Profile[]>([]);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [viewedUser, setViewedUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isProfileQuickViewOpen, setIsProfileQuickViewOpen] = useState(false);
  const mapViewRef = useRef<MapViewRef>(null);

  useEffect(() => {
    const handleOnline = () => {
        setIsOnline(true);
        setError(null);
    };
    const handleOffline = () => {
        setIsOnline(false);
        setError("You're offline. Some features may not work.");
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
    };
}, []);

  useEffect(() => {
    const fetchEvents = async () => {
        try {
            const { data, error: fetchError } = await supabase
                .from('events')
                .select('*, creator:profiles(username)')
                .eq('status', 'active');
            
            if (fetchError) {
                console.error("Error fetching events", fetchError);
                setError("Failed to load events. Please refresh the page.");
            } else {
                setEvents(data as Event[]);
                setError(null);
            }
        } catch (err) {
            console.error("Unexpected error:", err);
            setError("An unexpected error occurred while loading events.");
        }
    };
    fetchEvents();

    const eventsSubscription = supabase.channel('public:events')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, payload => {
        console.log('Change received!', payload)
        fetchEvents(); // Refetch all events on any change
      })
      .subscribe();
      
    return () => {
        supabase.removeChannel(eventsSubscription);
    };
  }, []);
  
  useEffect(() => {
    let messagesSubscription: any = null;
    if (isChatVisible && activeVibe) {
        const fetchMessages = async () => {
            const { data, error } = await supabase
                .from('messages')
                .select('*, sender:profiles(username)')
                .eq('event_id', activeVibe.id)
                .order('created_at');
            if (error) console.error("Error fetching messages", error);
            else setChatMessages(data as any[] as VibeMessage[]);
        };
        fetchMessages();

        messagesSubscription = supabase.channel(`public:messages:event_id=eq.${activeVibe.id}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `event_id=eq.${activeVibe.id}` }, 
            async (payload) => {
                try {
                    const { data: profile, error } = await supabase.from('profiles').select('username').eq('id', payload.new.sender_id).single();
                    if (error) {
                        console.error(error);
                        setChatMessages(msgs => [...msgs, { ...payload.new, sender: { username: 'Unknown' } } as VibeMessage]);
                    } else {
                        setChatMessages(msgs => [...msgs, { ...payload.new, sender: { username: profile.username } } as VibeMessage]);
                    }
                } catch (err) {
                    console.error('Error handling new message:', err);
                }
            })
            .subscribe();

    }
    return () => {
        if(messagesSubscription) {
            supabase.removeChannel(messagesSubscription);
        }
    };
  }, [isChatVisible, activeVibe]);

// Subscribe to changes in the active vibe
useEffect(() => {
    if (!activeVibe) return;

    const eventSubscription = supabase
        .channel(`event:${activeVibe.id}`)
        .on(
            'postgres_changes',
            {
                event: 'UPDATE',
                schema: 'public',
                table: 'events',
                filter: `id=eq.${activeVibe.id}`
            },
            (payload) => {
                const updatedEvent = payload.new as Event;

                // If event is closed or user is no longer in participants
                if (updatedEvent.status === 'closed' || !updatedEvent.participants.includes(user.id)) {
                    alert('This vibe has been closed by the creator.');
                    setActiveVibe(null);
                    setIsChatVisible(false);
                }
                // Update active vibe with new data
                else {
                    setActiveVibe(updatedEvent);
                }
            }
        )
        .subscribe();

    return () => {
        supabase.removeChannel(eventSubscription);
    };
}, [activeVibe, user.id]);


  const handleMapClickInCreateMode = (coords: { lat: number; lng: number }) => {
    if (activeVibe) {
        alert("You are already in a Vibe. Leave or close your current Vibe to create a new one.");
        setIsCreateMode(false);
        return;
    }
    setNewEventCoords(coords);
    setIsCreateModalOpen(true);
  };

  const handleCreateEvent = async (eventData: Omit<Event, 'id' | 'creator' | 'creator_id' | 'lat' | 'lng' | 'participants'>) => {
    if (!newEventCoords) return;

    const { data: newEvent, error } = await supabase
        .from('events')
        .insert({
            ...eventData,
            status: 'active',
            lat: newEventCoords.lat,
            lng: newEventCoords.lng,
            creator_id: user.id,
            participants: [user.id],
        })
        .select('*, creator:profiles(username)')
        .single();
    
    if (error) {
        console.error("Error creating event:", error);
    } else if (newEvent) {
        setActiveVibe(newEvent as Event);
        setIsCreateModalOpen(false);
        setNewEventCoords(null);
        setIsCreateMode(false);
    }
  };
  
  const handleRecenterMap = () => {
    mapViewRef.current?.recenter();
  };

  const handleCloseEvent = async (eventId: number) => {
    // Update event status to closed and clear all participants
    const { error } = await supabase
        .from('events')
        .update({
            status: 'closed',
            participants: [] // Clear all participants when closing
        })
        .eq('id', eventId);

    if (error) {
        console.error("Error closing event:", error);
        return;
    }

    // If the current user is in this vibe, remove them from local state
    if (activeVibe?.id === eventId) {
        setActiveVibe(null);
        setIsChatVisible(false);
    }
};

  const handleExtendEvent = async (eventId: number) => {
      const event = events.find(e => e.id === eventId);
      if (!event) return;
      await supabase.from('events').update({ duration: event.duration + 15 }).eq('id', eventId);
  };

const handleJoinVibe = async (eventId: number) => {
    if (activeVibe) {
        alert("You're already in a Vibe. Please leave it before joining another.");
        return;
    }

    const event = events.find(e => e.id === eventId);
    if (!event) return;

    // Check if event is still active
    if (event.status !== 'active') {
        alert("This vibe is no longer active.");
        return;
    }

    // Check if user is already in participants (shouldn't happen, but safety check)
    if (event.participants.includes(user.id)) {
        setActiveVibe(event);
        return;
    }

    const newParticipants = [...event.participants, user.id];
    const { data, error } = await supabase
        .from('events')
        .update({ participants: newParticipants })
        .eq('id', eventId)
        .eq('status', 'active') // Only update if still active
        .select('*, creator:profiles(username)')
        .single();
        
    if (error) {
        console.error("Error joining vibe:", error);
        alert("Could not join this vibe. It may have been closed.");
    } else if (data) {
        setActiveVibe(data as Event);
    }
};

const handleLeaveVibe = async (eventId: number) => {
    const event = events.find(e => e.id === eventId);
    if (!event) return;

    const newParticipants = event.participants.filter(p => p !== user.id);

    const { error } = await supabase
        .from('events')
        .update({ participants: newParticipants })
        .eq('id', eventId);

    if (error) {
        console.error("Error leaving vibe:", error);
    }

    setActiveVibe(null);
    setIsChatVisible(false);
    setChatMessages([]);
};

  const handleSendMessage = async (text: string) => {
      if (!activeVibe) return;

      await supabase.from('messages').insert({
          text,
          sender_id: user.id,
          event_id: activeVibe.id,
      });
  };

  const handleOpenProfile = async (username: string) => {
      const { data: profile, error } = await supabase.from('profiles').select('*').eq('username', username).single();
      if(error) {
           console.error("Could not find user to view profile for:", username, error);
           return;
      }
      if (profile) {
          const userToView: User = {
              id: profile.id,
              profile: {
                username: profile.username,
                bio: profile.bio,
                privacy: profile.privacy,
              }
          };
          setViewedUser(userToView);
          setIsProfileModalOpen(true);
      }
  };

  return (
    <div className="h-screen w-screen overflow-hidden bg-green-50 flex flex-col">
      <Header 
        user={user} 
        onLogout={onLogout} 
        onOpenSettings={() => setIsSettingsModalOpen(true)}
        onOpenProfileQuickView={() => setIsProfileQuickViewOpen(true)}
      />
      <main className="flex-grow relative">
        {error && (
          <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[2000] bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded shadow-lg" role="alert">
            <span className="block sm:inline">{error}</span>
          </div>
        )}
        <MapView 
          ref={mapViewRef}
          isCreateMode={isCreateMode}
          userLocation={userLocation}
          onSetUserLocation={setUserLocation}
          onMapClick={handleMapClickInCreateMode}
          events={events}
          user={user}
          activeVibe={activeVibe}
          onCloseEvent={handleCloseEvent}
          onExtendEvent={handleExtendEvent}
          onJoinVibe={handleJoinVibe}
          onViewChat={() => setIsChatVisible(true)}
        />
        
        <div className="fixed bottom-6 right-6 z-[1000] flex flex-col items-center space-y-4">
          <MyLocationButton 
            onClick={handleRecenterMap} 
            disabled={!userLocation} 
          />
          <CreateEventButton 
            onClick={() => setIsCreateMode(!isCreateMode)} 
            isActive={isCreateMode} 
          />
           <FloatingActionButton onClick={() => setIsHistoryVisible(true)} />
        </div>

        <HistoryPanel 
            user={user} 
            isOpen={isHistoryVisible} 
            onClose={() => setIsHistoryVisible(false)} 
        />
        {newEventCoords && (
          <CreateEventModal 
            isOpen={isCreateModalOpen}
            onClose={() => {
              setIsCreateModalOpen(false);
              setNewEventCoords(null);
              setIsCreateMode(false);
            }}
            onSubmit={handleCreateEvent}
          />
        )}
        {activeVibe && (
            <VibeChatPanel
                isOpen={isChatVisible}
                onClose={() => setIsChatVisible(false)}
                vibe={activeVibe}
                messages={chatMessages}
                user={user}
                onSendMessage={handleSendMessage}
                onLeaveVibe={handleLeaveVibe}
                onViewProfile={handleOpenProfile}
            />
        )}
        <SettingsModal 
            isOpen={isSettingsModalOpen}
            onClose={() => setIsSettingsModalOpen(false)}
            user={user}
            onSave={onProfileUpdate}
        />
        {viewedUser && (
            <ProfileModal
                isOpen={isProfileModalOpen}
                onClose={() => setIsProfileModalOpen(false)}
                userToView={viewedUser}
            />
        )}
        <ProfileQuickView 
            isOpen={isProfileQuickViewOpen}
            onClose={() => setIsProfileQuickViewOpen(false)}
            user={user}
            onEditProfile={() => {
                setIsProfileQuickViewOpen(false);
                setIsSettingsModalOpen(true);
            }}
        />
      </main>
    </div>
  );
};

export default MainApp;
