/* Portfolio page — holdings table, signals, watchlist, Plotly allocation */

async function loadHoldings() {
    try {
        const resp = await fetch('/api/portfolio/holdings');
        const data = await resp.json();
        const holdings = data.holdings || [];
        if (holdings.length === 0) {
            document.getElementById('holdings-table').innerHTML = '<p class="muted">No holdings found in memory</p>';
            return;
        }
        const headers = Object.keys(holdings[0]);
        let html = '<table><tr>' + headers.map(h => `<th>${h}</th>`).join('') + '</tr>';
        for (const row of holdings) {
            html += '<tr>' + headers.map(h => `<td>${row[h] || ''}</td>`).join('') + '</tr>';
        }
        html += '</table>';
        if (data.total_value) html += `<p style="margin-top:1rem;">Total: <strong>$${data.total_value.toLocaleString()}</strong></p>`;
        document.getElementById('holdings-table').innerHTML = html;
    } catch(e) { console.error('Holdings error:', e); }
}

async function loadSignals() {
    try {
        const resp = await fetch('/api/portfolio/signals');
        const data = await resp.json();
        if (!Array.isArray(data) || data.length === 0) {
            document.getElementById('signals-table').innerHTML = '<p class="muted">No signals</p>';
            return;
        }
        const headers = Object.keys(data[0]);
        let html = '<table><tr>' + headers.map(h => `<th>${h}</th>`).join('') + '</tr>';
        for (const row of data) {
            html += '<tr>' + headers.map(h => `<td>${row[h] || ''}</td>`).join('') + '</tr>';
        }
        html += '</table>';
        document.getElementById('signals-table').innerHTML = html;
    } catch(e) { console.error('Signals error:', e); }
}

async function loadWatchlist() {
    try {
        const resp = await fetch('/api/portfolio/watchlist');
        const data = await resp.json();
        if (!Array.isArray(data) || data.length === 0) {
            document.getElementById('watchlist-table').innerHTML = '<p class="muted">No watchlist items</p>';
            return;
        }
        const headers = Object.keys(data[0]);
        let html = '<table><tr>' + headers.map(h => `<th>${h}</th>`).join('') + '</tr>';
        for (const row of data) {
            html += '<tr>' + headers.map(h => `<td>${row[h] || ''}</td>`).join('') + '</tr>';
        }
        html += '</table>';
        document.getElementById('watchlist-table').innerHTML = html;
    } catch(e) { console.error('Watchlist error:', e); }
}

async function loadPortfolioChart() {
    try {
        const resp = await fetch('/api/charts/portfolio/allocation');
        const data = await resp.json();
        Plotly.newPlot('portfolio-chart', data.data, data.layout);
    } catch(e) { console.error('Portfolio chart error:', e); }
}

Promise.all([loadHoldings(), loadSignals(), loadWatchlist(), loadPortfolioChart()]);
