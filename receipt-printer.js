/* Receipt-printer checkout overlay.
   Motion adapted from the dqnamo receipt-printer experiment
   (https://www.dqnamo.com/experiments/receipt-printer). */
(function () {
  "use strict";

  var STAGES = {
    processing: "Processing your order",
    printing: "Printing your receipt",
    complete: "Order complete"
  };
  var FEED_MS = 1750;
  var TOOTH_COUNT = 40;
  var TOOTH_DEPTH = 4;

  var _stage = "processing";
  var _feedTimer = 0;
  var _wired = false;
  var _clipReady = false;
  var _opts = { plan: "", billing: "", sessionId: "" };

  function prefersReducedMotion() {
    try { return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); }
    catch (_) { return false; }
  }

  function el(id) { return document.getElementById(id); }

  function receiptClipPath() {
    var pts = [];
    var n = TOOTH_COUNT * 2;
    for (var i = 0; i < n; i++) {
      var x = 100 - ((i + 1) * 100) / n;
      var y = (i % 2 === 0) ? "100%" : ("calc(100% - " + TOOTH_DEPTH + "px)");
      pts.push(x + "% " + y);
    }
    return "polygon(0 0, 100% 0, 100% calc(100% - " + TOOTH_DEPTH + "px), " + pts.join(", ") + ")";
  }

  function applyClip() {
    if (_clipReady) return;
    var paper = el("rpPaper");
    if (!paper) return;
    paper.style.clipPath = receiptClipPath();
    _clipReady = true;
  }

  function setStatus(stage) {
    var live = el("rpStatusText");
    if (live) live.textContent = STAGES[stage] || STAGES.processing;
  }

  function setPaperHidden(hidden) {
    var paper = el("rpPaper");
    if (paper) paper.setAttribute("aria-hidden", hidden ? "true" : "false");
  }

  function setStage(stage) {
    _stage = stage;
    var root = el("rpRoot");
    if (root) root.setAttribute("data-stage", stage);
    setStatus(stage);
    setPaperHidden(stage !== "complete");
    var done = el("rpDone");
    if (done) {
      if (stage === "complete") done.removeAttribute("hidden");
      else done.setAttribute("hidden", "");
    }
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function normalizePlanId(id) {
    var s = String(id || "").toLowerCase().trim();
    if (s === "shop") return "unlimited";
    return s;
  }

  function normalizeBilling(raw) {
    var s = String(raw || "").toLowerCase();
    if (/year|annual/.test(s)) return "annual";
    if (/month/.test(s)) return "monthly";
    return "";
  }

  function findPlan(planId) {
    var id = normalizePlanId(planId);
    if (!id || id === "trial" || id === "none" || id === "crew") return null;
    var list = (typeof PLANS !== "undefined" && Array.isArray(PLANS)) ? PLANS : [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].id === id) return list[i];
    }
    return null;
  }

  function currentEntitlements() {
    try {
      if (typeof getEntitlements === "function") return getEntitlements() || {};
    } catch (_) {}
    try {
      return (typeof DATA !== "undefined" && DATA && DATA.config && DATA.config.entitlements) || {};
    } catch (_) {}
    return {};
  }

  function inferBilling(ent) {
    var raw = ent && (ent.billing || ent.interval || ent.billingPeriod || ent.billing_interval || ent.priceInterval);
    var fromEnt = normalizeBilling(raw);
    if (fromEnt) return fromEnt;
    var reset = Number(ent && ent.cycleResetAt);
    if (reset) {
      var days = (reset - Date.now()) / 86400000;
      if (days > 180) return "annual";
    }
    return "monthly";
  }

  function formatLimit(n) {
    if (n === Infinity || n == null) return "Unlimited";
    return String(n);
  }

  function formatMoney(n) {
    var num = Number(n);
    if (!isFinite(num)) return "";
    return "$" + num.toFixed(2);
  }

  function formatDate(d) {
    try {
      return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    } catch (_) {
      return d.toDateString();
    }
  }

  function shortOrder(sessionId) {
    var s = String(sessionId || "").replace(/\s+/g, "");
    if (!s) return "";
    return s.length > 8 ? s.slice(-8) : s;
  }

  function absorbOpts(opts) {
    if (!opts || typeof opts !== "object") return;
    _opts = {
      plan: opts.plan ? String(opts.plan) : "",
      billing: opts.billing ? String(opts.billing) : "",
      sessionId: opts.sessionId ? String(opts.sessionId) : ""
    };
  }

  function resolveSlip() {
    var ent = currentEntitlements();
    var livePlan = findPlan(ent && ent.plan);
    var previewPlan = findPlan(_opts.plan);
    var plan = livePlan || previewPlan;
    var billing = livePlan
      ? inferBilling(ent)
      : (normalizeBilling(_opts.billing) || "monthly");
    var annual = billing === "annual";
    var total = plan ? (annual ? plan.annualPrice : plan.monthlyPrice) : "";
    return {
      plan: plan,
      annual: annual,
      total: total,
      sessionId: _opts.sessionId || "",
      date: formatDate(new Date())
    };
  }

  function barcodeSvg(seed) {
    var s = String(seed || "anchor");
    var hash = 2166136261;
    var i;
    for (i = 0; i < s.length; i++) {
      hash ^= s.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    var bars = [];
    var x = 8;
    for (i = 0; i < 56; i++) {
      hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
      var w = 1 + ((hash >>> 16) % 3);
      var on = ((hash >>> 8) & 1) || i === 0 || i === 55;
      if (on) {
        bars.push('<rect x="' + x + '" y="0" width="' + w + '" height="36" fill="#1a1a1a"/>');
      }
      x += w + 1;
    }
    var width = x + 8;
    return '<svg class="rp-barcode" viewBox="0 0 ' + width + ' 36" width="100%" height="36" aria-hidden="true" preserveAspectRatio="none">' +
      bars.join("") + "</svg>";
  }

  function rowHtml(key, value, extraClass) {
    return '<div class="rp-row' + (extraClass ? " " + extraClass : "") + '">' +
      '<span class="rp-k">' + escapeHtml(key) + "</span>" +
      '<span class="rp-lead" aria-hidden="true"></span>' +
      '<span class="rp-v">' + escapeHtml(value) + "</span>" +
      "</div>";
  }

  function logoHtml() {
    return '<img class="rp-wordmark" src="brand/anchor-wordmark-dark.png" alt="Anchor" width="140" height="28" />';
  }

  function fillScreen(info) {
    var planEl = el("rpScreenPlan");
    var periodEl = el("rpScreenPeriod");
    var totalEl = el("rpScreenTotal");
    if (info.plan) {
      if (planEl) planEl.textContent = info.plan.name + " plan";
      if (periodEl) periodEl.textContent = info.annual ? "Annual subscription" : "Monthly subscription";
      if (totalEl) totalEl.textContent = formatMoney(info.total);
    } else {
      if (planEl) planEl.textContent = "Subscription";
      if (periodEl) periodEl.textContent = "";
      if (totalEl) totalEl.textContent = "";
    }
  }

  function fillSlip() {
    var body = el("rpSlip");
    if (!body) return;
    var info = resolveSlip();
    fillScreen(info);
    var seed = info.sessionId || ((info.plan && info.plan.id) || "anchor") + "|" + info.date + "|" + info.total;
    var barcode = barcodeSvg(seed);
    var order = shortOrder(info.sessionId);

    if (!info.plan) {
      body.innerHTML =
        logoHtml() +
        '<hr class="rp-rule" />' +
        '<div class="rp-fallback">Subscription activated</div>' +
        '<hr class="rp-rule" />' +
        rowHtml("Date", info.date) +
        (order ? rowHtml("Order", order) : "") +
        '<hr class="rp-rule" />' +
        barcode;
      return;
    }

    var period = info.annual ? "Annual subscription" : "Monthly subscription";
    var money = formatMoney(info.total);
    body.innerHTML =
      logoHtml() +
      '<hr class="rp-rule" />' +
      rowHtml((info.plan.name + " plan").toUpperCase(), money) +
      '<div class="rp-sub">' + escapeHtml(period) + "</div>" +
      '<hr class="rp-rule" />' +
      rowHtml("TOTAL PAID", money, "is-total") +
      rowHtml("Quotes", formatLimit(info.plan.quoteLimit)) +
      rowHtml("Date", info.date) +
      (order ? rowHtml("Order", order) : "") +
      '<hr class="rp-rule" />' +
      barcode;
  }

  function dismiss() {
    if (_stage !== "complete") return;
    var overlay = el("receiptPrinterOverlay");
    if (!overlay) return;
    overlay.classList.remove("is-open");
    overlay.setAttribute("hidden", "");
    overlay.setAttribute("aria-hidden", "true");
    if (_feedTimer) { clearTimeout(_feedTimer); _feedTimer = 0; }
  }

  function onKey(e) {
    if (e.key === "Escape") dismiss();
  }

  function onOverlayClick(e) {
    if (e.target && e.target.getAttribute("data-rp-dismiss") !== null) dismiss();
  }

  function wire() {
    if (_wired) return;
    var overlay = el("receiptPrinterOverlay");
    if (!overlay) return;
    overlay.addEventListener("click", onOverlayClick);
    document.addEventListener("keydown", onKey);
    var done = el("rpDone");
    if (done) done.addEventListener("click", dismiss);
    var home = el("rpHome");
    if (home) home.addEventListener("click", dismiss);
    _wired = true;
  }

  function show(stage, opts) {
    var overlay = el("receiptPrinterOverlay");
    var root = el("rpRoot");
    if (!overlay || !root) return false;
    absorbOpts(opts);
    wire();
    applyClip();
    if (_feedTimer) { clearTimeout(_feedTimer); _feedTimer = 0; }
    overlay.removeAttribute("hidden");
    overlay.setAttribute("aria-hidden", "false");
    overlay.classList.add("is-open");
    fillSlip();
    setStage(stage || "processing");
    return true;
  }

  function startPrinting() {
    var overlay = el("receiptPrinterOverlay");
    if (!overlay || !overlay.classList.contains("is-open")) return false;
    fillSlip();
    if (prefersReducedMotion()) {
      setStage("complete");
      return true;
    }
    setStage("printing");
    if (_feedTimer) clearTimeout(_feedTimer);
    _feedTimer = setTimeout(function () {
      _feedTimer = 0;
      setStage("complete");
    }, FEED_MS);
    return true;
  }

  function completeFromCheckout() {
    return startPrinting();
  }

  window.showReceiptPrinter = show;
  window.setReceiptPrinterStage = function (stage) {
    if (stage === "printing") return startPrinting();
    if (stage === "complete") {
      fillSlip();
      setStage("complete");
      return true;
    }
    return show(stage || "processing");
  };
  window.completeReceiptPrinter = completeFromCheckout;
  window.dismissReceiptPrinter = dismiss;
})();
