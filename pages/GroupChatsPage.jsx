import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { useAuth } from '../context/AuthContext';
import Avatar from '../components/Avatar';
import '../styles/GroupChatsPage.css';

export default function GroupChatsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { groupId } = useParams();
  const [group, setGroup] = useState(null);
  const [messages, setMessages] = useState([]);
  const [members, setMembers] = useState([]);
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Settings panel state
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState('');
  const [friends, setFriends] = useState([]);
  const [addingUser, setAddingUser] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const messagesEndRef = useRef(null);
  const settingsRef = useRef(null);

  useEffect(() => {
    if (!groupId) return;
    fetchGroup();
  }, [groupId]);

  useEffect(() => {
    if (!group) return;
    fetchMessages();
    fetchMembers();

    const channel = supabase
      .channel(`group-messages-${group.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'group_messages',
        filter: `group_id=eq.${group.id}`,
      }, async payload => {
        const msg = payload.new;
        const { data: profile } = await supabase
          .from('profiles')
          .select('id, username')
          .eq('id', msg.sender_id)
          .single();
        setMessages(prev => [...prev, { ...msg, sender: profile }]);
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [group]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Close settings panel on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (settingsRef.current && !settingsRef.current.contains(e.target)) {
        setShowSettings(false);
        setRenaming(false);
        setAddingUser(false);
        setSearchQuery('');
      }
    }
    if (showSettings) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showSettings]);

  async function fetchGroup() {
    const { data } = await supabase
      .from('group_chats')
      .select('id, name, created_at')
      .eq('id', groupId)
      .single();
    setGroup(data);
    setNewName(data?.name || '');
  }

  async function fetchMessages() {
    const { data: msgs } = await supabase
      .from('group_messages')
      .select('id, content, created_at, sender_id')
      .eq('group_id', group.id)
      .order('created_at', { ascending: true });

    if (!msgs || msgs.length === 0) {
      setMessages([]);
      return;
    }

    // Fetch sender profiles separately to avoid FK join issues
    const senderIds = [...new Set(msgs.map(m => m.sender_id))];
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username')
      .in('id', senderIds);

    const profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p]));
    setMessages(msgs.map(m => ({ ...m, sender: profileMap[m.sender_id] || null })));
  }

  async function fetchMembers() {
    const { data: memberRows } = await supabase
      .from('group_chat_members')
      .select('user_id')
      .eq('group_id', group.id);

    if (!memberRows || memberRows.length === 0) {
      setMembers([]);
      return;
    }

    const ids = memberRows.map(r => r.user_id);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, avatar_url')
      .in('id', ids);
    setMembers(profiles || []);
  }

  async function fetchFriendsToAdd() {
    // Fetch accepted friends not already in the group
    const { data } = await supabase
      .from('friendships')
      .select('requester_id, addressee_id')
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
      .eq('status', 'accepted');

    if (!data) return;

    const friendIds = data.map(f =>
      f.requester_id === user.id ? f.addressee_id : f.requester_id
    );
    const memberIds = members.map(m => m.id);
    const addableIds = friendIds.filter(id => !memberIds.includes(id));

    if (addableIds.length === 0) {
      setFriends([]);
      return;
    }

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, avatar_url')
      .in('id', addableIds);

    setFriends(profiles || []);
  }

  async function sendMessage(e) {
    e.preventDefault();
    if (!messageText.trim() || sending || !group) return;
    setSending(true);

    const { data, error } = await supabase
      .from('group_messages')
      .insert({
        group_id: group.id,
        sender_id: user.id,
        content: messageText.trim(),
      })
      .select('id, content, created_at, sender_id')
      .single();

    if (!error && data) {
      // Attach sender profile without relying on FK join
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, username')
        .eq('id', user.id)
        .single();
      setMessages(prev => [...prev, { ...data, sender: profile }]);
      setMessageText('');

      // Notify other group members
      const otherMembers = members.filter(m => m.id !== user.id);
      if (otherMembers.length > 0) {
        const notifications = otherMembers.map(m => ({
          user_id: m.id,
          actor_id: user.id,
          type: 'group_message',
          reference_id: group.id,
          message: `@${user.user_metadata?.username || profile?.username || 'Someone'} sent a message to ${group.name}`
        }));
        await supabase.from('notifications').insert(notifications);
      }
    }
    setSending(false);
  }

  async function renameGroup() {
    if (!newName.trim() || newName.trim() === group.name) {
      setRenaming(false);
      return;
    }
    const { error } = await supabase
      .from('group_chats')
      .update({ name: newName.trim() })
      .eq('id', group.id);

    if (!error) {
      setGroup(prev => ({ ...prev, name: newName.trim() }));
    }
    setRenaming(false);
  }

  async function addUserToGroup(userId) {
    const { error } = await supabase.from('group_chat_members').insert({
      group_id: group.id,
      user_id: userId,
    });

    if (!error) {
      await supabase.from('notifications').insert({
        user_id: userId,
        actor_id: user.id,
        type: 'group_invite',
        reference_id: group.id,
        message: `@${user.user_metadata?.username || 'Someone'} added you to the group ${group.name}`
      });
    }

    await fetchMembers();
    setFriends(prev => prev.filter(f => f.id !== userId));
  }

  async function leaveGroup() {
    if (!window.confirm(`Leave "${group.name}"? You will no longer be a member.`)) return;

    const { error, count } = await supabase
      .from('group_chat_members')
      .delete({ count: 'exact' })
      .eq('group_id', group.id)
      .eq('user_id', user.id);

    if (error) {
      console.error('Failed to leave group:', error);
      alert('Could not leave the group. Please try again.');
      return;
    }

    // count === 0 means the row wasn't found / RLS blocked it — try by member_id as fallback
    if (count === 0) {
      // Some schemas use a surrogate PK; try matching only on user_id to debug
      console.warn('No rows deleted — check RLS policies on group_chat_members for DELETE');
      alert('Could not leave the group. Please check permissions.');
      return;
    }

    navigate('/social');
  }

  function openSettings() {
    setShowSettings(true);
    setRenaming(false);
    setAddingUser(false);
    setSearchQuery('');
  }

  function openAddUser() {
    setAddingUser(true);
    fetchFriendsToAdd();
  }

  const filteredFriends = friends.filter(f =>
    f.username?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!group) {
    return (
      <div className="messages-page">
        <button className="messages-back" onClick={() => navigate('/social')}>
          ← Back
        </button>
        <div className="messages-loading">
          <div className="spinner" />
        </div>
      </div>
    );
  }

  return (
    <div className="messages-page">
      <button className="messages-back" onClick={() => navigate('/social')}>
        ← Back
      </button>

      <div className="messages-conversation">
        {/* Header */}
        <div className="conversation-header">
          <div className="conversation-friend">
            <div className="friend-avatar group-avatar">
              {group.name?.[0]?.toUpperCase()}
            </div>
            <span>{group.name}</span>
            <span className="group-member-count">{members.length} members</span>
          </div>
          <button
            className="settings-btn"
            onClick={openSettings}
            aria-label="Group settings"
          >
            ⚙
          </button>
        </div>

        {/* Messages */}
        <div className="messages-list">
          {messages.length === 0 ? (
            <div className="no-messages">
              <p>No messages yet. Start the conversation!</p>
            </div>
          ) : (
            messages.map((msg, idx) => {
              const isMine = msg.sender_id === user.id;
              const isNewSender = idx === 0 || messages[idx - 1].sender_id !== msg.sender_id;
              return (
                <div
                  key={msg.id}
                  className={`message ${isMine ? 'sent' : 'received'}`}
                >
                  {!isMine && isNewSender && (
                    <span className="group-sender-name">{msg.sender?.username}</span>
                  )}
                  <div className="message-content">{msg.content}</div>
                  <span className="message-time">
                    {new Date(msg.created_at).toLocaleTimeString('en-US', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <form className="message-form" onSubmit={sendMessage}>
          <input
            className="message-input"
            placeholder="Type a message…"
            value={messageText}
            onChange={e => setMessageText(e.target.value)}
            maxLength={1000}
          />
          <button
            className="message-send"
            type="submit"
            disabled={!messageText.trim() || sending}
          >
            {sending ? '…' : 'Send'}
          </button>
        </form>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="settings-overlay">
          <div className="settings-panel" ref={settingsRef}>
            <div className="settings-header">
              <h3>Group Settings</h3>
              <button
                className="settings-close"
                onClick={() => {
                  setShowSettings(false);
                  setRenaming(false);
                  setAddingUser(false);
                }}
              >
                ✕
              </button>
            </div>

            {/* Rename */}
            <div className="settings-section">
              <p className="settings-label">Group Name</p>
              {renaming ? (
                <div className="rename-row">
                  <input
                    className="settings-input"
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && renameGroup()}
                    autoFocus
                    maxLength={60}
                  />
                  <button className="settings-action-btn" onClick={renameGroup}>Save</button>
                  <button className="settings-cancel-btn" onClick={() => { setRenaming(false); setNewName(group.name); }}>Cancel</button>
                </div>
              ) : (
                <div className="rename-row">
                  <span className="settings-value">{group.name}</span>
                  <button className="settings-action-btn" onClick={() => setRenaming(true)}>Rename</button>
                </div>
              )}
            </div>

            {/* Members */}
            <div className="settings-section">
              <div className="settings-section-header">
                <p className="settings-label">Members</p>
                {!addingUser && (
                  <button className="settings-add-btn" onClick={openAddUser}>+ Add</button>
                )}
              </div>

              {addingUser && (
                <div className="add-user-area">
                  <input
                    className="settings-input"
                    placeholder="Search friends…"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    autoFocus
                  />
                  <div className="friends-to-add">
                    {filteredFriends.length === 0 ? (
                      <p className="no-friends-msg">
                        {searchQuery ? 'No matches' : 'All friends already added'}
                      </p>
                    ) : (
                      filteredFriends.map(f => (
                        <div key={f.id} className="friend-add-row">
                          <Avatar
                            url={f.avatar_url}
                            username={f.username}
                            size={28}
                            className="mini-avatar"
                          />
                          <span>{f.username}</span>
                          <button
                            className="settings-action-btn small"
                            onClick={() => addUserToGroup(f.id)}
                          >
                            Add
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                  <button
                    className="settings-cancel-btn mt-s"
                    onClick={() => { setAddingUser(false); setSearchQuery(''); }}
                  >
                    Done
                  </button>
                </div>
              )}

              <div className="members-list">
                {members.map(m => (
                  <div key={m.id} className="member-row">
                    <div className="mini-avatar">{m.username?.[0]?.toUpperCase()}</div>
                    <span>{m.username}</span>
                    {m.id === user.id && <span className="you-badge">You</span>}
                  </div>
                ))}
              </div>
            </div>

            {/* Leave */}
            <div className="settings-section">
              <button className="leave-btn" onClick={leaveGroup}>
                Leave Group
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}