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

## Real trading backend (server.js) — Bybit edition, deploy this to place real orders
`server.js` signs and forwards requests to Bybit (v5 API) so your secret key never touches the browser. Live price data in `index.html` also now streams from Bybit's public feed. The backend is NOT connected to `index.html` yet — that wiring is the next step once you've deployed and tested this.

**Deploy it:**
1. Push `server.js`, `package.json` to a free host that runs persistent Node servers — Render.com or Railway.app both work well for this.
2. In that host's dashboard, set environment variables: `BYBIT_API_KEY`, `BYBIT_API_SECRET`, `BYBIT_BASE_URL`, `ADMIN_TOKEN` (see `.env.example` — generate the admin token with the command shown there, don't make one up by hand).
3. Get your Bybit **testnet** key first (testnet.bybit.com) — practice with fake funds before anything real. Only grant trading permission — leave withdrawal permission off until you've tested thoroughly.
4. Once deployed, `GET https://your-backend-url/health` should return `{ ok: true }`.
5. Test balance/order endpoints with a tool like Postman, sending header `x-admin-token: <your token>`, before wiring the frontend to it.

**Never do this:**
- Never put `BYBIT_API_SECRET` in `index.html` or any file that reaches the browser.
- Never enable withdrawal permission on a key without an address whitelist set in Bybit's security settings.
- Never share `server.js` publicly with real `.env` values filled in.

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
