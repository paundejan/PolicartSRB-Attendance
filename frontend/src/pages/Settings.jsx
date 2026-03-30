import React, { useState, useEffect } from 'react';
import { Save, AlertCircle } from 'lucide-react';

export default function Settings() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    fetch('http://localhost:3001/api/settings')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.data) {
          setEmail(data.data.email || '');
          setPassword(data.data.password || '');
        }
      })
      .catch(err => console.error("Could not fetch settings", err));
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch('http://localhost:3001/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password })
      });
      const result = await res.json();
      if (result.success) {
        setMessage({ type: 'success', text: 'Settings saved successfully!' });
      } else {
        setMessage({ type: 'error', text: result.error || 'Failed to save settings.' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Network error. Make sure backend is running.' });
    }
    setLoading(false);
  };

  return (
    <div>
      <header className="page-header">
        <h1 className="page-title text-gradient">Settings</h1>
        <p className="page-description">Manage your Kadrovska.app credentials securely.</p>
      </header>

      <div className="glass-panel" style={{ padding: '2rem', maxWidth: '600px' }}>
        <div style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'center', background: 'rgba(239, 68, 68, 0.1)', padding: '1rem', borderRadius: '8px', color: 'var(--danger)' }}>
          <AlertCircle size={24} />
          <p style={{ fontSize: '0.9rem' }}>
            Your credentials are stored strictly in your local SQLite database and are only used by the Playwright scraper to automate your daily login.
          </p>
        </div>

        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Email Address</label>
            <input 
              type="email" 
              className="input-glass" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
              required
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Password</label>
            <input 
              type="password" 
              className="input-glass" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="********"
            />
          </div>

          {message && (
            <div style={{ color: message.type === 'success' ? 'var(--success)' : 'var(--danger)', fontWeight: 500 }}>
              {message.text}
            </div>
          )}

          <button type="submit" className="btn-primary" disabled={loading} style={{ width: 'fit-content' }}>
            <Save size={18} />
            {loading ? 'Saving...' : 'Save Credentials'}
          </button>
        </form>
      </div>
    </div>
  );
}
