# Chinux-Trade — Master Console (Stage 1)

## What's actually built right now
- A real, functional installable web app (PWA) — `index.html`, `manifest.json`, `sw.js`
- Biometric unlock gate using WebAuthn (calls your device's real Face ID / fingerprint / Windows Hello prompt)
- Live BTC/ETH/SOL prices streamed from Binance's public market-data WebSocket (no API key needed for price data)
- A practice/paper trading panel — simulated $10,000 balance, buy/sell against live prices, trade log
- Illustrative pattern-signal cards (buy/sell badges) — currently static examples, not yet driven by a real model
- An admin panel with adjustable sliders for client commission % and profit-liquidation %
- Offline/online detection banner
- Service worker so the app shell loads and cached data shows even with no connection

## What's intentionally NOT built yet (and why)
| Feature | Status | Why |
|---|---|---|
| Real prediction/pattern model | Stubbed | Signal cards are still placeholders — Stage 2 |
| Sync engine integration | Not wired | Needs the Rust core exposed as a WASM/JS binding for the web build, or a native wrapper for mobile |
| Client (commission-paying) app | Not started | Stage 3, once master app + payout logic are solid |
| Automated bank remittance | Not started | This is a regulated money-transmission function. You'll need either (a) a licensed payment API (e.g. a local payment aggregator with payout/disbursement endpoints) or (b) a registered fintech partner. I can build the integration once you pick a provider — I can't move real money to a bank account on my own |
| Native App Store / Play Store builds | Not applicable | I can't compile/sign/publish native binaries from here. The PWA above installs on Android, iPhone, and Windows directly from your website — no store needed |
| Brute-force anomaly detection | Not started | Needs the backend below to add rate-limiting — Stage 4 |
| Multi-device single account | Not started | Needs a database (accounts currently only exist in-browser) |

## Deposits and withdrawals — what's real vs. not
- **Crypto deposit address** (`GET /api/deposit-address?coin=USDT&chain=TRX`) — retrieves your Bybit deposit address so you can send crypto in from an external wallet without opening the Bybit app. This is built and works via the API.
- **Crypto withdrawal** (`POST /api/withdraw`) — sends crypto out to a whitelisted wallet address. Built, but requires withdrawal permission + address whitelisting in Bybit's security settings first.
- **Fiat (cash) deposit from your bank into Bybit** — NOT achievable through the trading API. Bybit handles this through its own P2P marketplace or card/payment-gateway flow, which involves a counter-party or payment processor and isn't a simple scriptable call. This still has to go through the Bybit app or website.
- **Fiat (cash) withdrawal from Bybit to your bank** — same limitation. This needs a licensed payment/off-ramp provider integration, which is a separate project (see the "Automated bank remittance" row above) — not something the exchange API alone provides.

So today: trading, balance checks, and crypto in/out can all be abstracted away from the Bybit app through this backend. Moving between Naira in your bank account and your Bybit balance still requires the Bybit app/website itself, or a dedicated fiat off-ramp integration we haven't built yet.

## Autonomous trading (real signal engine + auto-execution)
`server-bybit.js` now runs a real strategy — SMA(9)/SMA(21) crossover + RSI(14) filter on 15-minute candles, fetched from Bybit's public kline endpoint — checked every 5 minutes for BTC, ETH, and SOL. It replaces the old placeholder "Predicted Signals" cards with actual analysis.

**Hard safety limits, enforced server-side (not just UI suggestions):**
- **$10–15 per trade** (adjustable in Admin), bot won't exceed this regardless of signal strength
- **$5 daily loss limit** — once today's realized losses hit this, the bot stops trading for the rest of the day
- **Resets automatically at midnight** (UTC date rollover)
- **One-time $5 extension**: if the daily limit is hit but a fresh BUY signal appears, the bot flags it in the Admin tab instead of trading — it only extends today's budget if you tap "Approve" there. Capped at one extension per day ($10 total max loss/day).

**Position tracking**: the backend now tracks a simple average-cost position per coin (`positions.json`) so it can compute real realized P&L when it sells — that P&L is what counts against the daily loss limit, and it's the same number shown in your Trade History.

**Turning it on**: Admin tab → "Autonomous Trading" toggle. Requires your admin token, same as Live Mode. It will only place real orders if this toggle is on — leaving it off means the signal engine still runs and informs the Dashboard's signal cards (future wiring), but no autonomous orders are placed.

**What this is NOT yet**: a sophisticated ML/pattern-recognition system — it's a transparent, explainable indicator strategy on purpose, so you can verify why it traded. A more advanced model is a future upgrade once this simpler version has a track record.

## Real trading backend — two exchanges, two separate deployments
There are now two backend files: `server-binance.js` and `server-bybit.js`. They're independent — deploy each as its own Render Web Service, since they need different code and different environment variables.

**Service A — Binance testnet (easiest to access, use this to prove the app works):**
- Start Command: `node server-binance.js`
- Env vars: `BINANCE_API_KEY`, `BINANCE_API_SECRET` (from testnet.binance.vision, log in with GitHub), `BINANCE_BASE_URL=https://testnet.binance.vision`, `ADMIN_TOKEN`

**Service B — Bybit mainnet (your real account):**
- Start Command: `node server-bybit.js`
- Env vars: `BYBIT_API_KEY`, `BYBIT_API_SECRET` (from your main Bybit account's API Management), `BYBIT_BASE_URL=https://api.bybit.com`, `ADMIN_TOKEN` (use a different random string than Service A)

Both services can live in the same GitHub repo — Render just needs a different Start Command per service, pointing at the matching file. Test Service A thoroughly first since it's zero-risk; only rely on Service B once you trust the order logic.

**Never do this:**
- Never put a real API secret in `index.html` or any file the browser loads.
- Never enable withdrawal permission on the Bybit mainnet key without an address whitelist set in Bybit's security settings.
- Never share either server file publicly with real `.env` values filled in.

## How to actually launch and use what's built today
1. **Get a free static host** — Netlify, Vercel, or GitHub Pages all work and are free.
2. **Upload these three files** (`index.html`, `manifest.json`, `sw.js`) as a single site — most hosts let you drag-and-drop a folder.
3. **Visit the live URL** on your phone or laptop.
4. On iPhone: Safari → Share → "Add to Home Screen." On Android: Chrome will prompt "Install app." On Windows: Edge/Chrome address bar shows an install icon.
5. Open the installed app — tap "Unlock with Biometrics" (or the fallback link if you don't have a passkey registered yet).
6. Watch live prices update, try a practice buy/sell, and adjust the commission/liquidation sliders.

## Suggested build order from here
1. Wire a real prediction model (start simple: moving-average crossover + RSI, then iterate toward ML)
2. Expose the Rust sync engine to the web/mobile builds and replace in-browser state with it
3. Add a lightweight backend (auth, accounts, WebAuthn credential storage, rate-limiting) — this unlocks multi-device accounts and real brute-force protection
4. Build the client (commission-paying) app once the master app + payout math are proven
5. Integrate a licensed payout provider for real cash withdrawal
