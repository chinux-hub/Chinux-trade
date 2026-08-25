// Chinux-Trade trading backend — Binance edition. This is the ONLY place
// your API secret ever lives. Never hardcode keys here — use environment
// variables on your host.

const express = require('express');
const crypto = require('crypto');
const axios = require('axios');

const app = express();
app.use(express.json());

const {
  BINANCE_API_KEY,
  BINANCE_API_SECRET,
  BINANCE_BASE_URL = 'https://testnet.binance.vision',
  ADMIN_TOKEN, // long random string you generate — required header on every request
  PORT = 3001
} = process.env;

if (!BINANCE_API_KEY || !BINANCE_API_SECRET || !ADMIN_TOKEN) {
  console.error('Missing required env vars: BINANCE_API_KEY, BINANCE_API_SECRET, ADMIN_TOKEN');
  process.exit(1);
}

// ---- Public health check (no token needed — visit this in any browser) ----
app.get('/health', (req, res) => res.json({ ok: true }));

// ---- Auth: everything below this line requires your admin token ----
app.use((req, res, next) => {
  if (req.get('x-admin-token') !== ADMIN_TOKEN) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
});

// ---- Binance request signer ----
function sign(params) {
  const query = new URLSearchParams({ ...params, timestamp: Date.now(), recvWindow: 5000 }).toString();
  const signature = crypto.createHmac('sha256', BINANCE_API_SECRET).update(query).digest('hex');
  return `${query}&signature=${signature}`;
}

async function binanceRequest(method, path, params = {}) {
  const query = sign(params);
  const url = `${BINANCE_BASE_URL}${path}?${query}`;
  const res = await axios({ method, url, headers: { 'X-MBX-APIKEY': BINANCE_API_KEY } });
  return res.data;
}

// ---- Balance ----
app.get('/api/balance', async (req, res) => {
  try {
    const data = await binanceRequest('GET', '/api/v3/account');
    const nonZero = data.balances.filter(b => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0);
    res.json({ balances: nonZero });
  } catch (e) {
    res.status(400).json({ error: e.response?.data || e.message });
  }
});

// ---- Place order ----
// body: { symbol: "BTCUSDT", side: "BUY"|"SELL", type: "MARKET"|"LIMIT", quantity, price? }
app.post('/api/order', async (req, res) => {
  try {
    const { symbol, side, type, quantity, price } = req.body;
    const params = { symbol, side, type, quantity };
    if (type === 'LIMIT') { params.price = price; params.timeInForce = 'GTC'; }
    const data = await binanceRequest('POST', '/api/v3/order', params);
    res.json(data);
  } catch (e) {
    res.status(400).json({ error: e.response?.data || e.message });
  }
});

// ---- Cancel order ----
// body: { symbol: "BTCUSDT", orderId }
app.delete('/api/order', async (req, res) => {
  try {
    const { symbol, orderId } = req.body;
    const data = await binanceRequest('DELETE', '/api/v3/order', { symbol, orderId });
    res.json(data);
  } catch (e) {
    res.status(400).json({ error: e.response?.data || e.message });
  }
});

// ---- Open orders ----
app.get('/api/orders/open', async (req, res) => {
  try {
    const { symbol } = req.query;
    const data = await binanceRequest('GET', '/api/v3/openOrders', symbol ? { symbol } : {});
    res.json(data);
  } catch (e) {
    res.status(400).json({ error: e.response?.data || e.message });
  }
});

// ---- Withdrawal ---- (mainnet only — Binance testnet withdrawals are not real)
// body: { asset: "USDT", address, amount, network }
app.post('/api/withdraw', async (req, res) => {
  try {
    const { asset, address, amount, network } = req.body;
    const data = await binanceRequest('POST', '/sapi/v1/capital/withdraw/apply', { coin: asset, address, amount, network });
    res.json(data);
  } catch (e) {
    res.status(400).json({ error: e.response?.data || e.message });
  }
});

app.listen(PORT, () => console.log(`Chinux-Trade backend (Binance) running on :${PORT}`));
