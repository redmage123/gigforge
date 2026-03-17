/* Dashboard page — Chart.js volume/dominance, Plotly allocation, auto-refresh */

const COLORS = {
    primary: '#00d4aa', secondary: '#7b61ff', accent: '#ff6b6b',
    warning: '#ffd93d', info: '#4ecdc4', bg: '#0a0e1a', card: '#111827',
    text: '#e2e8f0', muted: '#64748b',
};

async function loadPrices() {
    try {
        const resp = await fetch('/api/market/prices');
        const data = await resp.json();
        if (data.error) throw new Error(data.error);
        let html = '';
        for (const [coin, info] of Object.entries(data)) {
            const change = info.usd_24h_change || 0;
            const cls = change >= 0 ? 'positive' : 'negative';
            const arrow = change >= 0 ? '+' : '';
            html += `<div class="stat">
                <div class="label">${coin.toUpperCase()}</div>
                <div class="value">$${info.usd.toLocaleString()}</div>
                <div class="${cls}">${arrow}${change.toFixed(2)}%</div>
            </div>`;
        }
        document.getElementById('price-cards').innerHTML = html;
    } catch(e) { console.error('Prices error:', e); }
}

async function loadFearGreed() {
    try {
        const resp = await fetch('/api/market/fear-greed');
        const data = await resp.json();
        const color = data.value > 60 ? COLORS.primary : data.value < 40 ? COLORS.accent : COLORS.warning;
        document.getElementById('fear-greed').innerHTML =
            `<div class="stat"><div class="value" style="color:${color}">${data.value}</div>
             <div class="label">${data.classification}</div></div>`;
    } catch(e) { console.error('Fear/Greed error:', e); }
}

async function loadGlobal() {
    try {
        const resp = await fetch('/api/market/global');
        const data = await resp.json();
        if (data.error) throw new Error(data.error);
        const d = data.data;
        document.getElementById('global-stats').innerHTML = `
            <div class="stat"><div class="value">$${(d.total_market_cap.usd / 1e12).toFixed(2)}T</div>
            <div class="label">Total Market Cap</div></div>
            <div class="stat"><div class="value">${d.active_cryptocurrencies.toLocaleString()}</div>
            <div class="label">Active Coins</div></div>`;
    } catch(e) { console.error('Global error:', e); }
}

async function loadVolumeChart() {
    try {
        const resp = await fetch('/api/market/prices');
        const data = await resp.json();
        if (data.error) return;
        const labels = Object.keys(data).map(c => c.toUpperCase());
        const volumes = Object.values(data).map(v => (v.usd_24h_vol || 0) / 1e9);
        const ctx = document.getElementById('volume-chart');
        new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [{ label: '24h Volume ($B)', data: volumes,
                    backgroundColor: [COLORS.primary, COLORS.secondary, COLORS.info, COLORS.warning, COLORS.accent],
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
                scales: { y: { ticks: { color: COLORS.muted } }, x: { ticks: { color: COLORS.muted } } },
            }
        });
    } catch(e) { console.error('Volume chart error:', e); }
}

async function loadDominanceChart() {
    try {
        const resp = await fetch('/api/market/global');
        const data = await resp.json();
        if (data.error) return;
        const dom = data.data.market_cap_percentage;
        const labels = Object.keys(dom).slice(0, 6).map(c => c.toUpperCase());
        const values = Object.values(dom).slice(0, 6);
        const ctx = document.getElementById('dominance-chart');
        new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels,
                datasets: [{ data: values,
                    backgroundColor: [COLORS.primary, COLORS.secondary, COLORS.info, COLORS.warning, COLORS.accent, COLORS.muted],
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { labels: { color: COLORS.text } } },
            }
        });
    } catch(e) { console.error('Dominance chart error:', e); }
}

async function loadAllocation() {
    try {
        const resp = await fetch('/api/charts/portfolio/allocation');
        const data = await resp.json();
        Plotly.newPlot('allocation-chart', data.data, data.layout);
    } catch(e) { console.error('Allocation error:', e); }
}

async function loadNews() {
    try {
        const resp = await fetch('/api/market/news?limit=8');
        const data = await resp.json();
        if (!Array.isArray(data) || data.length === 0) {
            document.getElementById('news-feed').innerHTML = '<p class="muted">No news available</p>';
            return;
        }
        let html = '<table><tr><th>Title</th><th>Source</th><th>Sentiment</th></tr>';
        for (const item of data) {
            const cls = item.sentiment === 'bullish' ? 'badge-green' : item.sentiment === 'bearish' ? 'badge-red' : 'badge-yellow';
            html += `<tr><td><a href="${item.url}" target="_blank" style="color:var(--text)">${item.title}</a></td>
                <td>${item.source}</td><td><span class="badge ${cls}">${item.sentiment}</span></td></tr>`;
        }
        html += '</table>';
        document.getElementById('news-feed').innerHTML = html;
    } catch(e) { console.error('News error:', e); }
}

// Load everything
Promise.all([loadPrices(), loadFearGreed(), loadGlobal(), loadVolumeChart(), loadDominanceChart(), loadAllocation(), loadNews()]);

// Auto-refresh every 60s
setInterval(() => { loadPrices(); loadFearGreed(); }, 60000);
