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
    paymentOptions: null,
    checkout: { plan: null, method: null, intent: null, file: null },
    screen: "boot",
    busy: false,
    paymentTimer: null,
    paymentStatusBusy: false,
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

  function haptic(type = "light") {
    try { tg?.HapticFeedback?.impactOccurred(type); } catch (_) {}
  }

  function showBack(show) {
    try {
      if (!tg?.BackButton) return;
      show ? tg.BackButton.show() : tg.BackButton.hide();
    } catch (_) {}
  }

  function clearPaymentTimer() {
    if (state.paymentTimer) {
      clearInterval(state.paymentTimer);
      state.paymentTimer = null;
    }
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

    const method = options.method || "GET";
    const headers = {
      "Accept": "application/json",
      "X-Telegram-Init-Data": tg.initData,
      ...(options.headers || {}),
    };
    let body = options.body;
    if (body && !(body instanceof FormData) && typeof body !== "string") {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(body);
    }

    const response = await fetch(`${base}${path}`, {
      method,
      headers,
      body,
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

  function renderLoading(title = "Loading") {
    clearPaymentTimer();
    main.innerHTML = `
      <section class="center-state">
        <div class="spinner" aria-hidden="true"></div>
        <h1>${esc(title)}</h1>
        <p>Securely connecting to the MENTAL TRADER backend.</p>
      </section>`;
  }

  function renderFatal(message, retry = true) {
    clearPaymentTimer();
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

  function aboutMentalTrader() {
    return `
      <section class="about-card">
        <div class="about-icon">↗</div>
        <div>
          <span class="kicker">What is MENTAL TRADER?</span>
          <h2>Smart M15 trading signals</h2>
          <p>MENTAL TRADER analyzes Forex, Metals, Crypto and Nasdaq and gives <b>BUY / SELL / WAIT</b> setups with Entry, Stop Loss, Take Profit 1, Take Profit 2 and Risk/Reward.</p>
          <small>Signals are informational. Trading involves risk and profit is not guaranteed.</small>
        </div>
      </section>`;
  }

  function renderPaywall(note = "") {
    clearPaymentTimer();
    state.screen = "paywall";
    nav.classList.add("hidden");
    showBack(false);
    main.innerHTML = `
      ${aboutMentalTrader()}
      <section class="paywall">
        <div class="lock-icon">◆</div>
        <span class="kicker">Premium Access</span>
        <h1>Unlock trading signals</h1>
        <p>Choose a plan, pay, and upload your receipt directly inside this Mini App. Access unlocks after administrator approval.</p>
        ${note ? `<div class="notice ${note.includes("not be verified") ? "error" : ""}" style="margin:16px 0 0">${esc(note)}</div>` : ""}
        <div class="plan-options">
          <div class="plan-option"><strong>Monthly</strong><span>30 days</span></div>
          <div class="plan-option"><strong>Lifetime</strong><span>Permanent</span></div>
        </div>
        <button type="button" id="getAccessBtn" class="full-btn">Get Access</button>
        <button type="button" id="refreshAccessBtn" class="retry-btn wide-btn">Refresh Access</button>
        <p class="disclaimer">Trading involves risk. Signals do not guarantee profit.</p>
      </section>`;
    document.getElementById("getAccessBtn").addEventListener("click", startCheckout);
    document.getElementById("refreshAccessBtn").addEventListener("click", bootstrap);
  }

  async function loadPaymentOptions() {
    state.paymentOptions = await api("/api/payment/options");
    return state.paymentOptions;
  }

  async function startCheckout() {
    if (state.busy) return;
    state.busy = true;
    haptic();
    renderLoading("Loading plans");
    try {
      const options = await loadPaymentOptions();
      if (options.latest_payment?.status === "pending") {
        renderPaymentPending(options.latest_payment);
        return;
      }
      state.checkout = { plan: null, method: null, intent: null, file: null };
      renderPlans();
    } catch (error) {
      renderScreenError(error.message, () => renderPaywall());
    } finally {
      state.busy = false;
    }
  }

  function renderPlans() {
    clearPaymentTimer();
    state.screen = "plans";
    nav.classList.add("hidden");
    showBack(true);
    const plans = state.paymentOptions?.plans || [];
    main.innerHTML = `
      <div class="page-head"><div><span class="kicker">Step 1 of 4</span><h1>Choose your plan</h1><p>Select the access period you want.</p></div></div>
      <section class="checkout-list">
        ${plans.map((plan) => `
          <button type="button" class="checkout-card" data-plan="${esc(plan.id)}">
            <span><strong>${esc(plan.name)}</strong><small>${esc(plan.duration)}</small></span>
            <span class="checkout-price">$${esc(Number(plan.usd).toFixed(0))}</span>
          </button>`).join("")}
      </section>
      <div class="notice" style="margin-top:14px">Payment is manually verified by the administrator before access is activated.</div>`;
    main.querySelectorAll("[data-plan]").forEach((button) => {
      button.addEventListener("click", () => {
        haptic();
        state.checkout.plan = button.dataset.plan;
        renderPaymentMethods();
      });
    });
  }

  function renderPaymentMethods() {
    clearPaymentTimer();
    state.screen = "payment-methods";
    showBack(true);
    const methods = state.paymentOptions?.methods || [];
    const plan = state.paymentOptions?.plans?.find((p) => p.id === state.checkout.plan);
    main.innerHTML = `
      <div class="page-head"><div><span class="kicker">Step 2 of 4</span><h1>Payment method</h1><p>${esc(plan?.name || "Plan")} · $${esc(Number(plan?.usd || 0).toFixed(0))}</p></div></div>
      <section class="checkout-list">
        ${methods.map((method) => `
          <button type="button" class="checkout-card" data-method="${esc(method.id)}" ${method.available ? "" : "disabled"}>
            <span><strong>${esc(method.name)}</strong><small>${esc(method.network)}</small></span>
            <span class="method-state">${method.available ? "Select ›" : "Unavailable"}</span>
          </button>`).join("")}
      </section>`;
    main.querySelectorAll("[data-method]").forEach((button) => {
      button.addEventListener("click", () => beginPayment(button.dataset.method));
    });
  }

  async function beginPayment(methodId) {
    if (state.busy) return;
    state.busy = true;
    haptic();
    renderLoading("Preparing payment");
    try {
      state.checkout.method = methodId;
      state.checkout.intent = await api("/api/payment/intent", {
        method: "POST",
        body: { plan_key: state.checkout.plan, currency: methodId },
      });
      renderPaymentDetails();
    } catch (error) {
      if (error.status === 409) {
        const status = await api("/api/payment/status").catch(() => null);
        if (status?.payment?.status === "pending") {
          renderPaymentPending(status.payment);
          return;
        }
      }
      renderScreenError(error.message, renderPaymentMethods);
    } finally {
      state.busy = false;
    }
  }

  function renderPaymentDetails() {
    clearPaymentTimer();
    state.screen = "payment-details";
    showBack(true);
    const i = state.checkout.intent;
    main.innerHTML = `
      <div class="page-head"><div><span class="kicker">Step 3 of 4</span><h1>Make payment</h1><p>Send exactly the amount below, then continue to receipt upload.</p></div></div>
      <section class="panel checkout-panel">
        <div class="payment-line"><span>Amount</span><strong>${esc(i.amount)}</strong></div>
        <div class="payment-line"><span>Network</span><strong>${esc(i.network)}</strong></div>
        <div class="address-box">
          <span>Payment address</span>
          <code id="walletAddress">${esc(i.address)}</code>
          <button type="button" id="copyAddressBtn" class="copy-btn">Copy Address</button>
        </div>
        <div class="notice warning-note">Use only the displayed network. Sending another asset or network may result in loss.</div>
      </section>
      <button type="button" id="paidBtn" class="full-btn step-btn">I Have Paid</button>`;
    document.getElementById("copyAddressBtn").addEventListener("click", copyAddress);
    document.getElementById("paidBtn").addEventListener("click", () => { haptic(); renderReceiptUpload(); });
  }

  async function copyAddress() {
    const value = state.checkout.intent?.address || "";
    if (!value) return;
    const button = document.getElementById("copyAddressBtn");
    try {
      await navigator.clipboard.writeText(value);
      if (button) button.textContent = "Copied ✓";
    } catch (_) {
      const area = document.createElement("textarea");
      area.value = value;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      try { document.execCommand("copy"); } catch (_) {}
      area.remove();
      if (button) button.textContent = "Copied ✓";
    }
    haptic();
    setTimeout(() => { if (button) button.textContent = "Copy Address"; }, 1500);
  }

  function renderReceiptUpload() {
    clearPaymentTimer();
    state.screen = "receipt-upload";
    showBack(true);
    state.checkout.file = null;
    main.innerHTML = `
      <div class="page-head"><div><span class="kicker">Step 4 of 4</span><h1>Upload receipt</h1><p>Add a screenshot, photo, or PDF showing the payment.</p></div></div>
      <section class="panel checkout-panel">
        <label class="upload-box" for="receiptInput">
          <span class="upload-icon">＋</span>
          <strong>Select payment receipt</strong>
          <small>Image or PDF · maximum 8 MB</small>
        </label>
        <input id="receiptInput" class="file-input" type="file" accept="image/*,application/pdf,.pdf" />
        <div id="fileSummary" class="file-summary hidden"></div>
        <div id="uploadNotice"></div>
      </section>
      <button type="button" id="submitReceiptBtn" class="full-btn step-btn" disabled>Submit Receipt</button>`;

    const input = document.getElementById("receiptInput");
    input.addEventListener("change", () => {
      const file = input.files?.[0] || null;
      state.checkout.file = file;
      const summary = document.getElementById("fileSummary");
      const submit = document.getElementById("submitReceiptBtn");
      if (!file) {
        summary.classList.add("hidden");
        submit.disabled = true;
        return;
      }
      if (file.size > 8 * 1024 * 1024) {
        summary.classList.remove("hidden");
        summary.innerHTML = `<strong>${esc(file.name)}</strong><span class="error-text">File is larger than 8 MB.</span>`;
        submit.disabled = true;
        return;
      }
      summary.classList.remove("hidden");
      summary.innerHTML = `<strong>${esc(file.name)}</strong><span>${esc((file.size / 1024 / 1024).toFixed(2))} MB</span>`;
      submit.disabled = false;
      haptic();
    });
    document.getElementById("submitReceiptBtn").addEventListener("click", submitReceipt);
  }

  async function submitReceipt() {
    if (state.busy || !state.checkout.file) return;
    state.busy = true;
    const button = document.getElementById("submitReceiptBtn");
    button.disabled = true;
    button.textContent = "Uploading…";
    const form = new FormData();
    // Send the validated checkout selection together with the receipt.
    // The backend can safely rebuild the payment session after a hosting restart.
    if (state.checkout.plan) form.append("plan_key", state.checkout.plan);
    if (state.checkout.method) form.append("currency", state.checkout.method);
    form.append("receipt", state.checkout.file, state.checkout.file.name);
    try {
      const result = await api("/api/payment/receipt", { method: "POST", body: form });
      haptic("medium");
      renderPaymentPending({ id: result.payment_id, status: result.status, amount: state.checkout.intent?.amount });
    } catch (error) {
      const host = document.getElementById("uploadNotice");
      if (host) host.innerHTML = `<div class="notice error" style="margin-top:14px">${esc(error.message)}</div>`;
      button.disabled = false;
      button.textContent = "Submit Receipt";
    } finally {
      state.busy = false;
    }
  }

  function renderPaymentPending(payment) {
    clearPaymentTimer();
    state.screen = "payment-pending";
    state.paymentStatusBusy = false;
    nav.classList.add("hidden");
    showBack(false);
    main.innerHTML = `
      <section class="paywall status-card">
        <div class="status-icon pending">✓</div>
        <span class="kicker">Receipt received</span>
        <h1>Waiting for approval</h1>
        <p>Your receipt has been sent to the administrator. Access will unlock after the payment is verified.</p>
        ${payment?.id ? `<div class="payment-id">Payment #${esc(payment.id)}</div>` : ""}
        <div id="paymentStatusNotice"></div>
        <button type="button" id="checkPaymentBtn" class="full-btn">Check Status</button>
        <button type="button" id="pendingRefreshBtn" class="retry-btn wide-btn">Refresh Mini App</button>
        <p class="disclaimer">Status is checked automatically every 10 seconds. You can also check it manually.</p>
      </section>`;
    document.getElementById("checkPaymentBtn").addEventListener("click", () => checkPaymentStatus(true));
    document.getElementById("pendingRefreshBtn").addEventListener("click", bootstrap);
    state.paymentTimer = setInterval(() => checkPaymentStatus(false), 10000);
  }

  function setPaymentStatusNotice(message, isError = false) {
    const host = document.getElementById("paymentStatusNotice");
    if (!host) return;
    host.innerHTML = message
      ? `<div class="notice ${isError ? "error" : ""} status-notice">${esc(message)}</div>`
      : "";
  }

  async function checkPaymentStatus(manual = false) {
    if (state.screen !== "payment-pending") return;

    const button = document.getElementById("checkPaymentBtn");
    if (state.paymentStatusBusy) {
      if (manual) setPaymentStatusNotice("Status check is already in progress.");
      return;
    }

    state.paymentStatusBusy = true;
    if (manual) {
      haptic();
      setPaymentStatusNotice("Checking payment status…");
      if (button) {
        button.disabled = true;
        button.textContent = "Checking…";
      }
    }

    try {
      const status = await api("/api/payment/status");
      state.me = status.access;
      setBadge();

      if (status.access?.active) {
        clearPaymentTimer();
        setPaymentStatusNotice("Payment approved. Unlocking access…");
        haptic("medium");
        state.markets = await api("/api/markets");
        renderMarkets();
        return;
      }

      if (status.payment?.status === "rejected") {
        clearPaymentTimer();
        haptic("medium");
        renderPaymentRejected(status.payment);
        return;
      }

      if (status.payment?.status === "approved") {
        // Defensive fallback: refresh account separately if payment is approved
        // but the combined status response was produced during a race.
        const freshMe = await api("/api/me");
        state.me = freshMe;
        setBadge();
        if (freshMe?.active) {
          clearPaymentTimer();
          state.markets = await api("/api/markets");
          renderMarkets();
          return;
        }
        if (manual) setPaymentStatusNotice("Payment is approved. Access is being activated; check again in a moment.");
        return;
      }

      if (status.payment?.status === "pending") {
        if (manual) setPaymentStatusNotice("Still waiting for administrator approval.");
        return;
      }

      if (manual) {
        setPaymentStatusNotice("No pending payment was found. Refresh the Mini App or start the payment process again.", true);
      }
    } catch (error) {
      if (manual) {
        setPaymentStatusNotice(`Could not check status: ${error.message}`, true);
        try { tg?.HapticFeedback?.notificationOccurred("error"); } catch (_) {}
      }
    } finally {
      state.paymentStatusBusy = false;
      if (button && document.body.contains(button) && state.screen === "payment-pending") {
        button.disabled = false;
        button.textContent = "Check Status";
      }
    }
  }

  function renderPaymentRejected(payment) {
    clearPaymentTimer();
    state.screen = "payment-rejected";
    nav.classList.add("hidden");
    showBack(false);
    main.innerHTML = `
      <section class="paywall status-card">
        <div class="status-icon rejected">!</div>
        <span class="kicker">Payment review</span>
        <h1>Payment not verified</h1>
        <p>The administrator could not verify this payment. Check the transaction details and submit a new payment if needed.</p>
        ${payment?.id ? `<div class="payment-id">Payment #${esc(payment.id)}</div>` : ""}
        <button type="button" id="tryAgainPaymentBtn" class="full-btn">Start Again</button>
        <button type="button" id="rejectedRefreshBtn" class="retry-btn wide-btn">Refresh Access</button>
      </section>`;
    document.getElementById("tryAgainPaymentBtn").addEventListener("click", startCheckout);
    document.getElementById("rejectedRefreshBtn").addEventListener("click", bootstrap);
  }

  function renderMarkets() {
    clearPaymentTimer();
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
      ${aboutMentalTrader()}
      <div class="page-head">
        <div><span class="kicker">M15 Analysis</span><h1>Markets</h1><p>Select a market to find a trading setup.</p></div>
      </div>
      <section class="hero-card">
        <div class="hero-row">
          <div><div class="hero-label">Access</div><div class="hero-value">${state.me?.plan === "lifetime" ? "Lifetime" : state.me?.plan === "admin" ? "Admin" : "Active"}</div></div>
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
      if (error.status === 403) return bootstrap();
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
      if (error.status === 403) return bootstrap();
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
    clearPaymentTimer();
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
    clearPaymentTimer();
    if (state.screen === "signal") return renderInstruments();
    if (state.screen === "instruments") return renderMarkets();
    if (state.screen === "receipt-upload") return renderPaymentDetails();
    if (state.screen === "payment-details") return renderPaymentMethods();
    if (state.screen === "payment-methods") return renderPlans();
    if (state.screen === "plans") return renderPaywall();
    if (state.me?.active) return renderMarkets();
    renderPaywall();
  }

  async function bootstrap() {
    clearPaymentTimer();
    state.screen = "boot";
    renderLoading("Connecting to Telegram");
    setBadge();
    showBack(false);

    if (!tg || !tg.initData) {
      renderFatal("Open this Mini App from MENTAL TRADER in Telegram.", false);
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
        const status = await api("/api/payment/status").catch(() => null);
        if (status?.payment?.status === "pending") {
          renderPaymentPending(status.payment);
          return;
        }
        if (status?.payment?.status === "rejected") {
          renderPaymentRejected(status.payment);
          return;
        }
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
