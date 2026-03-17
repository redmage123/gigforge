/* Blockchain explorer — Bokeh charts, address lookup, network stats */

async function loadNetworkStats() {
    // Ethereum
    try {
        const resp = await fetch('/api/blockchain/eth/stats');
        const data = await resp.json();
        if (data.error) throw new Error(data.error);
        document.getElementById('eth-stats').innerHTML = `
            <p>Block: <strong>${data.number?.toLocaleString()}</strong></p>
            <p>Gas: <strong>${data.gas_gwei} Gwei</strong></p>
            <p>Txns: <strong>${data.transactions}</strong></p>`;
    } catch(e) {
        document.getElementById('eth-stats').innerHTML = '<p class="loading">Unavailable</p>';
    }

    // Solana
    try {
        const resp = await fetch('/api/blockchain/solana/stats');
        const data = await resp.json();
        document.getElementById('sol-stats').innerHTML = `
            <p>Slot: <strong>${data.slot?.toLocaleString()}</strong></p>
            <p>Block: <strong>${data.block_height?.toLocaleString()}</strong></p>
            <p>TPS: <strong>${data.avg_tps}</strong></p>`;
    } catch(e) {
        document.getElementById('sol-stats').innerHTML = '<p class="loading">Unavailable</p>';
    }

    // Bitcoin
    try {
        const resp = await fetch('/api/blockchain/bitcoin/stats');
        const data = await resp.json();
        document.getElementById('btc-stats').innerHTML = `
            <p>Block: <strong>${data.block_height?.toLocaleString()}</strong></p>
            <p>Fastest Fee: <strong>${data.fees?.fastest} sat/vB</strong></p>
            <p>Mempool: <strong>${data.mempool?.tx_count?.toLocaleString()} txns</strong></p>`;
    } catch(e) {
        document.getElementById('btc-stats').innerHTML = '<p class="loading">Unavailable</p>';
    }
}

async function lookupAddress() {
    const address = document.getElementById('address-input').value.trim();
    const chain = document.getElementById('chain-select').value;
    if (!address) return;

    const resultDiv = document.getElementById('balance-result');
    const dataDiv = document.getElementById('balance-data');
    resultDiv.style.display = 'block';
    dataDiv.innerHTML = '<span class="loading">Looking up...</span>';

    try {
        let url;
        if (chain === 'ethereum') url = `/api/blockchain/eth/balance/${address}`;
        else if (chain === 'solana') url = `/api/blockchain/solana/balance/${address}`;
        else url = `/api/blockchain/bitcoin/balance/${address}`;

        const resp = await fetch(url);
        const data = await resp.json();
        if (data.error) throw new Error(data.error);

        const bal = data.balance || data.balance_sol || data.balance_btc || 0;
        const sym = data.symbol || chain.toUpperCase();
        dataDiv.innerHTML = `<p><strong>${bal}</strong> ${sym}</p><p class="muted">${address}</p>`;
    } catch(e) {
        dataDiv.innerHTML = `<p class="negative">Error: ${e.message}</p>`;
    }
}

document.getElementById('lookup-btn').addEventListener('click', lookupAddress);

loadNetworkStats();
