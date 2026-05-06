import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import './Settings.css';

export default function Settings() {
  const { profile, updateProfile, signOut } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState(profile?.username || '');
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');
  const [success, setSuccess]   = useState('');

  const handleSave = async (e) => {
    e.preventDefault();
    if (username.trim().length < 3) {
      setError('Username must be at least 3 characters.');
      return;
    }
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await updateProfile({ username: username.trim() });
      setSuccess('Profile updated!');
    } catch (err) {
      setError(err.message || 'Failed to update profile.');
    } finally {
      setSaving(false);
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

          {error   && <p className="settings-error">{error}</p>}
          {success && <p className="settings-success">{success}</p>}

          <button type="submit" className="btn-save-settings" disabled={saving}>
            {saving ? <span className="btn-spinner" /> : 'Save Changes'}
          </button>
        </form>
      </div>

      <div className="settings-card danger-zone">
        <h2>Account</h2>
        <p>Signing out will end your current session.</p>
        <button className="btn-logout" onClick={handleLogout}>
          Sign Out
        </button>
      </div>
    </div>
  );
}
