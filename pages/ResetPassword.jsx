import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabase';
import './Auth.css';

export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [done, setDone] = useState(false);

  // Track whether a submit is in-flight so the USER_UPDATED listener
  // knows it was triggered by this form and not some other update.
  const submitting = useRef(false);

  const navigate = useNavigate();

  useEffect(() => {
    // Check for an existing session first (e.g. page reload)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setSessionReady(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setSessionReady(true);
      }

      // USER_UPDATED fires when updateUser() succeeds on Supabase's side.
      // This event arrives reliably even when the HTTP promise itself hangs
      // or never resolves — which is the real cause of the stuck spinner.
      if (event === 'USER_UPDATED' && submitting.current) {
        submitting.current = false;
        setDone(true);
        setLoading(false);
        setTimeout(async () => {
          await supabase.auth.signOut();
          navigate('/auth');
        }, 2000);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    submitting.current = true;

    // We still await to catch hard errors (e.g. expired link),
    // but success is handled by the USER_UPDATED listener above.
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      submitting.current = false;
      setError(error.message || 'Failed to update password. Your link may have expired.');
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-bg" />

      <div className="auth-card fade-in">
        <div className="auth-brand">
          <h1>Consumd</h1>
          <p>Your media. Your archive.</p>
        </div>

        {done ? (
          <div className="auth-reset-sent">
            <span className="auth-reset-icon">✅</span>
            <p className="auth-reset-sent-title">Password updated!</p>
            <p className="auth-reset-sent-sub">
              Your password has been changed. Redirecting you to sign in…
            </p>
          </div>
        ) : !sessionReady ? (
          <div className="auth-reset-sent">
            <span className="auth-reset-icon">⏳</span>
            <p className="auth-reset-sent-title">Verifying your link…</p>
            <p className="auth-reset-sent-sub">
              If nothing happens, your reset link may have expired.{' '}
              <button
                className="auth-resend-btn"
                style={{ display: 'inline', marginTop: 0 }}
                onClick={() => navigate('/auth')}
              >
                Request a new one
              </button>
            </p>
          </div>
        ) : (
          <>
            <div className="auth-forgot-header">
              <h2 className="auth-forgot-title">Choose a new password</h2>
              <p className="auth-forgot-sub">
                Pick something strong — at least 6 characters.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="auth-form">
              <div className="field">
                <label>New Password</label>
                <input
                  type="password"
                  placeholder="Min. 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  autoFocus
                />
              </div>

              <div className="field">
                <label>Confirm Password</label>
                <input
                  type="password"
                  placeholder="Repeat your new password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  minLength={6}
                  autoComplete="new-password"
                />
              </div>

              {confirm.length > 0 && (
                <p className={`auth-match-hint ${password === confirm ? 'match' : 'no-match'}`}>
                  {password === confirm ? '✓ Passwords match' : '✗ Passwords do not match'}
                </p>
              )}

              {error && <p className="auth-error">{error}</p>}

              <button
                type="submit"
                className="auth-submit"
                disabled={loading || password !== confirm}
              >
                {loading ? <span className="btn-spinner" /> : 'Update Password'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
