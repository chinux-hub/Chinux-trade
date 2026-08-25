// Chinux-Trade trading backend — Bybit edition. This is the ONLY place your
// API secret ever lives. Never hardcode keys here — use environment
// variables on your host.

const express = require('express');
const crypto = require('crypto');
const axios = require('axios');

const app = express();
app.use(express.json());

const {
  BYBIT_API_KEY,
  BYBIT_API_SECRET,
  BYBIT_BASE_URL = 'https://api-testnet.bybit.com', // switch to https://api.bybit.com when ready for real funds
  ADMIN_TOKEN, // long random string you generate — required header on every request
  PORT = 3001
} = process.env;

if (!BYBIT_API_KEY || !BYBIT_API_SECRET || !ADMIN_TOKEN) {
  console.error('Missing required env vars: BYBIT_API_KEY, BYBIT_API_SECRET, ADMIN_TOKEN');
  process.exit(1);
}

const RECV_WINDOW = '5000';

// ---- CORS: allow the browser app (hosted elsewhere) to call this API ----
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, x-admin-token');
  res.header('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ---- Public health check (no token needed — visit this in any browser) ----
app.get('/health', (req, res) => res.json({ ok: true }));

// ---- Auth: everything below this line requires your admin token ----
app.use((req, res, next) => {
  if (req.get('x-admin-token') !== ADMIN_TOKEN) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
});

// ---- Bybit v5 signer ----
// GET:  sign = HMAC(secret, timestamp + apiKey + recvWindow + queryString)
// POST: sign = HMAC(secret, timestamp + apiKey + recvWindow + JSON.stringify(body))
function signRequest(timestamp, payloadString) {
  const raw = timestamp + BYBIT_API_KEY + RECV_WINDOW + payloadString;
  return crypto.createHmac('sha256', BYBIT_API_SECRET).update(raw).digest('hex');
}

async function bybitGet(path, params = {}) {
  const timestamp = Date.now().toString();
  const query = new URLSearchParams(params).toString();
  const signature = signRequest(timestamp, query);
  const res = await axios.get(`${BYBIT_BASE_URL}${path}?${query}`, {
    headers: {
      'X-BAPI-API-KEY': BYBIT_API_KEY,
      'X-BAPI-TIMESTAMP': timestamp,
      'X-BAPI-RECV-WINDOW': RECV_WINDOW,
      'X-BAPI-SIGN': signature
    }
  });
  return res.data;
}

async function bybitPost(path, body = {}) {
  const timestamp = Date.now().toString();
  const bodyString = JSON.stringify(body);
  const signature = signRequest(timestamp, bodyString);
  const res = await axios.post(`${BYBIT_BASE_URL}${path}`, body, {
    headers: {
      'X-BAPI-API-KEY': BYBIT_API_KEY,
      'X-BAPI-TIMESTAMP': timestamp,
      'X-BAPI-RECV-WINDOW': RECV_WINDOW,
      'X-BAPI-SIGN': signature,
      'Content-Type': 'application/json'
    }
  });
  return res.data;
}

// ---- Balance ----
app.get('/api/balance', async (req, res) => {
  try {
    const data = await bybitGet('/v5/account/wallet-balance', { accountType: 'UNIFIED' });
    res.json(data);
  } catch (e) {
    res.status(400).json({ error: e.response?.data || e.message });
  }
});

// ---- Place order ----
// body: { symbol: "BTCUSDT", side: "Buy"|"Sell", orderType: "Market"|"Limit", qty, price?, category? }
app.post('/api/order', async (req, res) => {
  try {
    const { symbol, side, orderType, qty, price, category = 'spot' } = req.body;
    const body = { category, symbol, side, orderType, qty };
    if (orderType === 'Limit') body.price = price;
    if (category === 'spot') body.timeInForce = orderType === 'Limit' ? 'GTC' : 'IOC';
    const data = await bybitPost('/v5/order/create', body);
    res.json(data);
  } catch (e) {
    res.status(400).json({ error: e.response?.data || e.message });
  }
});

// ---- Cancel order ----
// body: { symbol: "BTCUSDT", orderId, category? }
app.post('/api/order/cancel', async (req, res) => {
  try {
    const { symbol, orderId, category = 'spot' } = req.body;
    const data = await bybitPost('/v5/order/cancel', { category, symbol, orderId });
    res.json(data);
  } catch (e) {
    res.status(400).json({ error: e.response?.data || e.message });
  }
});

// ---- Open orders ----
app.get('/api/orders/open', async (req, res) => {
  try {
    const { symbol, category = 'spot' } = req.query;
    const params = { category };
    if (symbol) params.symbol = symbol;
    const data = await bybitGet('/v5/order/realtime', params);
    res.json(data);
  } catch (e) {
    res.status(400).json({ error: e.response?.data || e.message });
  }
});

// ---- Deposit address (crypto only — see README for why fiat deposit/
// withdrawal isn't handled here) ----
// query: ?coin=USDT&chain=TRX
app.get('/api/deposit-address', async (req, res) => {
  try {
    const { coin, chain } = req.query;
    const data = await bybitGet('/v5/asset/deposit/query-address', { coin, chainType: chain });
    res.json(data);
  } catch (e) {
    res.status(400).json({ error: e.response?.data || e.message });
  }
});

// ---- Withdrawal ----
// HIGH RISK. Requires withdrawal permission enabled on the key and the
// destination address whitelisted in your Bybit security settings.
// body: { coin: "USDT", chain, address, amount }
app.post('/api/withdraw', async (req, res) => {
  try {
    const { coin, chain, address, amount } = req.body;
    const data = await bybitPost('/v5/asset/withdraw/create', {
      coin, chain, address, amount, timestamp: Date.now()
    });
    res.json(data);
  } catch (e) {
    res.status(400).json({ error: e.response?.data || e.message });
  }
});

app.listen(PORT, () => console.log(`Chinux-Trade backend (Bybit) running on :${PORT}`));
