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

// ---- Admin settings persistence (commission %, liquidation %) ----
const fs = require('fs');
const SETTINGS_FILE = './settings.json';
const DEFAULT_SETTINGS = { commissionPct: 20, liquidationPct: 30 };

app.get('/api/settings', (req, res) => {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      return res.json(JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')));
    }
    res.json(DEFAULT_SETTINGS);
  } catch (e) {
    res.status(500).json({ error: 'Could not read settings' });
  }
});

app.post('/api/settings', (req, res) => {
  try {
    const { commissionPct, liquidationPct } = req.body;
    const data = {
      commissionPct: Number(commissionPct) || 0,
      liquidationPct: Number(liquidationPct) || 0
    };
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data));
    res.json({ saved: true, ...data });
  } catch (e) {
    res.status(500).json({ error: 'Could not save settings' });
  }
});

// ---- Trade history (persisted ledger of practice + live trades) ----
const TRADES_FILE = './trades.json';
function readTrades(){ try { return fs.existsSync(TRADES_FILE) ? JSON.parse(fs.readFileSync(TRADES_FILE,'utf8')) : []; } catch(e){ return []; } }

app.get('/api/trades', (req, res) => res.json(readTrades()));

app.post('/api/trades', (req, res) => {
  try {
    const { symbol, side, amountUsd, price, mode, pnl } = req.body;
    const trades = readTrades();
    trades.unshift({ symbol, side, amountUsd, price: price || null, mode, pnl: pnl || 0, time: new Date().toISOString() });
    fs.writeFileSync(TRADES_FILE, JSON.stringify(trades.slice(0, 500)));
    res.json({ saved: true });
  } catch (e) {
    res.status(500).json({ error: 'Could not save trade' });
  }
});

// ---- Commission ledger (from client apps, once connected) ----
const COMM_FILE = './commissions.json';
function readComm(){ try { return fs.existsSync(COMM_FILE) ? JSON.parse(fs.readFileSync(COMM_FILE,'utf8')) : { entries: [], reinvestedTotal: 0 }; } catch(e){ return { entries: [], reinvestedTotal: 0 }; } }

app.get('/api/commissions', (req, res) => {
  const data = readComm();
  const pending = data.entries.filter(e => !e.reinvested).reduce((s,e) => s + e.amount, 0);
  res.json({ ...data, pendingTotal: pending });
});

app.post('/api/commissions/reinvest', (req, res) => {
  const data = readComm();
  const pending = data.entries.filter(e => !e.reinvested).reduce((s,e) => s + e.amount, 0);
  data.entries = data.entries.map(e => ({ ...e, reinvested: true }));
  data.reinvestedTotal = (data.reinvestedTotal || 0) + pending;
  fs.writeFileSync(COMM_FILE, JSON.stringify(data));
  res.json({ reinvestedNow: pending, reinvestedTotal: data.reinvestedTotal });
});

// ---- Autotrade: real signal engine + autonomous execution loop ----
const AUTOTRADE_SETTINGS_FILE = './autotrade-settings.json';
const AUTOTRADE_STATE_FILE = './autotrade-state.json';
const POSITIONS_FILE = './positions.json';
const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];

function readJSON(path, fallback){ try { return fs.existsSync(path) ? JSON.parse(fs.readFileSync(path,'utf8')) : fallback; } catch(e){ return fallback; } }
function writeJSON(path, data){ fs.writeFileSync(path, JSON.stringify(data)); }

function todayStr(){ return new Date().toISOString().slice(0,10); }

function getAutotradeSettings(){
  return readJSON(AUTOTRADE_SETTINGS_FILE, { enabled: false, minTrade: 10, maxTrade: 15, dailyLossLimit: 5, extensionAmount: 5 });
}
function getAutotradeState(){
  let state = readJSON(AUTOTRADE_STATE_FILE, { date: todayStr(), dailyLossUsed: 0, extensionUsed: false, pendingExtension: null });
  if (state.date !== todayStr()) {
    state = { date: todayStr(), dailyLossUsed: 0, extensionUsed: false, pendingExtension: null };
    writeJSON(AUTOTRADE_STATE_FILE, state);
  }
  return state;
}
function getPositions(){ return readJSON(POSITIONS_FILE, {}); }

app.get('/api/autotrade/status', (req, res) => {
  res.json({ settings: getAutotradeSettings(), state: getAutotradeState(), positions: getPositions() });
});

app.post('/api/autotrade/toggle', (req, res) => {
  const settings = getAutotradeSettings();
  settings.enabled = !!req.body.enabled;
  if (req.body.minTrade) settings.minTrade = Number(req.body.minTrade);
  if (req.body.maxTrade) settings.maxTrade = Number(req.body.maxTrade);
  if (req.body.dailyLossLimit) settings.dailyLossLimit = Number(req.body.dailyLossLimit);
  writeJSON(AUTOTRADE_SETTINGS_FILE, settings);
  res.json(settings);
});

app.post('/api/autotrade/approve-extension', (req, res) => {
  const state = getAutotradeState();
  if (!state.pendingExtension) return res.json({ error: 'No pending extension request' });
  state.extensionUsed = true;
  state.pendingExtension = null;
  writeJSON(AUTOTRADE_STATE_FILE, state);
  res.json({ approved: true, state });
});

app.post('/api/autotrade/deny-extension', (req, res) => {
  const state = getAutotradeState();
  state.pendingExtension = null;
  writeJSON(AUTOTRADE_STATE_FILE, state);
  res.json({ denied: true, state });
});

// ---- Signal engine: SMA(9)/SMA(21) crossover + RSI(14) on 15m klines ----
async function getKlines(symbol){
  const url = `${BYBIT_BASE_URL}/v5/market/kline?category=spot&symbol=${symbol}&interval=15&limit=50`;
  const res = await axios.get(url);
  return res.data?.result?.list?.map(k => parseFloat(k[4])).reverse() || []; // close prices, oldest→newest
}
function sma(arr, period){ if (arr.length < period) return null; const slice = arr.slice(-period); return slice.reduce((a,b)=>a+b,0)/period; }
function rsi(arr, period=14){
  if (arr.length < period+1) return null;
  let gains=0, losses=0;
  for (let i=arr.length-period; i<arr.length; i++){
    const diff = arr[i]-arr[i-1];
    if (diff>0) gains+=diff; else losses-=diff;
  }
  const avgGain=gains/period, avgLoss=losses/period;
  if (avgLoss===0) return 100;
  const rs = avgGain/avgLoss;
  return 100 - (100/(1+rs));
}
async function computeSignal(symbol){
  try {
    const closes = await getKlines(symbol);
    if (closes.length < 22) return { signal: 'HOLD', reason: 'insufficient data' };
    const smaShort = sma(closes, 9), smaLong = sma(closes, 21);
    const prevShort = sma(closes.slice(0,-1), 9), prevLong = sma(closes.slice(0,-1), 21);
    const r = rsi(closes);
    const crossedUp = prevShort <= prevLong && smaShort > smaLong;
    const crossedDown = prevShort >= prevLong && smaShort < smaLong;
    if (crossedUp && r < 70) return { signal: 'BUY', reason: `SMA9 crossed above SMA21, RSI ${r.toFixed(1)}`, price: closes[closes.length-1] };
    if (crossedDown && r > 30) return { signal: 'SELL', reason: `SMA9 crossed below SMA21, RSI ${r.toFixed(1)}`, price: closes[closes.length-1] };
    return { signal: 'HOLD', reason: `RSI ${r ? r.toFixed(1) : 'n/a'}`, price: closes[closes.length-1] };
  } catch (e) {
    return { signal: 'HOLD', reason: 'signal fetch failed' };
  }
}

async function autotradeTick(){
  const settings = getAutotradeSettings();
  if (!settings.enabled) return;
  const state = getAutotradeState();
  const allowance = settings.dailyLossLimit + (state.extensionUsed ? settings.extensionAmount : 0) - state.dailyLossUsed;

  for (const symbol of SYMBOLS) {
    const result = await computeSignal(symbol);
    if (result.signal === 'HOLD') continue;

    if (allowance <= 0) {
      // Paused for losses — only flag a pending extension request for a BUY
      // signal (a fresh opportunity), and only once per day.
      if (result.signal === 'BUY' && !state.extensionUsed && !state.pendingExtension) {
        state.pendingExtension = { symbol, reason: result.reason, time: new Date().toISOString() };
        writeJSON(AUTOTRADE_STATE_FILE, state);
      }
      continue;
    }

    const positions = getPositions();
    const pos = positions[symbol] || { qty: 0, avgPrice: 0 };
    const tradeAmt = settings.minTrade + Math.random() * (settings.maxTrade - settings.minTrade);

    if (result.signal === 'BUY') {
      const qty = tradeAmt / result.price;
      pos.avgPrice = pos.qty > 0 ? ((pos.avgPrice*pos.qty) + (result.price*qty)) / (pos.qty+qty) : result.price;
      pos.qty += qty;
      positions[symbol] = pos;
      writeJSON(POSITIONS_FILE, positions);
      const trades = readTrades();
      trades.unshift({ symbol: symbol.replace('USDT','/USDT'), side: 'AUTO-BUY', amountUsd: tradeAmt, price: result.price, mode: 'autotrade', pnl: 0, time: new Date().toISOString() });
      writeJSON(TRADES_FILE, trades.slice(0,500));
    }

    if (result.signal === 'SELL' && pos.qty > 0) {
      const sellQty = Math.min(pos.qty, tradeAmt / result.price);
      const pnl = (result.price - pos.avgPrice) * sellQty;
      pos.qty -= sellQty;
      positions[symbol] = pos;
      writeJSON(POSITIONS_FILE, positions);
      if (pnl < 0) { state.dailyLossUsed += Math.abs(pnl); writeJSON(AUTOTRADE_STATE_FILE, state); }
      const trades = readTrades();
      trades.unshift({ symbol: symbol.replace('USDT','/USDT'), side: 'AUTO-SELL', amountUsd: sellQty*result.price, price: result.price, mode: 'autotrade', pnl, time: new Date().toISOString() });
      writeJSON(TRADES_FILE, trades.slice(0,500));
    }
  }
}
setInterval(autotradeTick, 5 * 60 * 1000); // check every 5 minutes

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
