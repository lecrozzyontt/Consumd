import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { useAuth } from '../context/AuthContext';
import './CreateGroup.css';

export default function CreateGroup() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [friends, setFriends] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedFriends, setSelectedFriends] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!user) return;

    async function loadFriends() {
      setLoading(true);
      try {
        const { data: friendships } = await supabase
          .from('friendships')
          .select('requester:profiles!friendships_requester_id_fkey(id, username), addressee:profiles!friendships_addressee_id_fkey(id, username)')
          .eq('status', 'accepted')
          .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

        if (friendships) {
          const friendProfiles = friendships.map(f =>
            f.requester.id === user.id ? f.addressee : f.requester
          );
          setFriends(friendProfiles);
        }
      } catch (error) {
        console.error('Error loading friends:', error);
      } finally {
        setLoading(false);
      }
    }

    loadFriends();
  }, [user]);

  const createGroupChat = async () => {
    if (!newGroupName.trim() || selectedFriends.length === 0 || isSubmitting) return;
    setIsSubmitting(true);

    try {
      const { data: newGroup, error } = await supabase
        .from('group_chats')
        .insert([{ name: newGroupName.trim(), created_by: user.id }])
        .select('id')
        .single();

      if (error) throw error;

      if (newGroup) {
        const membersToInsert = [
          { group_id: newGroup.id, user_id: user.id },
          ...selectedFriends.map(friendId => ({ group_id: newGroup.id, user_id: friendId })),
        ];
        const { error: memberError } = await supabase.from('group_chat_members').insert(membersToInsert);
        if (memberError) throw memberError;

        navigate('/social'); // Navigate back to social page on success
      }
    } catch (error) {
      console.error('Failed to create group chat:', error);
      // Optionally, show an error message to the user
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="create-group-page">
      <div className="create-group-container" onClick={e => e.stopPropagation()}>
        <div className="create-group-header">
          <h1 className="create-group-title">Create Group Chat</h1>
          <p className="create-group-subtitle">Select friends to start a new conversation.</p>
        </div>
        <div className="create-group-content">
          <input
            type="text"
            placeholder="Group name…"
            value={newGroupName}
            onChange={e => setNewGroupName(e.target.value)}
            className="create-group-input"
          />
          <div className="friends-selector">
            {loading ? (
              <div className="loading-spinner-container"><div className="spinner" /></div>
            ) : friends.length === 0 ? (
              <p className="no-friends">Add some friends first to create a group!</p>
            ) : (
              friends.map(friend => (
                <label
                  key={friend.id}
                  className={`friend-checkbox ${selectedFriends.includes(friend.id) ? 'selected' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={selectedFriends.includes(friend.id)}
                    onChange={() => {
                      setSelectedFriends(prev =>
                        prev.includes(friend.id)
                          ? prev.filter(id => id !== friend.id)
                          : [...prev, friend.id]
                      );
                    }}
                  />
                  <div className="user-avatar modal-avatar">{friend.username?.[0]?.toUpperCase()}</div>
                  <span className="friend-name">@{friend.username}</span>
                  <div className="checkbox-indicator" />
                </label>
              ))
            )}
          </div>
        </div>
        <div className="create-group-buttons">
          <button className="btn-cancel" onClick={() => navigate(-1)}>Cancel</button>
          <button
            className="btn-create"
            onClick={createGroupChat}
            disabled={!newGroupName.trim() || selectedFriends.length === 0 || isSubmitting}
          >
            {isSubmitting ? 'Creating...' : 'Create Group'}
          </button>
        </div>
      </div>
    </div>
  );
}