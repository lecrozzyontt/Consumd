import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../services/supabase';
import LegalModal from '../components/LegalModal';
import './Auth.css';

export default function Auth() {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(null);
  const [showLegal, setShowLegal] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);

  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (mode === 'signup') {
      if (username.length < 3) {
        setError('Username must be at least 3 characters.');
        return;
      }
      if (!termsAccepted) {
        setError('You must accept the Terms of Service and Community Guidelines to create an account.');
        return;
      }
    }

    setLoading(true);
    try {
      if (mode === 'login') {
        await signIn(email, password);
        navigate('/');
      } else {
        await signUp(email, password, username);
        alert('A confirmation email has been sent 📧 Please check your inbox to activate your account.');
        navigate('/');
      }
    } catch (err) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  const handleOAuth = async (provider) => {
    setError('');
    setOauthLoading(provider);
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/` },
    });
    if (error) {
      setError(error.message || `Failed to sign in with ${provider}.`);
      setOauthLoading(null);
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

        <div className="auth-tabs">
          <button
            className={mode === 'login' ? 'active' : ''}
            onClick={() => { setMode('login'); setError(''); setTermsAccepted(false); }}
          >
            Sign In
          </button>
          <button
            className={mode === 'signup' ? 'active' : ''}
            onClick={() => { setMode('signup'); setError(''); setTermsAccepted(false); }}
          >
            Create Account
          </button>
        </div>

        <div className="auth-divider"><span>or</span></div>

        <form onSubmit={handleSubmit} className="auth-form">
          {mode === 'signup' && (
            <div className="field">
              <label>Username</label>
              <input
                type="text"
                placeholder="yourname"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
                minLength={3}
              />
            </div>
          )}

          <div className="field">
            <label>Email</label>
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div className="field">
            <label>Password</label>
            <input
              type="password"
              placeholder={mode === 'signup' ? 'Min. 6 characters' : '••••••••'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </div>

          {/* ── Terms checkbox — REQUIRED before signup ── */}
          {mode === 'signup' && (
            <div className="field terms-field">
              <label className="terms-checkbox-label">
                <input
                  type="checkbox"
                  className="terms-checkbox"
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                />
                <span className="terms-text">
                  I agree to the{' '}
                  <button
                    type="button"
                    className="terms-link"
                    onClick={() => setShowLegal(true)}
                  >
                    Terms of Service
                  </button>{' '}
                  and confirm I will not post abusive, hateful, sexual, violent, or otherwise
                  objectionable content. Violations may result in account suspension or removal.
                </span>
              </label>

              {/* Community rules summary */}
              <div className="community-rules">
                <p className="community-rules-title">Community Guidelines</p>
                <ul>
                  <li>🚫 No harassment or hate speech</li>
                  <li>🚫 No nudity or sexual content</li>
                  <li>🚫 No abusive or violent behavior</li>
                  <li>⚠️ Accounts may be banned for violations</li>
                </ul>
              </div>
            </div>
          )}

          {error && <p className="auth-error">{error}</p>}

          <button
            type="submit"
            className="auth-submit"
            disabled={loading || (mode === 'signup' && !termsAccepted)}
          >
            {loading
              ? <span className="btn-spinner" />
              : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <p className="auth-footer">
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <button
            onClick={() => {
              setMode(mode === 'login' ? 'signup' : 'login');
              setError('');
              setTermsAccepted(false);
            }}
          >
            {mode === 'login' ? 'Sign up' : 'Sign in'}
          </button>
        </p>
      </div>

      <LegalModal isOpen={showLegal} onClose={() => setShowLegal(false)} />
    </div>
  );
}
