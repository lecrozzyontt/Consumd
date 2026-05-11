import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../services/supabase';
import './Settings.css';

export default function Settings() {
  const { profile, user, updateProfile, signOut } = useAuth();
  const navigate = useNavigate();

  // ── Profile ──
  const [username, setUsername] = useState(profile?.username || '');
  const [saving, setSaving]     = useState(false);
  const [profileError, setProfileError]     = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');

  // ── Change Password ──
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword]         = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPw, setChangingPw]           = useState(false);
  const [pwError, setPwError]                 = useState('');
  const [pwSuccess, setPwSuccess]             = useState('');
  const changingPwRef = useRef(false);

  // ── Delete Account ──
  const [deletePassword, setDeletePassword]       = useState('');
  const [deleting, setDeleting]                   = useState(false);
  const [deleteError, setDeleteError]             = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Listen for USER_UPDATED — this fires reliably when updateUser() succeeds
  // on Supabase's side, even when the HTTP promise itself hangs.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'USER_UPDATED' && changingPwRef.current) {
        changingPwRef.current = false;
        setChangingPw(false);
        setPwSuccess('Password updated successfully.');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // ── Save username ──
  const handleSave = async (e) => {
    e.preventDefault();
    if (username.trim().length < 3) {
      setProfileError('Username must be at least 3 characters.');
      return;
    }
    setSaving(true);
    setProfileError('');
    setProfileSuccess('');
    try {
      await updateProfile({ username: username.trim() });
      setProfileSuccess('Profile updated!');
    } catch (err) {
      setProfileError(err.message || 'Failed to update profile.');
    } finally {
      setSaving(false);
    }
  };

  // ── Change password ──
  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPwError('');
    setPwSuccess('');

    if (newPassword.length < 6) {
      setPwError('New password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError('New passwords do not match.');
      return;
    }

    setChangingPw(true);
    changingPwRef.current = true;

    // Verify current password first
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });
    if (signInError) {
      changingPwRef.current = false;
      setPwError('Current password is incorrect.');
      setChangingPw(false);
      return;
    }

    // Fire updateUser — success is handled by the USER_UPDATED listener above.
    // We only check for hard errors here (e.g. session expired).
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });
    if (updateError) {
      changingPwRef.current = false;
      setPwError(updateError.message || 'Failed to change password.');
      setChangingPw(false);
    }
  };

  // ── Delete account ──
  const handleDeleteAccount = async (e) => {
    e.preventDefault();
    setDeleteError('');
    setDeleting(true);

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: deletePassword,
      });
      if (signInError) {
        setDeleteError('Incorrect password. Account not deleted.');
        setDeleting(false);
        return;
      }

      const { error: rpcError } = await supabase.rpc('delete_user');
      if (rpcError) throw rpcError;

      await signOut();
      navigate('/auth');
    } catch (err) {
      setDeleteError(err.message || 'Failed to delete account. Please try again.');
      setDeleting(false);
    }
  };

  const handleLogout = async () => {
    await signOut();
    navigate('/auth');
  };

  return (
    <div className="settings-page page-wrapper fade-in">
      <div className="settings-back" onClick={() => navigate(-1)}>
        ← Back
      </div>

      <h1 className="page-title">Settings</h1>
      <p className="page-subtitle">Manage your account.</p>

      {/* ── Profile ── */}
      <div className="settings-card">
        <h2>Profile</h2>
        <form onSubmit={handleSave} className="settings-form">
          <div className="field">
            <label>Username</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              minLength={3}
              required
              autoComplete="username"
            />
          </div>

          {profileError   && <p className="settings-error">{profileError}</p>}
          {profileSuccess && <p className="settings-success">{profileSuccess}</p>}

          <button type="submit" className="btn-save-settings" disabled={saving}>
            {saving ? <span className="btn-spinner" /> : 'Save Changes'}
          </button>
        </form>
      </div>

      {/* ── Change Password ── */}
      <div className="settings-card">
        <h2>Change Password</h2>
        <form onSubmit={handleChangePassword} className="settings-form">
          <div className="field">
            <label>Current Password</label>
            <input
              type="password"
              placeholder="••••••••"
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>
          <div className="field">
            <label>New Password</label>
            <input
              type="password"
              placeholder="Min. 6 characters"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
            />
          </div>
          <div className="field">
            <label>Confirm New Password</label>
            <input
              type="password"
              placeholder="Repeat new password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
            />
          </div>

          {pwError   && <p className="settings-error">{pwError}</p>}
          {pwSuccess && <p className="settings-success">{pwSuccess}</p>}

          <button type="submit" className="btn-save-settings" disabled={changingPw}>
            {changingPw ? <span className="btn-spinner" /> : 'Update Password'}
          </button>
        </form>
      </div>

      {/* ── Account / Sign out ── */}
      <div className="settings-card">
        <h2>Account</h2>
        <p className="settings-muted">Signing out will end your current session.</p>
        <button className="btn-logout" onClick={handleLogout}>
          Sign Out
        </button>
      </div>

      {/* ── Delete Account ── */}
      <div className="settings-card settings-danger-card">
        <h2 className="danger-title">Delete Account</h2>
        <p className="settings-muted">
          This permanently deletes your account and all your data. This cannot be undone.
        </p>

        {!showDeleteConfirm ? (
          <button
            className="btn-delete-account"
            onClick={() => setShowDeleteConfirm(true)}
          >
            Delete My Account
          </button>
        ) : (
          <form onSubmit={handleDeleteAccount} className="settings-form delete-confirm-form">
            <p className="delete-warning">
              Enter your password to confirm. This action is permanent.
            </p>
            <div className="field">
              <label>Password</label>
              <input
                type="password"
                placeholder="••••••••"
                value={deletePassword}
                onChange={e => setDeletePassword(e.target.value)}
                required
                autoFocus
                autoComplete="current-password"
              />
            </div>

            {deleteError && <p className="settings-error">{deleteError}</p>}

            <div className="delete-actions">
              <button
                type="button"
                className="btn-cancel-delete"
                onClick={() => { setShowDeleteConfirm(false); setDeletePassword(''); setDeleteError(''); }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-confirm-delete"
                disabled={deleting || !deletePassword}
              >
                {deleting ? <span className="btn-spinner btn-spinner--light" /> : 'Yes, Delete My Account'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

/*
  ── SUPABASE SETUP for Delete Account ──

  Run this once in your Supabase SQL Editor:

  CREATE OR REPLACE FUNCTION public.delete_user()
  RETURNS void
  LANGUAGE sql
  SECURITY DEFINER
  AS $$
    DELETE FROM auth.users WHERE id = auth.uid();
  $$;
*/
