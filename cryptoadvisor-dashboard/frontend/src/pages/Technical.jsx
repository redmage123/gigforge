import { useState, useEffect, useCallback, useRef } from 'react'
import { GridLayout } from 'react-grid-layout'
import { api } from '../api/client'
import Card from '../components/Card'
import LoadingSpinner from '../components/LoadingSpinner'
import AiAnalysisButton from '../components/AiAnalysisButton'
import AiInsightPanel from '../components/AiInsightPanel'
import 'react-grid-layout/css/styles.css'

const COINS = ['bitcoin', 'ethereum', 'solana', 'cardano', 'polkadot', 'avalanche-2', 'chainlink', 'polygon']

const INDICATOR_LABELS = {
  candlestick: 'Candlestick Chart',
  rsi: 'RSI (Relative Strength Index)',
  macd: 'MACD',
  bollinger: 'Bollinger Bands',
}

function Technical() {
  const [coin, setCoin] = useState('bitcoin')
  const [layout, setLayout] = useState([])
  const [availableIndicators, setAvailableIndicators] = useState([])
  const [chartData, setChartData] = useState({})
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState('')
  const [aiInsight, setAiInsight] = useState(null)
  const [aiInsightLoading, setAiInsightLoading] = useState(false)
  const [showAddPanel, setShowAddPanel] = useState(false)
  const [editingLabel, setEditingLabel] = useState(null)
  const [labelInput, setLabelInput] = useState('')
  const [containerWidth, setContainerWidth] = useState(1200)
  const containerRef = useRef(null)
  const plotlyRefs = useRef({})

  // Measure container width
  useEffect(() => {
    const measure = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.offsetWidth)
      }
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  // Load saved layout
  useEffect(() => {
    api.get('/api/settings/technical-layout')
      .then((res) => {
        setLayout(res.layout || [])
        setAvailableIndicators(res.available_indicators || [])
      })
      .catch(() => {
        setLayout([
          { i: 'candlestick', x: 0, y: 0, w: 12, h: 7, label: 'Candlestick Chart', indicatorId: 'candlestick' },
          { i: 'rsi-1', x: 0, y: 7, w: 4, h: 4, label: 'RSI', indicatorId: 'rsi' },
          { i: 'macd-1', x: 4, y: 7, w: 4, h: 4, label: 'MACD', indicatorId: 'macd' },
          { i: 'bollinger-1', x: 8, y: 7, w: 4, h: 4, label: 'Bollinger Bands', indicatorId: 'bollinger' },
        ])
      })
  }, [])

  // Fetch chart data
  useEffect(() => {
    if (layout.length === 0) return
    setLoading(true)
    setError('')

    const indicatorIds = [...new Set(layout.map((item) => item.indicatorId))]
    const fetches = indicatorIds.map((id) => {
      if (id === 'candlestick') {
        return api.get(`/api/charts/candlestick/${coin}`).then((data) => [id, data]).catch(() => [id, null])
      }
      return api.get(`/api/charts/technical/${coin}?indicator=${id}`).then((data) => [id, data]).catch(() => [id, null])
    })

    Promise.all(fetches)
      .then((results) => {
        const data = {}
        results.forEach(([id, val]) => { data[id] = val })
        setChartData(data)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [coin, layout.length])

  // Render Plotly charts after data loads
  useEffect(() => {
    if (!chartData.candlestick) return
    layout.forEach((item) => {
      if (item.indicatorId === 'candlestick') {
        const el = plotlyRefs.current[item.i]
        if (!el) return
        const data = chartData.candlestick
        import('plotly.js-dist-min').then((Plotly) => {
          Plotly.default.newPlot(el, data.data || [], {
            ...(data.layout || {}),
            paper_bgcolor: '#1e1e2f',
            plot_bgcolor: '#12121f',
            font: { color: '#aaa' },
            margin: { l: 50, r: 20, t: 30, b: 40 },
            xaxis: { ...data.layout?.xaxis, gridcolor: '#2a2a3d' },
            yaxis: { ...data.layout?.yaxis, gridcolor: '#2a2a3d' },
          }, { responsive: true })
        })
      }
    })
  }, [chartData, layout])

  const handleLayoutChange = useCallback((newGridLayout) => {
    const merged = newGridLayout.map((gridItem) => {
      const existing = layout.find((l) => l.i === gridItem.i)
      return {
        i: gridItem.i,
        x: gridItem.x,
        y: gridItem.y,
        w: gridItem.w,
        h: gridItem.h,
        label: existing?.label || 'Indicator',
        indicatorId: existing?.indicatorId || 'rsi',
      }
    })
    setLayout(merged)
    api.put('/api/settings/technical-layout', { layout: merged }).catch(() => {})
  }, [layout])

  const addIndicator = (indicatorId) => {
    const count = layout.filter((l) => l.indicatorId === indicatorId).length
    const id = `${indicatorId}-${count + 1}`
    const maxY = layout.reduce((max, l) => Math.max(max, l.y + l.h), 0)
    const newItem = {
      i: id,
      x: 0,
      y: maxY,
      w: indicatorId === 'candlestick' ? 12 : 4,
      h: indicatorId === 'candlestick' ? 6 : 5,
      label: INDICATOR_LABELS[indicatorId] || indicatorId,
      indicatorId,
    }
    const newLayout = [...layout, newItem]
    setLayout(newLayout)
    api.put('/api/settings/technical-layout', { layout: newLayout }).catch(() => {})
    setShowAddPanel(false)
  }

  const removeIndicator = (itemId) => {
    const newLayout = layout.filter((l) => l.i !== itemId)
    setLayout(newLayout)
    api.put('/api/settings/technical-layout', { layout: newLayout }).catch(() => {})
  }

  const startEditLabel = (item) => {
    setEditingLabel(item.i)
    setLabelInput(item.label)
  }

  const saveLabel = (itemId) => {
    const newLayout = layout.map((l) =>
      l.i === itemId ? { ...l, label: labelInput || l.label } : l
    )
    setLayout(newLayout)
    api.put('/api/settings/technical-layout', { layout: newLayout }).catch(() => {})
    setEditingLabel(null)
  }

  const resetLayout = () => {
    api.post('/api/settings/technical-layout/reset')
      .then((res) => setLayout(res.layout))
      .catch(() => {})
    setEditing(false)
  }

  const renderIndicator = (item) => {
    const data = chartData[item.indicatorId]
    if (!data) return <LoadingSpinner />

    if (item.indicatorId === 'candlestick') {
      return <div ref={(el) => { plotlyRefs.current[item.i] = el }} style={{ width: '100%', height: '100%' }} />
    }

    const img = data.image
    if (!img) return <p className="muted">No data</p>
    return (
      <img
        src={typeof img === 'string' && img.startsWith('data:') ? img : `data:image/png;base64,${img}`}
        alt={item.label}
        style={{ width: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 8 }}
      />
    )
  }

  const gridLayout = layout.map((item) => ({
    i: item.i,
    x: item.x,
    y: item.y,
    w: item.w,
    h: item.h,
    minW: 2,
    minH: 3,
  }))

  return (
    <div ref={containerRef}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0 }}>Technical Analysis</h1>
        <select className="form-input" value={coin} onChange={(e) => setCoin(e.target.value)} style={{ width: 'auto', minWidth: 140 }}>
          {COINS.map((c) => (
            <option key={c} value={c}>{c.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}</option>
          ))}
        </select>
        <AiAnalysisButton
          endpoint="/api/ai/copilot/technical"
          body={{ coin }}
          label="AI Analysis"
          onResult={(text) => setAiInsight(text)}
        />
        <div style={{ flex: 1 }} />
        <button
          className={`btn ${editing ? 'btn-accent' : 'btn-secondary'}`}
          onClick={() => setEditing(!editing)}
        >
          {editing ? 'Done Editing' : 'Customize'}
        </button>
      </div>

      <AiInsightPanel
        title="Technical AI Insights"
        content={aiInsight}
        loading={aiInsightLoading}
        onRefresh={() => {
          setAiInsightLoading(true)
          api.post('/api/ai/copilot/technical', { coin })
            .then((res) => setAiInsight(typeof res === 'string' ? res : res.analysis || res.result || res.content || JSON.stringify(res, null, 2)))
            .catch(() => {})
            .finally(() => setAiInsightLoading(false))
        }}
        onClose={() => setAiInsight(null)}
      />

      {error && <div className="login-error">{error}</div>}

      {editing && (
        <div className="card" style={{ marginBottom: '1rem', padding: '1rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontWeight: 600, color: 'var(--primary)' }}>Edit Mode</span>
          <span className="muted">Drag to reposition, resize from corners, click labels to rename</span>
          <button className="btn" onClick={() => setShowAddPanel(!showAddPanel)}>
            + Add Indicator
          </button>
          <button className="btn btn-outline" onClick={resetLayout}>
            Reset Layout
          </button>
        </div>
      )}

      {showAddPanel && editing && (
        <div className="card" style={{ marginBottom: '1rem', padding: '1rem' }}>
          <h3 style={{ marginTop: 0 }}>Add Indicator</h3>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            {Object.entries(INDICATOR_LABELS).map(([id, name]) => (
              <button key={id} className="btn btn-outline" onClick={() => addIndicator(id)}>
                + {name}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading && layout.length > 0 && <LoadingSpinner />}

      {layout.length > 0 && containerWidth > 0 && (
        <GridLayout
          className="technical-grid"
          layout={gridLayout}
          cols={12}
          rowHeight={60}
          width={containerWidth}
          isDraggable={editing}
          isResizable={editing}
          onLayoutChange={handleLayoutChange}
          draggableHandle=".drag-handle"
        >
          {layout.map((item) => (
            <div key={item.i}>
              <div className="card" style={{ height: '100%', overflow: 'hidden', position: 'relative' }}>
                <div className="drag-handle" style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem',
                  cursor: editing ? 'grab' : 'default', userSelect: 'none',
                }}>
                  {editing && <span style={{ color: 'var(--muted)', fontSize: '1.1rem' }}>&#x2801;&#x2801;</span>}
                  {editingLabel === item.i ? (
                    <input
                      className="form-input"
                      value={labelInput}
                      onChange={(e) => setLabelInput(e.target.value)}
                      onBlur={() => saveLabel(item.i)}
                      onKeyDown={(e) => e.key === 'Enter' && saveLabel(item.i)}
                      autoFocus
                      style={{ fontSize: '1rem', fontWeight: 600, padding: '0.2rem 0.5rem' }}
                    />
                  ) : (
                    <h3
                      style={{ margin: 0, cursor: editing ? 'text' : 'default' }}
                      onClick={() => editing && startEditLabel(item)}
                      title={editing ? 'Click to rename' : ''}
                    >
                      {item.label}
                    </h3>
                  )}
                  {editing && (
                    <button
                      onClick={() => removeIndicator(item.i)}
                      style={{
                        marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--accent)',
                        cursor: 'pointer', fontSize: '1.2rem', padding: '0 0.3rem',
                      }}
                      title="Remove"
                    >
                      x
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 'calc(100% - 2rem)', overflow: 'hidden' }}>
                  {!loading && renderIndicator(item)}
                </div>
              </div>
            </div>
          ))}
        </GridLayout>
      )}

      {!loading && layout.length === 0 && (
        <Card><p className="muted">No indicators configured. Click Customize to add indicators to your dashboard.</p></Card>
      )}
    </div>
  )
}

export default Technical
