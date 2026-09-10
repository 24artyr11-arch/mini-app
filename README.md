# MENTAL TRADER Mini App

Static Telegram Mini App frontend for the MENTAL TRADER backend.

## Files

- `index.html` — app shell and Telegram Web App SDK
- `style.css` — responsive dark fintech UI
- `app.js` — Telegram auth, markets, instruments, signals and profile
- `config.js` — public deployment configuration
- `assets/logo.png` — app logo

## 1. Configure the frontend

Edit `config.js` before deploying:

```js
window.MENTAL_TRADER_CONFIG = {
  API_BASE_URL: "https://YOUR-BACKEND-HTTPS-URL",
  BOT_USERNAME: "YOUR_BOT_USERNAME"
};
```

`API_BASE_URL` must point to the HTTPS URL where the FastAPI backend is reachable.
`BOT_USERNAME` is the bot username without `@`.

**Never put secrets in this repository.** Do not place `BOT_TOKEN`, OANDA/Twelve Data keys, `BACKEND_API_KEY`, wallet private keys, seed phrases or passwords in frontend files.

## 2. Deploy to Cloudflare Pages

Create a GitHub repository containing these files and connect it to Cloudflare Pages as a static site. No Node/React build is required. After deployment you will receive an HTTPS URL such as:

```text
https://mental-trader.pages.dev
```

## 3. Configure backend CORS

On the backend set:

```env
MINIAPP_URL=https://mental-trader.pages.dev
MINIAPP_ORIGIN=https://mental-trader.pages.dev
```

Restart/redeploy the backend after changing environment variables.

## 4. Connect to Telegram

In `@BotFather` configure the bot's Main Mini App and use the Cloudflare Pages HTTPS URL. The backend also configures the chat menu button automatically when `MINIAPP_URL` is set.

## Security

The frontend sends `Telegram.WebApp.initData` in `X-Telegram-Init-Data`. The backend validates the Telegram signature using `BOT_TOKEN`, validates `auth_date`, extracts the authenticated Telegram ID, and checks the subscription in SQLite before returning price/signal data.

The browser never receives `BOT_TOKEN`, `BACKEND_API_KEY`, OANDA credentials, Twelve Data credentials or database access.
