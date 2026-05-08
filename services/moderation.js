import { supabase } from './supabase';

// ─── Profanity filter ────────────────────────────────────────────────────────
const BANNED_WORDS = [
  'fuck', 'shit', 'ass', 'bitch', 'cunt', 'dick', 'pussy', 'bastard',
  'nigger', 'nigga', 'faggot', 'retard', 'whore', 'slut', 'asshole',
  'motherfucker', 'cocksucker', 'piss',
];

const BANNED_REGEX = new RegExp(
  `\\b(${BANNED_WORDS.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`,
  'gi'
);

export function filterProfanity(text) {
  if (!text) return text;
  // Reset lastIndex since we reuse the regex globally
  BANNED_REGEX.lastIndex = 0;
  return text.replace(BANNED_REGEX, (match) => '*'.repeat(match.length));
}

export function containsProfanity(text) {
  if (!text) return false;
  BANNED_REGEX.lastIndex = 0;
  return BANNED_REGEX.test(text);
}

// ─── Reports ─────────────────────────────────────────────────────────────────
export async function submitReport({
  reportedUserId,
  contentId,
  contentType,
  reason,
  reporterId,
}) {
  const { error } = await supabase.from('reports').insert({
    reporter_id: reporterId,
    reported_user_id: reportedUserId,
    content_id: String(contentId),
    content_type: contentType,
    reason,
    status: 'pending',
    created_at: new Date().toISOString(),
  });
  return { error };
}

// ─── Block / Unblock ─────────────────────────────────────────────────────────
export async function blockUser(blockerId, blockedId) {
  const { error } = await supabase.from('blocked_users').upsert({
    blocker_id: blockerId,
    blocked_id: blockedId,
    created_at: new Date().toISOString(),
  });
  return { error };
}

export async function unblockUser(blockerId, blockedId) {
  const { error } = await supabase
    .from('blocked_users')
    .delete()
    .eq('blocker_id', blockerId)
    .eq('blocked_id', blockedId);
  return { error };
}

export async function getBlockedUserIds(userId) {
  if (!userId) return [];
  const { data } = await supabase
    .from('blocked_users')
    .select('blocked_id')
    .eq('blocker_id', userId);
  return data?.map(r => r.blocked_id) || [];
}

export async function isUserBlocked(blockerId, blockedId) {
  if (!blockerId || !blockedId) return false;
  const { data } = await supabase
    .from('blocked_users')
    .select('blocker_id')
    .eq('blocker_id', blockerId)
    .eq('blocked_id', blockedId)
    .maybeSingle();
  return !!data;
}
