# MENTAL TRADER Mini App v6

Customer workflow is fully inside the Mini App:

1. Locked screen -> Get Access
2. Choose Monthly / Lifetime
3. Choose USDT TRC20 / BTC
4. Receive server-generated amount and public payment address
5. Pay -> I Have Paid
6. Upload image/PDF receipt (max 8 MB)
7. Waiting for administrator approval
8. Access automatically refreshes and unlocks Markets / Signal / Profile

Backend configured in `config.js`:

```js
window.MENTAL_TRADER_CONFIG = {
  API_BASE_URL: "https://bot-1789074932-1835-www2411.bothost.tech"
};
```

The header logo is embedded directly into `index.html`, so it does not depend on a separate asset request. `assets/logo.png` is still included as the source image.


## v6.1 receipt upload fix
The receipt form now includes the selected plan and payment method, and JSON API requests are serialized exactly once.

## v6.3 status and intro update

- `Check Status` now shows visible progress and the current payment state instead of failing silently.
- Approved access automatically opens Markets.
- Rejected payments immediately open the rejected-payment screen.
- A short MENTAL TRADER explanation is shown on the initial locked screen and on the Markets landing page.
