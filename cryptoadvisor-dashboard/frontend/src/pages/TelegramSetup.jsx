import { useState } from 'react';
import { api } from '../api/client';
import Card from '../components/Card';

const inputStyle = {
  padding: '0.6rem 1rem',
  background: '#12121f',
  border: '1px solid #2a2a3d',
  borderRadius: 8,
  color: '#e0e0e0',
  fontSize: '0.95rem',
  width: '100%',
};

const btnStyle = {
  padding: '0.6rem 1.5rem',
  background: '#646cff',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
  fontWeight: 600,
};

const btnSecondary = {
  padding: '0.6rem 1.5rem',
  background: 'transparent',
  color: '#646cff',
  border: '1px solid #646cff',
  borderRadius: 8,
  cursor: 'pointer',
  fontWeight: 600,
};

export default function TelegramSetup() {
  const [botToken, setBotToken] = useState('');
  const [chatId, setChatId] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const save = async () => {
    if (!botToken.trim() || !chatId.trim()) {
      setError('Both Bot Token and Chat ID are required.');
      return;
    }
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await api.post('/api/telegram/', { bot_token: botToken.trim(), chat_id: chatId.trim() });
      setMessage('Telegram configuration saved successfully.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async () => {
    setTesting(true);
    setError('');
    setMessage('');
    try {
      await api.post('/api/telegram/test', {});
      setMessage('Test message sent! Check your Telegram.');
    } catch (err) {
      setError(err.message);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div>
      <h2 style={{ color: '#e0e0e0', marginBottom: '1.5rem' }}>Telegram Bot Setup</h2>

      {error && <div style={{ color: '#f87171', marginBottom: '1rem', padding: '0.75rem', background: '#3a1e1e', borderRadius: 8 }}>{error}</div>}
      {message && <div style={{ color: '#4ade80', marginBottom: '1rem', padding: '0.75rem', background: '#1e3a2e', borderRadius: 8 }}>{message}</div>}

      <Card title="Configuration">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: 500 }}>
          <div>
            <label style={{ color: '#888', fontSize: '0.85rem', display: 'block', marginBottom: 4 }}>Bot Token</label>
            <input
              type="password"
              value={botToken}
              onChange={(e) => setBotToken(e.target.value)}
              placeholder="123456:ABC-DEF..."
              style={inputStyle}
            />
          </div>
          <div>
            <label style={{ color: '#888', fontSize: '0.85rem', display: 'block', marginBottom: 4 }}>Chat ID</label>
            <input
              value={chatId}
              onChange={(e) => setChatId(e.target.value)}
              placeholder="-1001234567890"
              style={inputStyle}
            />
          </div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button onClick={save} disabled={saving} style={btnStyle}>
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button onClick={sendTest} disabled={testing} style={btnSecondary}>
              {testing ? 'Sending...' : 'Send Test'}
            </button>
          </div>
        </div>
      </Card>

      {/* Instructions */}
      <Card title="How to Set Up" style={{ marginTop: '1.5rem' }}>
        <div style={{ color: '#e0e0e0', lineHeight: 1.8, fontSize: '0.93rem' }}>
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ color: '#646cff', fontWeight: 700, marginBottom: 4 }}>Step 1: Create a Bot</div>
            <ol style={{ margin: 0, paddingLeft: '1.5rem', color: '#aaa' }}>
              <li>Open Telegram and search for <span style={{ color: '#e0e0e0', fontWeight: 600 }}>@BotFather</span></li>
              <li>Send <span style={{ color: '#e0e0e0', fontFamily: 'monospace' }}>/newbot</span> and follow the prompts</li>
              <li>Choose a name and username for your bot</li>
              <li>Copy the <span style={{ color: '#4ade80', fontWeight: 600 }}>API token</span> provided</li>
            </ol>
          </div>
          <div>
            <div style={{ color: '#646cff', fontWeight: 700, marginBottom: 4 }}>Step 2: Get Your Chat ID</div>
            <ol style={{ margin: 0, paddingLeft: '1.5rem', color: '#aaa' }}>
              <li>Start a conversation with your bot (send any message)</li>
              <li>Visit: <span style={{ color: '#e0e0e0', fontFamily: 'monospace', fontSize: '0.85rem' }}>https://api.telegram.org/bot&lt;TOKEN&gt;/getUpdates</span></li>
              <li>Look for <span style={{ color: '#e0e0e0', fontFamily: 'monospace' }}>"chat":{"{"}"id":...</span> in the response</li>
              <li>For groups, add the bot to the group first, then check getUpdates</li>
            </ol>
          </div>
        </div>
      </Card>
    </div>
  );
}
