/* Technical analysis page — Plotly candlestick, matplotlib indicator images */

async function loadCandlestick() {
    const coin = document.getElementById('coin-select').value;
    const days = document.getElementById('days-select').value;
    try {
        const resp = await fetch(`/api/charts/candlestick/${coin}?days=${days}`);
        const data = await resp.json();
        Plotly.newPlot('candlestick-chart', data.data, data.layout);
    } catch(e) { console.error('Candlestick error:', e); }
}

async function loadIndicator(indicator, imgId) {
    const coin = document.getElementById('coin-select').value;
    try {
        const resp = await fetch(`/api/charts/technical/${coin}?indicator=${indicator}`);
        const data = await resp.json();
        if (data.image) {
            document.getElementById(imgId).src = 'data:image/png;base64,' + data.image;
        }
    } catch(e) { console.error(`${indicator} error:`, e); }
}

async function loadAll() {
    await Promise.all([
        loadCandlestick(),
        loadIndicator('rsi', 'rsi-chart'),
        loadIndicator('macd', 'macd-chart'),
        loadIndicator('bollinger', 'bollinger-chart'),
    ]);
}

document.getElementById('refresh-btn').addEventListener('click', loadAll);
document.getElementById('coin-select').addEventListener('change', loadAll);
document.getElementById('days-select').addEventListener('change', loadAll);

loadAll();
