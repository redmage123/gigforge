/* Wallet page — MetaMask connection + saved wallet management */

const CHAIN_NAMES = {
    '0x1': 'Ethereum', '0x38': 'BSC', '0x89': 'Polygon',
    '0xa4b1': 'Arbitrum', '0xa': 'Optimism', '0xa86a': 'Avalanche', '0x2105': 'Base',
};

let connectedAddress = null;

function truncateAddr(addr) {
    return addr.slice(0, 6) + '...' + addr.slice(-4);
}

/* ── MetaMask Connection ── */

function showConnected(address, chainId) {
    connectedAddress = address;
    document.getElementById('wallet-status').style.display = 'none';
    document.getElementById('wallet-info').style.display = 'flex';
    document.getElementById('wallet-addr').textContent = truncateAddr(address);
    document.getElementById('wallet-chain').textContent = CHAIN_NAMES[chainId] || `Chain ${parseInt(chainId, 16)}`;
    document.getElementById('wallet-connected-content').style.display = 'block';
    localStorage.setItem('wallet_address', address);
    loadMetaMaskBalances(address);
}

function showDisconnected() {
    connectedAddress = null;
    document.getElementById('wallet-status').style.display = 'block';
    document.getElementById('wallet-info').style.display = 'none';
    document.getElementById('wallet-connected-content').style.display = 'none';
    localStorage.removeItem('wallet_address');
}

async function connectWallet() {
    if (!window.ethereum) {
        document.getElementById('no-metamask').style.display = 'block';
        return;
    }
    try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const accounts = await provider.send('eth_requestAccounts', []);
        const chainId = await provider.send('eth_chainId', []);
        if (accounts.length > 0) showConnected(accounts[0], chainId);
    } catch (e) { console.error('Connect error:', e); }
}

async function switchChain() {
    const chainId = document.getElementById('chain-switch').value;
    try {
        await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId }] });
    } catch (e) { console.error('Chain switch error:', e); }
}

async function loadMetaMaskBalances(address) {
    const grid = document.getElementById('balances-grid');
    grid.innerHTML = '<span class="loading">Loading balances across all chains...</span>';
    try {
        const resp = await fetch(`/api/wallet/balances/${address}`);
        const data = await resp.json();
        if (data.error) throw new Error(data.error);

        let html = '';
        for (const b of data.balances) {
            html += `<div class="card balance-card">
                <div class="balance-chain">${b.chain.charAt(0).toUpperCase() + b.chain.slice(1)}</div>
                <div class="balance-amount ${b.balance > 0 ? 'positive' : ''}">${b.balance.toFixed(6)} ${b.symbol}</div>
                <div class="balance-usd">$${b.usd_value.toLocaleString()}</div>
            </div>`;
        }
        html += `<div class="card balance-card" style="border-color:var(--primary);">
            <div class="balance-chain">Total Value</div>
            <div class="balance-amount positive" style="font-size:1.4rem;">$${data.total_usd.toLocaleString()}</div>
        </div>`;
        grid.innerHTML = html;
    } catch (e) {
        grid.innerHTML = `<p class="negative">Error: ${e.message}</p>`;
    }
}

/* ── Saved Wallets ── */

async function loadSavedWallets() {
    const list = document.getElementById('saved-wallets-list');
    try {
        const resp = await fetch('/api/wallet/saved');
        const wallets = await resp.json();
        if (wallets.length === 0) {
            list.innerHTML = '<p class="muted">No saved wallets. Add one above.</p>';
            return;
        }
        let html = '';
        wallets.forEach((w, i) => {
            html += `<div class="saved-wallet-item">
                <div class="saved-wallet-info">
                    <span class="saved-wallet-label">${w.label}</span>
                    <span class="saved-wallet-addr">${truncateAddr(w.address)} &middot; ${w.chain}</span>
                </div>
                <div class="saved-wallet-actions">
                    <button class="btn btn-sm" onclick="viewWalletBalance('${w.address}', '${w.chain}')">View</button>
                    <button class="btn btn-sm btn-danger" onclick="removeSavedWallet(${i})">Remove</button>
                </div>
            </div>`;
        });
        list.innerHTML = html;
    } catch (e) {
        list.innerHTML = `<p class="negative">Error loading wallets: ${e.message}</p>`;
    }
}

async function addSavedWallet() {
    const label = document.getElementById('wallet-label').value.trim();
    const address = document.getElementById('wallet-address').value.trim();
    const chain = document.getElementById('wallet-chain').value;

    if (!label || !address) {
        alert('Please enter both a label and wallet address.');
        return;
    }

    try {
        const resp = await fetch('/api/wallet/saved', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ label, address, chain }),
        });
        const data = await resp.json();
        if (data.error) {
            alert(data.error);
            return;
        }
        document.getElementById('wallet-label').value = '';
        document.getElementById('wallet-address').value = '';
        loadSavedWallets();
        loadSavedBalances();
    } catch (e) {
        alert('Error saving wallet: ' + e.message);
    }
}

async function removeSavedWallet(index) {
    if (!confirm('Remove this wallet?')) return;
    try {
        await fetch(`/api/wallet/saved/${index}`, { method: 'DELETE' });
        loadSavedWallets();
        loadSavedBalances();
    } catch (e) {
        alert('Error removing wallet: ' + e.message);
    }
}

async function loadSavedBalances() {
    const container = document.getElementById('saved-balances');
    container.innerHTML = '<span class="loading">Loading balances for saved wallets...</span>';
    try {
        const resp = await fetch('/api/wallet/saved/balances');
        const data = await resp.json();
        if (!data.wallets || data.wallets.length === 0) {
            container.innerHTML = '<p class="muted">No saved wallets to check.</p>';
            return;
        }
        let html = '<table><tr><th>Label</th><th>Chain</th><th>Address</th><th>Balance</th><th>USD Value</th></tr>';
        for (const w of data.wallets) {
            html += `<tr>
                <td>${w.label}</td>
                <td><span class="chain-badge">${w.chain}</span></td>
                <td style="font-family:monospace;font-size:0.8rem;">${truncateAddr(w.address)}</td>
                <td>${w.error ? '<span class="muted">error</span>' : (w.balance?.toFixed(6) || '0') + ' ' + (w.symbol || '')}</td>
                <td class="${w.usd_value > 0 ? 'positive' : ''}">$${(w.usd_value || 0).toLocaleString()}</td>
            </tr>`;
        }
        html += `</table>
            <p style="margin-top:1rem;font-weight:600;">
                Total: <span class="positive">$${data.total_usd.toLocaleString()}</span>
            </p>`;
        container.innerHTML = html;
    } catch (e) {
        container.innerHTML = `<p class="negative">Error: ${e.message}</p>`;
    }
}

function viewWalletBalance(address, chain) {
    // Scroll to balances and highlight
    document.getElementById('saved-balances').scrollIntoView({ behavior: 'smooth' });
    loadSavedBalances();
}

/* ── Event Listeners ── */

document.getElementById('connect-btn').addEventListener('click', connectWallet);
document.getElementById('disconnect-btn').addEventListener('click', showDisconnected);
document.getElementById('switch-chain-btn').addEventListener('click', switchChain);
document.getElementById('add-wallet-btn').addEventListener('click', addSavedWallet);
document.getElementById('refresh-balances-btn').addEventListener('click', loadSavedBalances);

// MetaMask events
if (window.ethereum) {
    window.ethereum.on('accountsChanged', (accounts) => {
        if (accounts.length === 0) showDisconnected();
        else window.ethereum.request({ method: 'eth_chainId' }).then(cid => showConnected(accounts[0], cid));
    });
    window.ethereum.on('chainChanged', (chainId) => {
        if (connectedAddress) {
            document.getElementById('wallet-chain').textContent = CHAIN_NAMES[chainId] || `Chain ${parseInt(chainId, 16)}`;
        }
    });
    // Auto-reconnect
    const saved = localStorage.getItem('wallet_address');
    if (saved) {
        window.ethereum.request({ method: 'eth_accounts' }).then(accounts => {
            if (accounts.length > 0 && accounts[0].toLowerCase() === saved.toLowerCase()) {
                window.ethereum.request({ method: 'eth_chainId' }).then(cid => showConnected(accounts[0], cid));
            }
        });
    }
} else {
    document.getElementById('connect-btn').textContent = 'MetaMask Required';
    document.getElementById('connect-btn').disabled = true;
}

// Load saved wallets on page load
loadSavedWallets();
loadSavedBalances();
