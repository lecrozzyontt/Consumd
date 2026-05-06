import { useState, useEffect, useRef } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from '../context/AuthContext';
import Avatar from './Avatar';
import './ReviewInteractions.css';

export default function ReviewInteractions({ log }) {
  const { user } = useAuth();
  const inputRef = useRef(null);

  // Likes
  const [likeCount, setLikeCount]   = useState(0);
  const [liked, setLiked]           = useState(false);
  const [likingId, setLikingId]     = useState(null);

  // Comments
  const [comments, setComments]         = useState([]);
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText]   = useState('');
  const [submitting, setSubmitting]     = useState(false);
  const [replyingTo, setReplyingTo]     = useState(null); // { id, username }
  const [commentLikes, setCommentLikes] = useState({});

  useEffect(() => {
    fetchLikes();
    fetchComments();
  }, [log.id]);

  // ── LIKES ──────────────────────────────────────────────
  async function fetchLikes() {
    const { data } = await supabase.from('review_likes').select('user_id').eq('log_id', log.id);
    const rows = data || [];
    setLikeCount(rows.length);
    setLiked(rows.some(r => r.user_id === user?.id));
  }

  async function toggleLike() {
    if (!user || likingId) return;
    setLikingId(log.id);

    if (liked) {
      setLiked(false);
      setLikeCount(c => c - 1);
      await supabase.from('review_likes').delete().eq('log_id', log.id).eq('user_id', user.id);
    } else {
      setLiked(true);
      setLikeCount(c => c + 1);
      await supabase.from('review_likes').insert({ log_id: log.id, user_id: user.id });
      if (log.user_id !== user.id) {
        await supabase.from('notifications').insert({
          user_id: log.user_id, actor_id: user.id, type: 'review_like', log_id: log.id, read: false,
        });
      }
    }
    setLikingId(null);
  }

  // ── COMMENTS ───────────────────────────────────────────
  async function fetchComments() {
    const { data } = await supabase
      .from('comments')
      .select('*, profiles(username, avatar_url)')
      .eq('log_id', log.id)
      .order('created_at', { ascending: true });

    const all = data || [];
    setComments(all);

    if (all.length) {
      const ids = all.map(c => c.id);
      const { data: clData } = await supabase.from('comment_likes').select('comment_id, user_id').in('comment_id', ids);
      const map = {};
      ids.forEach(id => { map[id] = { count: 0, liked: false }; });
      (clData || []).forEach(cl => {
        map[cl.comment_id].count++;
        if (cl.user_id === user?.id) map[cl.comment_id].liked = true;
      });
      setCommentLikes(map);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!commentText.trim() || submitting) return;
    setSubmitting(true);

    const { data, error } = await supabase.from('comments').insert({
      log_id: log.id,
      user_id: user.id,
      content: commentText.trim(),
      parent_id: replyingTo?.id || null
    }).select('*, profiles(username, avatar_url)').single();

    if (!error && data) {
      setComments(prev => [...prev, data]);
      setCommentText('');
      
      const targetUserId = replyingTo ? comments.find(c => c.id === replyingTo.id)?.user_id : log.user_id;

      if (targetUserId && targetUserId !== user.id) {
        await supabase.from('notifications').insert({
          user_id: targetUserId,
          actor_id: user.id,
          type: replyingTo ? 'reply' : 'comment',
          log_id: log.id,
          comment_id: data.id,
          read: false,
        });
      }
      setReplyingTo(null);
    }
    setSubmitting(false);
  }

  async function toggleCommentLike(comment) {
    if (!user) return;
    const current = commentLikes[comment.id] || { count: 0, liked: false };

    setCommentLikes(prev => ({
      ...prev, [comment.id]: { count: current.liked ? current.count - 1 : current.count + 1, liked: !current.liked }
    }));

    if (current.liked) {
      await supabase.from('comment_likes').delete().eq('comment_id', comment.id).eq('user_id', user.id);
    } else {
      await supabase.from('comment_likes').insert({ comment_id: comment.id, user_id: user.id });
      if (comment.user_id !== user.id) {
        await supabase.from('notifications').insert({
          user_id: comment.user_id, actor_id: user.id, type: 'comment_like', log_id: log.id, comment_id: comment.id, read: false,
        });
      }
    }
  }

  async function deleteComment(commentId) {
    await supabase.from('comments').delete().eq('id', commentId);
    setComments(prev => prev.filter(c => c.id !== commentId && c.parent_id !== commentId));
  }

  const handleReplyClick = (comment) => {
    setReplyingTo({ id: comment.id, username: comment.profiles?.username });
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const topLevel = comments.filter(c => !c.parent_id);
  const replies = comments.filter(c => c.parent_id);

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

  return (
    <div className="review-interactions">
      {/* Action Bar */}
      <div className="log-action-bar thread-actions">
        <button
          className={`thread-action-btn ${liked ? 'liked' : ''}`}
          onClick={toggleLike}
          disabled={!user}
        >
          <span>{liked ? '♥' : '♡'}</span>
          <span>{likeCount > 0 ? likeCount : 0}</span>
        </button>

        <button 
          className="thread-action-btn" 
          onClick={() => { setShowComments(e => !e); setTimeout(() => inputRef.current?.focus(), 50); }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: '2px' }}>
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span>{comments.length}</span>
        </button>
      </div>

      {/* Comments Section */}
      {showComments && (
        <div className="thread-comments" style={{ borderTop: 'none', marginTop: '0.2rem', paddingTop: '0.2rem' }}>
          {topLevel.length === 0 && (
            <p className="thread-no-comments">No comments yet.</p>
          )}
          
          {topLevel.map(c => {
            const cl = commentLikes[c.id] || { count: 0, liked: false };
            return (
            <div key={c.id} className="thread-comment">
              <Avatar
                url={c.profiles?.avatar_url}
                username={c.profiles?.username}
                size={24}
                className="tc-avatar"
              />
              <div className="tc-body">
                <div className="tc-top">
                  <span className="tc-username">@{c.profiles?.username}</span>
                  <span className="tc-time">{timeAgo(c.created_at)}</span>
                </div>
                <p className="tc-text">{c.content}</p>
                <div className="tc-actions-row">
                  <button className={`tc-reply-btn ${cl.liked ? 'liked' : ''}`} onClick={() => toggleCommentLike(c)}>
                    {cl.liked ? '♥' : '♡'} {cl.count > 0 && cl.count}
                  </button>
                  <button className="tc-reply-btn" onClick={() => handleReplyClick(c)}>Reply</button>
                  {c.user_id === user?.id && (
                    <button className="tc-reply-btn delete-btn" onClick={() => deleteComment(c.id)}>Delete</button>
                  )}
                </div>

                {/* Nested replies */}
                {replies.filter(r => r.parent_id === c.id).map(r => {
                  const rcl = commentLikes[r.id] || { count: 0, liked: false };
                  return (
                  <div key={r.id} className="thread-comment thread-comment--reply">
                    <Avatar
                      url={r.profiles?.avatar_url}
                      username={r.profiles?.username}
                      size={24}
                      className="tc-avatar"
                    />
                    <div className="tc-body">
                      <div className="tc-top">
                        <span className="tc-username">@{r.profiles?.username}</span>
                        <span className="tc-time">{timeAgo(r.created_at)}</span>
                      </div>
                      <p className="tc-text">{r.content}</p>
                      <div className="tc-actions-row">
                        <button className={`tc-reply-btn ${rcl.liked ? 'liked' : ''}`} onClick={() => toggleCommentLike(r)}>
                          {rcl.liked ? '♥' : '♡'} {rcl.count > 0 && rcl.count}
                        </button>
                        {r.user_id === user?.id && (
                          <button className="tc-reply-btn delete-btn" onClick={() => deleteComment(r.id)}>Delete</button>
                        )}
                      </div>
                    </div>
                  </div>
                )})}
              </div>
            </div>
          )})}

          {/* Comment input form */}
          {user && (
            <form className="tc-form" onSubmit={handleSubmit}>
              {replyingTo && (
                <div className="tc-reply-banner">
                  Replying to @{replyingTo.username}
                  <button type="button" onClick={() => setReplyingTo(null)}>✕</button>
                </div>
              )}
              <div className="tc-input-row">
                <input
                  ref={inputRef}
                  className="tc-input"
                  placeholder={replyingTo ? `Reply to @${replyingTo.username}…` : 'Write a comment…'}
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                  maxLength={300}
                />
                <button className="tc-submit" type="submit" disabled={submitting || !commentText.trim()}>
                  {submitting ? '…' : '↑'}
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}