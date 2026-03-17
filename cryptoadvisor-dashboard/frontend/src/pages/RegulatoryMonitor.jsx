import { useState, useEffect } from 'react';
import { api } from '../api/client';
import Card from '../components/Card';
import AiInsightPanel from '../components/AiInsightPanel';
import LoadingSpinner from '../components/LoadingSpinner';

const btnStyle = {
  padding: '0.6rem 1.5rem',
  background: '#7b61ff',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
  fontWeight: 600,
};

const riskColors = {
  low: { bg: '#1e3a2e', color: '#4ade80' },
  medium: { bg: '#3b3b1e', color: '#f59e0b' },
  high: { bg: '#3a1e1e', color: '#f87171' },
  critical: { bg: '#2d0a0a', color: '#dc2626' },
};

export default function RegulatoryMonitor() {
  const [briefing, setBriefing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [riskAssessment, setRiskAssessment] = useState(null);
  const [riskLoading, setRiskLoading] = useState(false);

  useEffect(() => {
    api.get('/api/ai-advanced/regulatory')
      .then((res) => {
        const text = typeof res === 'string' ? res : res.briefing || res.analysis || res.content || res.result || JSON.stringify(res, null, 2);
        setBriefing(text);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const assessRisk = async () => {
    setRiskLoading(true);
    setError('');
    setRiskAssessment(null);
    try {
      const res = await api.post('/api/ai-advanced/regulatory-risk', {});
      setRiskAssessment(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setRiskLoading(false);
    }
  };

  const riskItems = riskAssessment?.risks || riskAssessment?.tokens || [];
  const riskText = typeof riskAssessment === 'string' ? riskAssessment :
    riskAssessment?.analysis || riskAssessment?.summary || riskAssessment?.content || null;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <h2 style={{ color: '#e0e0e0', margin: 0 }}>Regulatory Monitor</h2>
        <button onClick={assessRisk} disabled={riskLoading} style={btnStyle}>
          {riskLoading ? 'Assessing...' : 'Assess My Risk'}
        </button>
      </div>

      {error && <div style={{ color: '#f87171', marginBottom: '1rem' }}>{error}</div>}

      {loading ? <LoadingSpinner /> : (
        <AiInsightPanel
          title="Regulatory Briefing"
          content={briefing}
          loading={false}
          onRefresh={() => {
            setLoading(true);
            api.get('/api/ai-advanced/regulatory')
              .then((res) => {
                const text = typeof res === 'string' ? res : res.briefing || res.analysis || res.content || res.result || JSON.stringify(res, null, 2);
                setBriefing(text);
              })
              .catch((err) => setError(err.message))
              .finally(() => setLoading(false));
          }}
        />
      )}

      {riskLoading && <LoadingSpinner />}

      {/* Risk Assessment */}
      {riskAssessment && (
        <div style={{ marginTop: '1.5rem' }}>
          {riskText && (
            <AiInsightPanel
              title="Risk Assessment"
              content={riskText}
              loading={false}
              onClose={() => setRiskAssessment(null)}
            />
          )}

          {riskItems.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
              {riskItems.map((item, i) => {
                const level = (item.risk_level || item.risk || item.level || 'medium').toLowerCase();
                const rc = riskColors[level] || riskColors.medium;
                return (
                  <Card key={i}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <span style={{ color: '#e0e0e0', fontWeight: 700, fontSize: '1rem' }}>
                        {item.token || item.name || item.symbol || '--'}
                      </span>
                      <span style={{
                        background: rc.bg, color: rc.color,
                        padding: '2px 8px', borderRadius: 4, fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase',
                      }}>
                        {level}
                      </span>
                    </div>
                    {(item.details || item.reason) && (
                      <div style={{ color: '#888', fontSize: '0.85rem' }}>{item.details || item.reason}</div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
