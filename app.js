(() => {
  "use strict";

  const cfg = window.MENTAL_TRADER_CONFIG || {};
  const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
  const main = document.getElementById("main");
  const nav = document.getElementById("bottomNav");
  const planBadge = document.getElementById("planBadge");

  const state = {
    me: null,
    markets: [],
    market: null,
    instruments: [],
    instrument: null,
    signal: null,
    screen: "boot",
    busy: false,
  };

  const marketIcons = { forex: "💱", metals: "🥇", crypto: "₿", nasdaq: "📈" };
  const marketDescriptions = {
    forex: "10 major FX pairs",
    metals: "Gold, silver & metals",
    crypto: "10 popular crypto pairs",
    nasdaq: "Nasdaq & leading stocks",
  };

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function apiBase() {
    return String(cfg.API_BASE_URL || "").replace(/\/+$/, "");
  }

  function botUsername() {
    return String(cfg.BOT_USERNAME || "").replace(/^@/, "").trim();
  }

  function haptic(type = "light") {
    try { tg?.HapticFeedback?.impactOccurred(type); } catch (_) {}
  }

  function showBack(show) {
    try {
      if (!tg?.BackButton) return;
      show ? tg.BackButton.show() : tg.BackButton.hide();
    } catch (_) {}
  }

  function setNavActive(name) {
    nav.querySelectorAll("[data-nav]").forEach((button) => {
      button.classList.toggle("active", button.dataset.nav === name);
    });
  }

  function setBadge() {
    if (!state.me) {
      planBadge.textContent = "Checking…";
      planBadge.className = "plan-badge";
      return;
    }
    if (!state.me.active) {
      planBadge.textContent = "Locked";
      planBadge.className = "plan-badge";
      return;
    }
    const label = state.me.plan === "lifetime" ? "Lifetime" : state.me.plan === "monthly" ? "Monthly" : "Admin";
    planBadge.textContent = `● ${label}`;
    planBadge.className = state.me.plan === "lifetime" ? "plan-badge gold" : "plan-badge active";
  }

  function formatDate(value) {
    if (!value) return "No expiration";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return new Intl.DateTimeFormat("en", { year: "numeric", month: "short", day: "numeric" }).format(date);
  }

  function fmt(value, digits = 5) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
    return Number(value).toFixed(Math.max(0, Math.min(8, Number(digits) || 0)));
  }

  function initials() {
    const first = state.me?.first_name || "T";
    return first.slice(0, 1).toUpperCase();
  }

  async function api(path, options = {}) {
    const base = apiBase();
    if (!base || base.includes("YOUR-BACKEND")) {
      throw new Error("Mini App API_BASE_URL is not configured in config.js.");
    }
    if (!tg?.initData) {
      throw new Error("Open this Mini App from Telegram.");
    }
    const response = await fetch(`${base}${path}`, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "X-Telegram-Init-Data": tg.initData,
        ...(options.headers || {}),
      },
      cache: "no-store",
    });
    let payload = null;
    try { payload = await response.json(); } catch (_) {}
    if (!response.ok) {
      const message = payload?.detail || `Request failed (${response.status}).`;
      const error = new Error(message);
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  function renderLoading(title = "Loading market data") {
    main.innerHTML = `
      <section class="center-state">
        <div class="spinner" aria-hidden="true"></div>
        <h1>${esc(title)}</h1>
        <p>Securely connecting to the MENTAL TRADER backend.</p>
      </section>`;
  }

  function renderFatal(message, retry = true) {
    nav.classList.add("hidden");
    showBack(false);
    main.innerHTML = `
      <section class="center-state">
        <div class="lock-icon">!</div>
        <h1>Unable to connect</h1>
        <p>${esc(message)}</p>
        ${retry ? '<button type="button" id="retryBtn" class="retry-btn">Try Again</button>' : ""}
      </section>`;
    document.getElementById("retryBtn")?.addEventListener("click", bootstrap);
  }

  function openBot() {
    const username = botUsername();
    if (!username || username.includes("YOUR_BOT")) {
      alert("Set BOT_USERNAME in config.js first.");
      return;
    }
    const url = `https://t.me/${encodeURIComponent(username)}`;
    try {
      if (tg?.openTelegramLink) tg.openTelegramLink(url);
      else window.location.href = url;
    } catch (_) {
      window.location.href = url;
    }
  }

  function renderPaywall() {
    state.screen = "paywall";
    nav.classList.add("hidden");
    showBack(false);
    main.innerHTML = `
      <section class="paywall">
        <div class="lock-icon">◆</div>
        <span class="kicker">Premium Access</span>
        <h1>Unlock trading signals</h1>
        <p>Your Telegram account does not have an active subscription. Choose a plan in the bot, submit your payment receipt, and access will unlock after admin approval.</p>
        <div class="plan-options">
          <div class="plan-option"><strong>Monthly</strong><span>30 days</span></div>
          <div class="plan-option"><strong>Lifetime</strong><span>Permanent</span></div>
        </div>
        <button type="button" id="getAccessBtn" class="full-btn">Get Access in Bot</button>
        <button type="button" id="refreshAccessBtn" class="retry-btn" style="width:100%">Refresh Access</button>
        <p class="disclaimer">Trading involves risk. Signals do not guarantee profit.</p>
      </section>`;
    document.getElementById("getAccessBtn").addEventListener("click", () => { haptic(); openBot(); });
    document.getElementById("refreshAccessBtn").addEventListener("click", () => { haptic(); bootstrap(); });
  }

  function renderMarkets() {
    state.screen = "markets";
    state.market = null;
    state.instrument = null;
    showBack(false);
    nav.classList.remove("hidden");
    setNavActive("markets");

    const cards = state.markets.map((market) => `
      <button type="button" class="market-card" data-market="${esc(market.id)}">
        <span class="market-icon">${marketIcons[market.id] || "•"}</span>
        <strong>${esc(market.title)}</strong>
        <small>${esc(marketDescriptions[market.id] || `${market.instruments} instruments`)}</small>
      </button>`).join("");

    main.innerHTML = `
      <div class="page-head">
        <div><span class="kicker">M15 Analysis</span><h1>Markets</h1><p>Select a market to find a trading setup.</p></div>
      </div>
      <section class="hero-card">
        <div class="hero-row">
          <div><div class="hero-label">Access</div><div class="hero-value">${state.me?.plan === "lifetime" ? "Lifetime" : "Active"}</div></div>
          <div class="hero-dot" aria-label="Active"></div>
        </div>
      </section>
      <section class="market-grid">${cards}</section>`;

    main.querySelectorAll("[data-market]").forEach((button) => {
      button.addEventListener("click", () => loadInstruments(button.dataset.market));
    });
  }

  async function loadInstruments(marketId) {
    if (state.busy) return;
    state.busy = true;
    haptic();
    renderLoading("Loading instruments");
    try {
      state.market = state.markets.find((m) => m.id === marketId) || { id: marketId, title: marketId };
      state.instruments = await api(`/api/instruments/${encodeURIComponent(marketId)}`);
      renderInstruments();
    } catch (error) {
      renderScreenError(error.message, renderMarkets);
    } finally {
      state.busy = false;
    }
  }

  function renderInstruments() {
    state.screen = "instruments";
    showBack(true);
    setNavActive("markets");
    const rows = state.instruments.map((item) => `
      <button type="button" class="instrument-row" data-instrument="${esc(item.id)}">
        <span class="instrument-main"><strong>${esc(item.label)}</strong><span>${esc(item.name)}</span></span>
        <span class="chevron">›</span>
      </button>`).join("");
    main.innerHTML = `
      <div class="page-head">
        <div><span class="kicker">${esc(state.market?.title || "Market")}</span><h1>Instruments</h1><p>Choose an instrument for M15 analysis.</p></div>
      </div>
      <section class="instrument-list">${rows}</section>`;
    main.querySelectorAll("[data-instrument]").forEach((button) => {
      button.addEventListener("click", () => loadSignal(button.dataset.instrument));
    });
  }

  async function loadSignal(instrumentId) {
    if (state.busy) return;
    state.busy = true;
    haptic("medium");
    state.instrument = state.instruments.find((item) => item.id === instrumentId) || { id: instrumentId };
    renderLoading("Calculating M15 signal");
    try {
      state.signal = await api(`/api/signal/${encodeURIComponent(state.market.id)}/${encodeURIComponent(instrumentId)}`);
      renderSignal();
    } catch (error) {
      renderScreenError(error.message, renderInstruments);
    } finally {
      state.busy = false;
    }
  }

  function renderSignal() {
    if (!state.signal) {
      renderEmptySignal();
      return;
    }
    state.screen = "signal";
    showBack(true);
    setNavActive("signal");
    const s = state.signal;
    const directionClass = String(s.direction || "WAIT").toLowerCase();
    const rr = s.risk_reward == null ? "—" : `1 : ${Number(s.risk_reward).toFixed(1)}`;
    const a = s.analysis || {};
    main.innerHTML = `
      <div class="page-head">
        <div><span class="kicker">Trading Signal</span><h1>${esc(s.symbol)}</h1><p>${esc(s.data_source)} · ${esc(s.timeframe)}</p></div>
      </div>
      <section class="signal-card">
        <div class="signal-top">
          <div class="signal-meta">
            <div><div class="signal-name">${esc(s.symbol)}</div><div class="signal-tf">${esc(s.timeframe)} · Score ${esc(s.score)}</div></div>
            <div class="direction ${esc(directionClass)}">${esc(s.direction)}</div>
          </div>
          <div class="current-price"><span>Current Price</span><strong id="currentPrice">${fmt(s.current_price, s.digits)}</strong><div class="cache-note">${s.cached ? "Cached M15 analysis" : "Fresh M15 analysis"}</div></div>
        </div>
        <div class="levels">
          <div class="level"><span>ENTRY</span><strong>${fmt(s.entry, s.digits)}</strong></div>
          <div class="level"><span>STOP LOSS</span><strong>${fmt(s.stop_loss, s.digits)}</strong></div>
          <div class="level"><span>TAKE PROFIT 1</span><strong>${fmt(s.take_profit_1, s.digits)}</strong></div>
          <div class="level"><span>TAKE PROFIT 2</span><strong>${fmt(s.take_profit_2, s.digits)}</strong></div>
        </div>
        <div class="rr-row"><span>Risk / Reward</span><strong>${esc(rr)}</strong></div>
      </section>
      <div class="actions">
        <button type="button" id="priceBtn" class="action-btn">Refresh Price</button>
        <button type="button" id="signalBtn" class="action-btn primary">Refresh Signal</button>
      </div>
      <div id="actionNotice"></div>
      <details class="details">
        <summary>Analysis details</summary>
        <div class="detail-grid">
          ${detail("RSI 14", a.rsi, 2)}${detail("ATR 14", a.atr, s.digits)}
          ${detail("EMA 20", a.ema20, s.digits)}${detail("EMA 50", a.ema50, s.digits)}
          ${detail("EMA 200", a.ema200, s.digits)}${detail("MACD", a.macd, Math.min(8, (s.digits || 5) + 2))}
        </div>
      </details>`;
    document.getElementById("priceBtn").addEventListener("click", refreshPrice);
    document.getElementById("signalBtn").addEventListener("click", refreshSignal);
  }

  function detail(label, value, digits) {
    return `<div class="detail-item"><span>${esc(label)}</span><strong>${fmt(value, digits)}</strong></div>`;
  }

  async function refreshPrice() {
    if (state.busy || !state.signal) return;
    state.busy = true;
    setActionBusy(true, "Refreshing price…");
    try {
      const p = await api(`/api/price/${encodeURIComponent(state.signal.market)}/${encodeURIComponent(state.signal.instrument_id)}`);
      state.signal.current_price = p.price;
      state.signal.digits = p.digits;
      document.getElementById("currentPrice").textContent = fmt(p.price, p.digits);
      showActionNotice(p.cached ? "Price loaded from short cache." : "Current price updated.");
      haptic();
    } catch (error) {
      showActionNotice(error.message, true);
    } finally {
      state.busy = false;
      setActionBusy(false);
    }
  }

  async function refreshSignal() {
    if (state.busy || !state.signal) return;
    state.busy = true;
    setActionBusy(true, "Checking latest M15 candle…");
    try {
      state.signal = await api(`/api/signal/${encodeURIComponent(state.signal.market)}/${encodeURIComponent(state.signal.instrument_id)}`);
      haptic("medium");
      renderSignal();
    } catch (error) {
      showActionNotice(error.message, true);
    } finally {
      state.busy = false;
      setActionBusy(false);
    }
  }

  function setActionBusy(busy, text = "") {
    ["priceBtn", "signalBtn"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.disabled = busy;
    });
    if (text) showActionNotice(text);
  }

  function showActionNotice(message, isError = false) {
    const host = document.getElementById("actionNotice");
    if (!host) return;
    host.innerHTML = `<div class="notice ${isError ? "error" : ""}" style="margin-top:12px">${esc(message)}</div>`;
  }

  function renderEmptySignal() {
    state.screen = "signal-empty";
    showBack(false);
    setNavActive("signal");
    main.innerHTML = `
      <section class="center-state">
        <div class="market-icon">↗</div>
        <h1>No signal selected</h1>
        <p>Open Markets and choose an instrument to calculate an M15 signal.</p>
        <button type="button" id="browseBtn" class="retry-btn">Browse Markets</button>
      </section>`;
    document.getElementById("browseBtn").addEventListener("click", renderMarkets);
  }

  function renderProfile() {
    state.screen = "profile";
    showBack(false);
    setNavActive("profile");
    const plan = state.me?.plan === "lifetime" ? "Lifetime" : state.me?.plan === "monthly" ? "Monthly" : state.me?.plan === "admin" ? "Admin" : "Inactive";
    const username = state.me?.username ? `@${state.me.username}` : "Telegram account";
    main.innerHTML = `
      <div class="page-head"><div><span class="kicker">Account</span><h1>Profile</h1><p>Your Telegram access status.</p></div></div>
      <section class="panel profile-card">
        <div class="profile-user"><div class="avatar">${esc(initials())}</div><div><h2>${esc(state.me?.first_name || "Telegram User")}</h2><p>${esc(username)}</p></div></div>
        <div class="profile-lines">
          <div class="profile-line"><span>Plan</span><strong>${esc(plan)}</strong></div>
          <div class="profile-line"><span>Status</span><strong>${state.me?.active ? "Active" : "Inactive"}</strong></div>
          <div class="profile-line"><span>Expires</span><strong>${esc(formatDate(state.me?.expires_at))}</strong></div>
          <div class="profile-line"><span>Telegram ID</span><strong>${esc(state.me?.telegram_id)}</strong></div>
        </div>
      </section>
      <div class="notice" style="margin-top:14px">Trading involves risk. MENTAL TRADER signals are informational and do not guarantee profit.</div>`;
  }

  function renderScreenError(message, backFn) {
    showBack(true);
    main.innerHTML = `
      <section class="center-state">
        <div class="lock-icon">!</div>
        <h1>Something went wrong</h1>
        <p>${esc(message)}</p>
        <button type="button" id="screenBackBtn" class="retry-btn">Go Back</button>
      </section>`;
    document.getElementById("screenBackBtn").addEventListener("click", backFn);
  }

  function goBack() {
    if (state.screen === "signal") return renderInstruments();
    if (state.screen === "instruments") return renderMarkets();
    renderMarkets();
  }

  async function bootstrap() {
    state.screen = "boot";
    renderLoading("Connecting to Telegram");
    setBadge();
    showBack(false);

    if (!tg || !tg.initData) {
      renderFatal("Open this Mini App from the MENTAL TRADER bot in Telegram.", false);
      return;
    }
    try {
      tg.ready();
      tg.expand();
      try { tg.setHeaderColor("secondary_bg_color"); } catch (_) {}
      try { tg.setBottomBarColor("bg_color"); } catch (_) {}

      state.me = await api("/api/me");
      setBadge();
      if (!state.me.active) {
        renderPaywall();
        return;
      }
      state.markets = await api("/api/markets");
      renderMarkets();
    } catch (error) {
      renderFatal(error.message, true);
    }
  }

  nav.querySelectorAll("[data-nav]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!state.me?.active) return renderPaywall();
      haptic();
      if (button.dataset.nav === "markets") renderMarkets();
      else if (button.dataset.nav === "signal") state.signal ? renderSignal() : renderEmptySignal();
      else if (button.dataset.nav === "profile") renderProfile();
    });
  });

  try { tg?.BackButton?.onClick(goBack); } catch (_) {}
  bootstrap();
})();
