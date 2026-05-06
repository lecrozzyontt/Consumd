import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { useAuth } from '../context/AuthContext';
import Avatar from './Avatar';
import './NotificationsBell.css';

const TYPE_LABELS = {
  review_like:  (actor) => `${actor} liked your review`,
  comment:      (actor) => `${actor} commented on your log`,
  reply:        (actor) => `${actor} replied to your comment`,
  comment_like: (actor) => `${actor} liked your comment`,
  message:      (actor) => `${actor} sent you a message`,
};

export default function NotificationsBell() {
  const { user }   = useAuth();
  const navigate   = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen]   = useState(false);
  const ref               = useRef(null);

  const unread = notifications.filter(n => !n.read).length;

  useEffect(() => {
    if (!user) return;
    fetchNotifications();

    // Realtime subscription
    const channel = supabase
      .channel('notifications')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      }, payload => {
        setNotifications(prev => [payload.new, ...prev]);
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [user]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  async function fetchNotifications() {
    const { data } = await supabase
      .from('notifications')
      .select('*, actor:actor_id(username, avatar_url), logs(id, title, user_id)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(30);
    setNotifications(data || []);
  }

  async function markAllRead() {
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', user.id)
      .eq('read', false);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }

  async function markRead(id) {
    await supabase.from('notifications').update({ read: true }).eq('id', id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }

  function handleNotifClick(notif) {
    markRead(notif.id);
    setOpen(false);
    
    // Navigate based on notification type
    if (notif.type === 'message') {
      navigate(`/messages/${notif.actor_id}`);
    } else if (notif.type === 'group_message' || notif.type === 'group_invite') {
      navigate(`/group-chats/${notif.reference_id}`);
    } else if (notif.type === 'friend_request' || notif.type.includes('thread')) {
      navigate(`/social`);
    } else if (notif.log_id) {
      if (notif.comment_id) {
        navigate(`/review/${notif.log_id}`, { 
          state: { 
            scrollToComment: notif.comment_id,
          } 
        });
      } else {
        navigate(`/review/${notif.log_id}`);
      }
    }
  }

  function timeAgo(dateStr) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins  = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days  = Math.floor(diff / 86400000);
    if (mins < 1)   return 'just now';
    if (mins < 60)  return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  }

  return (
    <div className="notif-bell-wrap" ref={ref}>
      <button
        className={`notif-bell-btn ${unread > 0 ? 'has-unread' : ''}`}
        onClick={() => { setOpen(v => !v); if (!open && unread > 0) markAllRead(); }}
        title="Notifications"
      >
        <svg className="bell-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
        </svg>
        {unread > 0 && (
          <span className="notif-badge">{unread > 9 ? '9+' : unread}</span>
        )}
      </button>

      {open && (
        <div className="notif-dropdown">
          <div className="notif-dropdown-header">
            <span className="notif-dropdown-title">Notifications</span>
            {notifications.some(n => !n.read) && (
              <button className="notif-mark-all" onClick={markAllRead}>Mark all read</button>
            )}
          </div>

          <div className="notif-list">
            {notifications.length === 0 ? (
              <p className="notif-empty">No notifications yet</p>
            ) : notifications.map(notif => (
              <div
                key={notif.id}
                className={`notif-item ${!notif.read ? 'unread' : ''}`}
                onClick={() => handleNotifClick(notif)}
              >
                <Avatar
                  url={notif.actor?.avatar_url}
                  username={notif.actor?.username}
                  size={32}
                />
                <div className="notif-body">
                  <p className="notif-text">
                    {/* 👇 Check for explicit message first, fallback to old logic 👇 */}
                    {notif.message 
                      ? notif.message 
                      : (TYPE_LABELS[notif.type] || (() => notif.type))(notif.actor?.username || 'Someone')
                    }
                    {notif.logs?.title && (
                      <span className="notif-media-title"> · {notif.logs.title}</span>
                    )}
                  </p>
                  <span className="notif-time">{timeAgo(notif.created_at)}</span>
                </div>
                {!notif.read && <span className="notif-dot" />}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}