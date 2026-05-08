import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { useAuth } from '../context/AuthContext';
import { filterProfanity } from '../services/moderation';
import Avatar from '../components/Avatar';
import ReportModal from '../components/ReportModal';
import '../styles/MessagesPage.css';

export default function MessagesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { friendId } = useParams();

  const [friend, setFriend]         = useState(null);
  const [messages, setMessages]     = useState([]);
  const [messageText, setMessageText] = useState('');
  const [sending, setSending]       = useState(false);

  // Per-message report menu
  const [activeMenu, setActiveMenu]   = useState(null); // message id
  const [reportTarget, setReportTarget] = useState(null); // { id, userId }
  const menuRef = useRef(null);
  const messagesEndRef = useRef(null);

  // Close menu on outside click
  useEffect(() => {
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setActiveMenu(null);
    }
    if (activeMenu) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [activeMenu]);

  useEffect(() => {
    if (!friendId) return;
    fetchFriend();
  }, [friendId]);

  useEffect(() => {
    if (!friend) return;
    fetchMessages();
    markConversationAsRead();

    const channel = supabase
      .channel(`messages-${user.id}-${friend.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
        if (
          (payload.new.sender_id === friend.id && payload.new.recipient_id === user.id) ||
          (payload.new.sender_id === user.id   && payload.new.recipient_id === friend.id)
        ) {
          setMessages(prev => [...prev, payload.new]);
          if (payload.new.sender_id === friend.id) markAsRead(payload.new.id);
        }
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [friend]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function fetchFriend() {
    const { data } = await supabase
      .from('profiles').select('id, username, avatar_url').eq('id', friendId).single();
    setFriend(data);
  }

  async function fetchMessages() {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .or(`and(sender_id.eq.${user.id},recipient_id.eq.${friend.id}),and(sender_id.eq.${friend.id},recipient_id.eq.${user.id})`)
      .order('created_at', { ascending: true });
    setMessages(data || []);
  }

  async function markAsRead(messageId) {
    await supabase.from('messages').update({ read: true }).eq('id', messageId);
  }

  async function markConversationAsRead() {
    await supabase.from('messages').update({ read: true })
      .eq('sender_id', friend.id).eq('recipient_id', user.id).eq('read', false);
  }

  async function sendMessage(e) {
    e.preventDefault();
    if (!messageText.trim() || sending || !friend) return;
    setSending(true);

    // Apply profanity filter before sending
    const filtered = filterProfanity(messageText.trim());

    const { data, error } = await supabase.from('messages').insert({
      sender_id: user.id,
      recipient_id: friend.id,
      content: filtered,
    }).select().single();

    if (!error && data) {
      setMessages(prev => [...prev, data]);
      setMessageText('');
      await supabase.from('notifications').insert({
        user_id: friend.id,
        actor_id: user.id,
        type: 'message',
        read: false,
      });
    }
    setSending(false);
  }

  if (!friend) {
    return (
      <div className="messages-page">
        <button className="messages-back" onClick={() => navigate('/social')}>← Back</button>
        <div className="messages-loading"><div className="spinner" /></div>
      </div>
    );
  }

  return (
    <div className="messages-page">
      <button className="messages-back" onClick={() => navigate('/social')}>← Back</button>

      <div className="messages-conversation">
        <div className="conversation-header">
          <div className="conversation-friend">
            <Avatar url={friend.avatar_url} username={friend.username} size={40} className="friend-avatar" />
            <span>{friend.username}</span>
          </div>
        </div>

        <div className="messages-list">
          {messages.length === 0 ? (
            <div className="no-messages">
              <p>No messages yet. Start the conversation!</p>
            </div>
          ) : (
            messages.map(msg => {
              const isMine = msg.sender_id === user.id;
              const isMenuOpen = activeMenu === msg.id;
              return (
                <div
                  key={msg.id}
                  className={`message ${isMine ? 'sent' : 'received'}`}
                  style={{ position: 'relative' }}
                >
                  <div className="message-content">{msg.content}</div>
                  <span className="message-time">
                    {new Date(msg.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                  </span>

                  {/* ⋯ menu only on received messages */}
                  {!isMine && (
                    <div
                      style={{ position: 'absolute', top: '50%', right: '-2rem', transform: 'translateY(-50%)' }}
                      ref={isMenuOpen ? menuRef : null}
                    >
                      <button
                        onClick={() => setActiveMenu(isMenuOpen ? null : msg.id)}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: 'rgba(255,255,255,0.3)', fontSize: '1rem',
                          padding: '0.25rem', lineHeight: 1,
                          transition: 'color 0.15s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.7)'}
                        onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.3)'}
                        aria-label="Message options"
                      >
                        ···
                      </button>
                      {isMenuOpen && (
                        <div className="kebab-menu" style={{ right: 0, left: 'auto' }}>
                          <button
                            onClick={() => {
                              setActiveMenu(null);
                              setReportTarget({ id: msg.id, userId: msg.sender_id });
                            }}
                          >
                            🚩 Report Message
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        <form className="message-form" onSubmit={sendMessage}>
          <input
            className="message-input"
            placeholder="Type a message…"
            value={messageText}
            onChange={e => setMessageText(e.target.value)}
            maxLength={1000}
          />
          <button className="message-send" type="submit" disabled={!messageText.trim() || sending}>
            {sending ? '…' : 'Send'}
          </button>
        </form>
      </div>

      {/* Report modal */}
      {reportTarget && (
        <ReportModal
          isOpen={!!reportTarget}
          onClose={() => setReportTarget(null)}
          contentId={reportTarget.id}
          contentType="message"
          reportedUserId={reportTarget.userId}
        />
      )}
    </div>
  );
}
