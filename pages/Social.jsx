import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { useAuth } from '../context/AuthContext';
import { primeProfile } from '../services/profileCache';
import { cacheGet, cacheSet } from '../services/dataCache';
import SearchBar from '../components/SearchBar';
import Avatar from '../components/Avatar';
import './Social.css';

// ─────────────────────────────────────────
//  THREAD CARD
// ─────────────────────────────────────────
function ThreadCard({ thread, currentUser, onLike, onDelete, onCommentSubmit }) {
  const [expanded, setExpanded]       = useState(false);
  const [commentText, setCommentText] = useState('');
  const [replyTo, setReplyTo]         = useState(null); // { id, username }
  const [submitting, setSubmitting]   = useState(false);
  const inputRef = useRef(null);

  const liked = thread.liked_by_me;

  const handleReply = (comment) => {
    setReplyTo({ id: comment.id, username: comment.username });
    setExpanded(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    setSubmitting(true);
    await onCommentSubmit(thread.id, commentText.trim(), replyTo?.id ?? null);
    setCommentText('');
    setReplyTo(null);
    setSubmitting(false);
  };

  // Nested: top-level comments + their replies
  const topLevel = (thread.comments || []).filter(c => !c.parent_id);
  const replies  = (thread.comments || []).filter(c =>  c.parent_id);

  return (
    <article className="thread-card">
      {/* Header */}
      <div className="thread-header">
        <Avatar
          url={thread.avatar_url}
          username={thread.username}
          size={30}
          className="thread-avatar"
        />
        <div className="thread-meta">
          <span className="thread-username">@{thread.username}</span>
          <span className="thread-time">{timeAgo(thread.created_at)}</span>
        </div>
        {currentUser?.id === thread.user_id && (
          <button className="thread-delete" onClick={() => onDelete(thread.id)} title="Delete">✕</button>
        )}
      </div>

      {/* Body */}
      <p className="thread-body">{thread.content}</p>

      {/* Actions */}
      <div className="thread-actions">
        <button
          className={`thread-action-btn ${liked ? 'liked' : ''}`}
          onClick={() => onLike(thread.id, liked)}
        >
          <span>{liked ? '♥' : '♡'}</span>
          <span>{thread.likes_count ?? 0}</span>
        </button>

        <button
          className="thread-action-btn"
          onClick={() => { setExpanded(e => !e); setTimeout(() => inputRef.current?.focus(), 50); }}
          title="Comment"
        >
          <svg 
            width="18" 
            height="18" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2" 
            strokeLinecap="round" 
            strokeLinejoin="round"
            style={{ marginTop: '2px' }}
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span>{(thread.comments || []).length}</span>
        </button>
      </div>

      {/* Comments */}
      {expanded && (
        <div className="thread-comments">
          {topLevel.length === 0 && (
            <p className="thread-no-comments">No comments yet.</p>
          )}
          {topLevel.map(c => (
            <div key={c.id} className="thread-comment">
              <Avatar
                url={c.avatar_url}
                username={c.username}
                size={24}
                className="tc-avatar"
              />
              <div className="tc-body">
                <div className="tc-top">
                  <span className="tc-username">@{c.username}</span>
                  <span className="tc-time">{timeAgo(c.created_at)}</span>
                </div>
                <p className="tc-text">{c.content}</p>
                <button className="tc-reply-btn" onClick={() => handleReply(c)}>Reply</button>

                {/* Nested replies */}
                {replies.filter(r => r.parent_id === c.id).map(r => (
                  <div key={r.id} className="thread-comment thread-comment--reply">
                    <Avatar
                      url={r.avatar_url}
                      username={r.username}
                      size={24}
                      className="tc-avatar"
                    />
                    <div className="tc-body">
                      <div className="tc-top">
                        <span className="tc-username">@{r.username}</span>
                        <span className="tc-time">{timeAgo(r.created_at)}</span>
                      </div>
                      <p className="tc-text">{r.content}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Comment input */}
          <form className="tc-form" onSubmit={handleSubmit}>
            {replyTo && (
              <div className="tc-reply-banner">
                Replying to @{replyTo.username}
                <button type="button" onClick={() => setReplyTo(null)}>✕</button>
              </div>
            )}
            <div className="tc-input-row">
              <input
                ref={inputRef}
                className="tc-input"
                placeholder={replyTo ? `Reply to @${replyTo.username}…` : 'Write a comment…'}
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
                maxLength={300}
              />
              <button className="tc-submit" type="submit" disabled={submitting || !commentText.trim()}>
                {submitting ? '…' : '↑'}
              </button>
            </div>
          </form>
        </div>
      )}
    </article>
  );
}

// ─────────────────────────────────────────
//  MAIN SOCIAL PAGE
// ─────────────────────────────────────────
export default function Social() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  // ── Messages / friends state ──
  const [searchQuery, setSearchQuery]     = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [threadSearch, setThreadSearch]   = useState([]);
  const [requests, setRequests]           = useState(() => cacheGet('social:friends')?.requests   || []);
  const [friends, setFriends]             = useState(() => cacheGet('social:friends')?.friends    || []);
  const [groupChats, setGroupChats]       = useState(() => cacheGet('social:friends')?.groupChats || []);
  const [outgoing, setOutgoing]           = useState(() => cacheGet('social:friends')?.outgoing   || []);
  const [loadingMessages, setLoadingMessages] = useState(!cacheGet('social:friends'));

  // ── Threads state ──
  const [threads, setThreads]             = useState(() => cacheGet('social:threads') || []);
  const [loadingThreads, setLoadingThreads] = useState(!cacheGet('social:threads'));
  const [newThreadText, setNewThreadText] = useState('');
  const [postingThread, setPostingThread] = useState(false);

  const [toast, setToast] = useState('');
  const searchTimeout = useRef(null);

  useEffect(() => { if (user?.id) { loadSocial(); loadThreads(); } }, [user?.id]);

  // On tab/app resume, refresh — cache means no spinner shown
  useEffect(() => {
    const handle = () => {
      if (document.visibilityState !== 'visible' || !user?.id) return;
      loadSocial();
      loadThreads();
    };
    document.addEventListener('visibilitychange', handle);
    return () => document.removeEventListener('visibilitychange', handle);
  }, [user?.id]);

  // ─── Social / messages ───────────────────
  async function loadSocial() {
    if (!cacheGet('social:friends')) setLoadingMessages(true);
    try {
      const { data: all } = await supabase
        .from('friendships')
        .select(`
          id, status, requester_id, addressee_id,
          requester:profiles!friendships_requester_id_fkey(id, username, avatar_url),
          addressee:profiles!friendships_addressee_id_fkey(id, username, avatar_url)
        `)
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

      const rows = all || [];
      setRequests(rows.filter(r => r.addressee_id === user.id && r.status === 'pending'));
      setOutgoing(rows.filter(r => r.requester_id === user.id && r.status === 'pending'));
      setFriends(rows.filter(r => r.status === 'accepted').map(r => ({
        friendship_id: r.id,
        ...(r.requester_id === user.id ? r.addressee : r.requester),
      })));

      const { data: myGroups } = await supabase
        .from('group_chat_members')
        .select('group_id')
        .eq('user_id', user.id);

      const ids = myGroups?.map(m => m.group_id) || [];
      if (ids.length > 0) {
        const { data: groupData } = await supabase
          .from('group_chats')
          .select('id, name, created_at, group_chat_members(user_id)')
          .in('id', ids);
        setGroupChats(groupData || []);
      } else {
        setGroupChats([]);
      }
      // Save to cache after all state is set
      cacheSet('social:friends', {
        requests: requests,
        friends:  friends,
        outgoing: outgoing,
        groupChats: groupChats,
      });
    } catch (e) { console.error(e); }
    finally { setLoadingMessages(false); }
  }

  // Silent version — no loading state, used by useOnFocus
  async function refreshSocial() {
    try {
      const { data: all } = await supabase
        .from('friendships')
        .select(`
          id, status, requester_id, addressee_id,
          requester:profiles!friendships_requester_id_fkey(id, username, avatar_url),
          addressee:profiles!friendships_addressee_id_fkey(id, username, avatar_url)
        `)
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

      const rows = all || [];
      setRequests(rows.filter(r => r.addressee_id === user.id && r.status === 'pending'));
      setOutgoing(rows.filter(r => r.requester_id === user.id && r.status === 'pending'));
      setFriends(rows.filter(r => r.status === 'accepted').map(r => ({
        friendship_id: r.id,
        ...(r.requester_id === user.id ? r.addressee : r.requester),
      })));

      const { data: myGroups } = await supabase
        .from('group_chat_members')
        .select('group_id')
        .eq('user_id', user.id);

      const ids = myGroups?.map(m => m.group_id) || [];
      if (ids.length > 0) {
        const { data: groupData } = await supabase
          .from('group_chats')
          .select('id, name, created_at, group_chat_members(user_id)')
          .in('id', ids);
        setGroupChats(groupData || []);
      } else {
        setGroupChats([]);
      }
    } catch (e) { console.error(e); }
  }

  // ─── Threads ─────────────────────────────
  async function loadThreads() {
    if (!cacheGet('social:threads')) setLoadingThreads(true);
    try {
      // Fetch threads ordered by likes desc (no FK join)
      const { data: threadRows } = await supabase
        .from('threads')
        .select('id, user_id, content, likes_count, created_at')
        .order('likes_count', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(50);

      if (!threadRows || threadRows.length === 0) { setThreads([]); setLoadingThreads(false); return; }

      // Batch-fetch usernames+avatars for thread authors
      const threadUserIds = [...new Set(threadRows.map(t => t.user_id))];
      const { data: threadProfiles } = await supabase
        .from('profiles').select('id, username, avatar_url').in('id', threadUserIds);
      (threadProfiles || []).forEach(primeProfile);
      const profileMap = Object.fromEntries((threadProfiles || []).map(p => [p.id, p]));

      // Fetch which threads current user liked
      const { data: myLikes } = await supabase
        .from('thread_likes')
        .select('thread_id')
        .eq('user_id', user.id);
      const likedSet = new Set((myLikes || []).map(l => l.thread_id));

      // Fetch comments for all threads (no FK join)
      const threadIds = threadRows.map(t => t.id);
      let commentRows = [];
      if (threadIds.length > 0) {
        const { data: comments } = await supabase
          .from('thread_comments')
          .select('id, thread_id, user_id, content, parent_id, created_at')
          .in('thread_id', threadIds)
          .order('created_at', { ascending: true });
        commentRows = comments || [];
      }

      // Batch-fetch usernames+avatars for comment authors
      const commentUserIds = [...new Set(commentRows.map(c => c.user_id))];
      let commentProfileMap = {};
      if (commentUserIds.length > 0) {
        const { data: cp } = await supabase
          .from('profiles').select('id, username, avatar_url').in('id', commentUserIds);
        (cp || []).forEach(primeProfile);
        commentProfileMap = Object.fromEntries((cp || []).map(p => [p.id, p]));
      }

      const commentsByThread = {};
      commentRows.forEach(c => {
        if (!commentsByThread[c.thread_id]) commentsByThread[c.thread_id] = [];
        const prof = commentProfileMap[c.user_id] || {};
        commentsByThread[c.thread_id].push({
          ...c,
          username:   prof.username   || '?',
          avatar_url: prof.avatar_url || null,
        });
      });

      const mapped = threadRows.map(t => {
        const prof = profileMap[t.user_id] || {};
        return {
          ...t,
          username:    prof.username   || '?',
          avatar_url:  prof.avatar_url || null,
          liked_by_me: likedSet.has(t.id),
          comments:    commentsByThread[t.id] || [],
        };
      });
      setThreads(mapped);
      cacheSet('social:threads', mapped);
    } catch (e) { console.error(e); }
    finally { setLoadingThreads(false); }
  }

  // Silent version of loadThreads — no loading state, used by useOnFocus
  async function refreshThreads() {
    try { await loadThreadsData(); } catch (e) { console.error(e); }
  }

  // Shared data-fetching logic for loadThreads and refreshThreads
  async function loadThreadsData() {
    const { data: threadRows } = await supabase
      .from('threads')
      .select('id, user_id, content, created_at, like_count')
      .order('created_at', { ascending: false })
      .limit(50);

    if (!threadRows || threadRows.length === 0) { setThreads([]); return; }

    const threadUserIds = [...new Set(threadRows.map(t => t.user_id))];
    const { data: threadProfiles } = await supabase
      .from('profiles').select('id, username, avatar_url').in('id', threadUserIds);

    const profileMap = Object.fromEntries((threadProfiles || []).map(p => [p.id, p]));

    const { data: myLikes } = await supabase
      .from('thread_likes').select('thread_id').eq('user_id', user.id);
    const likedSet = new Set((myLikes || []).map(l => l.thread_id));

    const threadIds = threadRows.map(t => t.id);
    let commentRows = [];
    if (threadIds.length > 0) {
      const { data: comments } = await supabase
        .from('thread_comments')
        .select('id, thread_id, user_id, content, parent_id, created_at')
        .in('thread_id', threadIds)
        .order('created_at', { ascending: true });
      commentRows = comments || [];
    }

    const commentUserIds = [...new Set(commentRows.map(c => c.user_id))];
    let commentProfileMap = {};
    if (commentUserIds.length > 0) {
      const { data: cp } = await supabase
        .from('profiles').select('id, username, avatar_url').in('id', commentUserIds);
      commentProfileMap = Object.fromEntries((cp || []).map(p => [p.id, p]));
    }

    const commentsByThread = {};
    commentRows.forEach(c => {
      if (!commentsByThread[c.thread_id]) commentsByThread[c.thread_id] = [];
      const prof = commentProfileMap[c.user_id] || {};
      commentsByThread[c.thread_id].push({
        ...c,
        username: prof.username || '?',
        avatar_url: prof.avatar_url || null,
      });
    });

    setThreads(threadRows.map(t => {
      const prof = profileMap[t.user_id] || {};
      return {
        ...t,
        username:    prof.username   || '?',
        avatar_url:  prof.avatar_url || null,
        liked_by_me: likedSet.has(t.id),
        comments:    commentsByThread[t.id] || [],
      };
    }));
  }
    if (!newThreadText.trim() || postingThread) return;
    setPostingThread(true);
    const { error } = await supabase.from('threads').insert({
      user_id: user.id,
      content: newThreadText.trim(),
      likes_count: 0,
    });
    if (!error) {
      setNewThreadText('');
      await loadThreads();
    }
    setPostingThread(false);
  }

  async function likeThread(threadId, currentlyLiked) {
    // Optimistic update
    setThreads(prev => prev.map(t =>
      t.id === threadId
        ? { ...t, liked_by_me: !currentlyLiked, likes_count: (t.likes_count || 0) + (currentlyLiked ? -1 : 1) }
        : t
    ));

    if (currentlyLiked) {
      await supabase.from('thread_likes').delete()
        .eq('thread_id', threadId).eq('user_id', user.id);
      await supabase.from('threads').update({ likes_count: supabase.rpc ? undefined : undefined })
        .eq('id', threadId);
      // Decrement via RPC or manual fetch
      await supabase.rpc('decrement_thread_likes', { thread_id: threadId });
    } else {
      await supabase.from('thread_likes').insert({ thread_id: threadId, user_id: user.id });
      await supabase.rpc('increment_thread_likes', { thread_id: threadId });
      
      // Notify thread author
      const thread = threads.find(t => t.id === threadId);
      if (thread && thread.user_id !== user.id) {
        await supabase.from('notifications').insert({
          user_id: thread.user_id,
          actor_id: user.id,
          type: 'thread_like',
          reference_id: thread.id,
          message: `@${user.user_metadata?.username || 'Someone'} liked your thread`
        });
      }
    }
  }

  async function deleteThread(threadId) {
    if (!window.confirm('Delete this thread?')) return;
    await supabase.from('threads').delete().eq('id', threadId);
    setThreads(prev => prev.filter(t => t.id !== threadId));
  }

  async function submitComment(threadId, content, parentId) {
    const { data } = await supabase
      .from('thread_comments')
      .insert({ thread_id: threadId, user_id: user.id, content, parent_id: parentId || null })
      .select('id, thread_id, user_id, content, parent_id, created_at')
      .single();

    if (data) {
      setThreads(prev => prev.map(t =>
        t.id === threadId
          ? { ...t, comments: [...t.comments, { ...data, username: user.user_metadata?.username || 'You' }] }
          : t
      ));
      
      const thread = threads.find(t => t.id === threadId);
      let targetUserId = thread?.user_id;

      if (parentId) {
        const parentComment = thread?.comments?.find(c => c.id === parentId);
        if (parentComment) {
          targetUserId = parentComment.user_id;
        }
      }

      if (targetUserId && targetUserId !== user.id) {
        await supabase.from('notifications').insert({
          user_id: targetUserId,
          actor_id: user.id,
          type: parentId ? 'reply' : 'thread_comment',
          reference_id: threadId,
          message: `@${user.user_metadata?.username || 'Someone'} ${parentId ? 'replied to your comment' : 'commented on your thread'}`
        });
      }

      // Refresh to get real username
      await loadThreads();
    }
  }

  // ─── Search ───────────────────────────────
  const handleSearch = (q) => {
    setSearchQuery(q);
    clearTimeout(searchTimeout.current);
    if (!q.trim()) { setSearchResults([]); setThreadSearch([]); return; }

    searchTimeout.current = setTimeout(async () => {
      // Search users
      const { data: users } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .ilike('username', `%${q}%`)
        .neq('id', user.id)
        .limit(10);
      setSearchResults(users || []);

      // Search threads (no FK join)
      const { data: thr } = await supabase
        .from('threads')
        .select('id, user_id, content, likes_count, created_at')
        .ilike('content', `%${q}%`)
        .order('likes_count', { ascending: false })
        .limit(20);

      if (thr && thr.length > 0) {
        const thrUserIds = [...new Set(thr.map(t => t.user_id))];
        const { data: thrProfiles } = await supabase
          .from('profiles').select('id, username, avatar_url').in('id', thrUserIds);
        (thrProfiles || []).forEach(primeProfile);
        const thrProfileMap = Object.fromEntries((thrProfiles || []).map(p => [p.id, p]));
        const { data: myLikes } = await supabase
          .from('thread_likes').select('thread_id').eq('user_id', user.id);
        const likedSet = new Set((myLikes || []).map(l => l.thread_id));
        setThreadSearch(thr.map(t => {
          const prof = thrProfileMap[t.user_id] || {};
          return {
            ...t,
            username:    prof.username   || '?',
            avatar_url:  prof.avatar_url || null,
            liked_by_me: likedSet.has(t.id),
            comments:    [],
          };
        }));
      } else {
        setThreadSearch([]);
      }
    }, 350);
  };

  // ─── Friend helpers ───────────────────────
  const isFriend     = (id) => friends.some(f => f.id === id);
  const hasPendingOut = (id) => outgoing.some(r => r.addressee_id === id);

  const sendRequest = async (targetId) => {
    const { error } = await supabase.from('friendships').insert([{ requester_id: user.id, addressee_id: targetId }]);
    if (!error) { 
      showToast('Friend request sent!'); 
      await supabase.from('notifications').insert({
        user_id: targetId,
        actor_id: user.id,
        type: 'friend_request',
        message: `@${user.user_metadata?.username || 'Someone'} sent you a friend request`
      });
      loadSocial(); 
    }
  };
  const acceptRequest  = async (id) => { await supabase.from('friendships').update({ status: 'accepted' }).eq('id', id); showToast('Friend added!'); loadSocial(); };
  const declineRequest = async (id) => { await supabase.from('friendships').delete().eq('id', id); loadSocial(); };
  const removeFriend   = async (id) => { await supabase.from('friendships').delete().eq('id', id); showToast('Friend removed.'); loadSocial(); };

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 3000); }

  const displayedThreads = searchQuery.trim() ? threadSearch : threads;

  return (
    <div className="social-page page-wrapper fade-in">
      {/* ── Header ── */}
      <div className="social-header">
        <div>
          <h1 className="page-title">Social</h1>
          <p className="page-subtitle">Connect, message, and share thoughts.</p>
        </div>
        <button className="btn-create-group" onClick={() => navigate('/create-group')}>
          + New Group
        </button>
      </div>

      {/* ── Search ── */}
      <SearchBar placeholder="Search users or threads…" onSearch={handleSearch} />

      {/* ── Two-column layout ── */}
      <div className="social-columns">

        {/* ════════ LEFT: Messages ════════ */}
        <div className="social-col">
          <div className="col-header">
            <h2 className="col-title">Messages</h2>
            {(friends.length + groupChats.length) > 0 && (
              <span className="count-badge">{friends.length + groupChats.length}</span>
            )}
          </div>

          <div className="col-scroll">
            {/* User search results */}
            {searchResults.length > 0 && (
              <div className="col-section">
                <p className="col-section-label">People</p>
                <div className="user-list">
                  {searchResults.map(u => (
                    <div key={u.id} className="user-card">
                      <Link to={`/user/${u.id}`} className="user-avatar-link">
                        <Avatar
                          url={u.avatar_url}
                          username={u.username}
                          size={34}
                          className="user-avatar"
                        />
                      </Link>
                      <Link to={`/user/${u.id}`} className="user-name-link">
                        <span className="user-name">@{u.username}</span>
                      </Link>
                      <div className="user-action">
                        {isFriend(u.id) ? (
                          <span className="badge badge--friend">Friends</span>
                        ) : hasPendingOut(u.id) ? (
                          <span className="badge badge--pending">Pending</span>
                        ) : (
                          <button className="btn-add" onClick={() => sendRequest(u.id)}>+ Add</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pending requests */}
            {!loadingMessages && requests.length > 0 && (
              <div className="col-section">
                <p className="col-section-label">
                  Requests <span className="count-badge">{requests.length}</span>
                </p>
                <div className="user-list">
                  {requests.map(r => (
                    <div key={r.id} className="user-card">
                      <Link to={`/user/${r.requester?.id}`} className="user-avatar-link">
                        <Avatar
                          url={r.requester?.avatar_url}
                          username={r.requester?.username}
                          size={34}
                          className="user-avatar"
                        />
                      </Link>
                      <Link to={`/user/${r.requester?.id}`} className="user-name-link">
                        <span className="user-name">@{r.requester?.username}</span>
                      </Link>
                      <div className="request-actions">
                        <button className="btn-accept" onClick={() => acceptRequest(r.id)}>Accept</button>
                        <button className="btn-decline" onClick={() => declineRequest(r.id)}>Decline</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Conversations */}
            <div className="col-section">
              {loadingMessages ? (
                <div className="loading-center"><div className="spinner" /></div>
              ) : friends.length === 0 && groupChats.length === 0 ? (
                <div className="empty-state-col">
                  <p>No conversations yet. Add a friend to get started!</p>
                </div>
              ) : (
                <div className="user-list">
                  {groupChats.map(g => (
                    <div key={g.id} className="user-card group-chat-card">
                      <div className="group-avatar">#</div>
                      <div className="user-info">
                        <span className="user-name">{g.name}</span>
                        <span className="group-members-count">{g.group_chat_members?.length || 0} members</span>
                      </div>
                      <button className="btn-message" onClick={() => navigate(`/group-chats/${g.id}`)}>Open</button>
                    </div>
                  ))}
                  {friends.map(f => (
                    <div key={f.id} className="user-card">
                      <Link to={`/user/${f.id}`} className="user-avatar-link">
                        <Avatar
                          url={f.avatar_url}
                          username={f.username}
                          size={34}
                          className="user-avatar"
                        />
                      </Link>
                      <Link to={`/user/${f.id}`} className="user-name-link">
                        <span className="user-name">@{f.username}</span>
                      </Link>
                      <div className="friend-actions">
                        <button className="btn-message" onClick={() => navigate(`/messages/${f.id}`)}>Message</button>
                        <button className="btn-remove" onClick={() => removeFriend(f.friendship_id)}>Remove</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ════════ RIGHT: Threads ════════ */}
        <div className="social-col">
          <div className="col-header">
            <h2 className="col-title">Threads</h2>
            {searchQuery && <span className="col-search-hint">Results for "{searchQuery}"</span>}
          </div>

          <div className="col-scroll">
            {/* Compose */}
            {!searchQuery && (
              <div className="thread-compose">
                <Avatar
                  url={profile?.avatar_url}
                  username={profile?.username || user?.email}
                  size={34}
                  className="thread-compose-avatar"
                />
                <div className="thread-compose-right">
                  <textarea
                    className="thread-compose-input"
                    placeholder="What are you thinking about?"
                    value={newThreadText}
                    onChange={e => setNewThreadText(e.target.value)}
                    rows={2}
                    maxLength={500}
                  />
                  <div className="thread-compose-footer">
                    <span className="thread-compose-count">{newThreadText.length}/500</span>
                    <button
                      className="btn-post-thread"
                      onClick={postThread}
                      disabled={postingThread || !newThreadText.trim()}
                    >
                      {postingThread ? '…' : 'Post'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Thread list */}
            {loadingThreads ? (
              <div className="loading-center"><div className="spinner" /></div>
            ) : displayedThreads.length === 0 ? (
              <div className="empty-state-col">
                <p>{searchQuery ? 'No threads match your search.' : 'No threads yet. Be the first to post!'}</p>
              </div>
            ) : (
              <div className="threads-list">
                {displayedThreads.map(t => (
                  <ThreadCard
                    key={t.id}
                    thread={t}
                    currentUser={user}
                    onLike={likeThread}
                    onDelete={deleteThread}
                    onCommentSubmit={submitComment}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}