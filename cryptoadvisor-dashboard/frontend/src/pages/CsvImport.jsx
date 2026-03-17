import { useState } from 'react';
import Card from '../components/Card';
import LoadingSpinner from '../components/LoadingSpinner';

const selectStyle = {
  padding: '0.6rem 1rem',
  background: '#12121f',
  border: '1px solid #2a2a3d',
  borderRadius: 8,
  color: '#e0e0e0',
  fontSize: '0.95rem',
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

const cellStyle = { padding: '0.75rem', borderBottom: '1px solid #1a1a2e' };
const headStyle = { ...cellStyle, color: '#888', textAlign: 'left', fontSize: '0.85rem', borderBottom: '1px solid #2a2a3d' };

const EXCHANGES = ['Binance', 'Coinbase', 'Kraken'];

export default function CsvImport() {
  const [exchange, setExchange] = useState('Binance');
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    setFile(f || null);
    setResult(null);
    setPreview(null);
    setError('');

    // Parse preview from CSV
    if (f) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const text = ev.target.result;
          const lines = text.split('\n').filter((l) => l.trim());
          if (lines.length < 2) { setPreview(null); return; }
          const headers = lines[0].split(',').map((h) => h.trim().replace(/"/g, ''));
          const rows = lines.slice(1, 6).map((line) =>
            line.split(',').map((c) => c.trim().replace(/"/g, ''))
          );
          setPreview({ headers, rows });
        } catch {
          setPreview(null);
        }
      };
      reader.readAsText(f);
    }
  };

  const importCsv = async () => {
    if (!file) { setError('Please select a CSV file.'); return; }
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('exchange', exchange);

      const res = await fetch('/api/csv-import', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      if (res.status === 401) { window.location.href = '/login'; throw new Error('Unauthorized'); }
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const data = await res.json();
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const imported = result?.imported || result?.imported_count || 0;
  const duplicates = result?.duplicates || result?.duplicates_skipped || 0;
  const errors = result?.errors || [];

  return (
    <div>
      <h2 style={{ color: '#e0e0e0', marginBottom: '1.5rem' }}>CSV Trade Import</h2>

      {error && <div style={{ color: '#f87171', marginBottom: '1rem', padding: '0.75rem', background: '#3a1e1e', borderRadius: 8 }}>{error}</div>}

      <Card title="Import Trades">
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={{ color: '#888', fontSize: '0.85rem', display: 'block', marginBottom: 4 }}>Exchange</label>
            <select value={exchange} onChange={(e) => setExchange(e.target.value)} style={selectStyle}>
              {EXCHANGES.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
          <div>
            <label style={{ color: '#888', fontSize: '0.85rem', display: 'block', marginBottom: 4 }}>CSV File</label>
            <input
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              style={{
                padding: '0.4rem',
                background: '#12121f',
                border: '1px solid #2a2a3d',
                borderRadius: 8,
                color: '#e0e0e0',
                fontSize: '0.9rem',
              }}
            />
          </div>
          <button onClick={importCsv} disabled={loading || !file} style={btnStyle}>
            {loading ? 'Importing...' : 'Import'}
          </button>
        </div>
      </Card>

      {loading && <LoadingSpinner />}

      {/* CSV Preview */}
      {preview && !result && (
        <Card title="Preview (First 5 Rows)" style={{ marginTop: '1rem' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {preview.headers.map((h, i) => (
                    <th key={i} style={headStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) => (
                      <td key={ci} style={{ ...cellStyle, color: '#e0e0e0', fontSize: '0.85rem' }}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Results */}
      {result && (
        <div style={{ marginTop: '1.5rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
            <Card>
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: '#4ade80', fontSize: '2rem', fontWeight: 700 }}>{imported}</div>
                <div style={{ color: '#888', fontSize: '0.85rem' }}>Trades Imported</div>
              </div>
            </Card>
            <Card>
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: '#f59e0b', fontSize: '2rem', fontWeight: 700 }}>{duplicates}</div>
                <div style={{ color: '#888', fontSize: '0.85rem' }}>Duplicates Skipped</div>
              </div>
            </Card>
            {errors.length > 0 && (
              <Card>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ color: '#f87171', fontSize: '2rem', fontWeight: 700 }}>{errors.length}</div>
                  <div style={{ color: '#888', fontSize: '0.85rem' }}>Errors</div>
                </div>
              </Card>
            )}
          </div>

          {errors.length > 0 && (
            <Card title="Errors">
              <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                {errors.map((err, i) => (
                  <div key={i} style={{ color: '#f87171', fontSize: '0.85rem', padding: '0.3rem 0', borderBottom: '1px solid #1a1a2e' }}>
                    {typeof err === 'string' ? err : err.message || err.error || JSON.stringify(err)}
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
