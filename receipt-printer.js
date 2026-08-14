/* Receipt-printer checkout overlay.
   Motion adapted from the dqnamo receipt-printer experiment
   (https://www.dqnamo.com/experiments/receipt-printer). */
(function () {
  "use strict";

  var STAGES = { processing: "Processing your order", printing: "Printing your receipt", complete: "Subscription activated" };
  var FEED_MS = 1750;
  var TOOTH_COUNT = 40;
  var TOOTH_DEPTH = 4;

  var _stage = "processing";
  var _feedTimer = 0;
  var _wired = false;
  var _clipReady = false;

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

  function findPlan(planId) {
    if (!planId || planId === "trial" || planId === "none" || planId === "crew") return null;
    var list = (typeof PLANS !== "undefined" && Array.isArray(PLANS)) ? PLANS : [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].id === planId) return list[i];
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
    if (raw && /year|annual/i.test(String(raw))) return "annual";
    if (raw && /month/i.test(String(raw))) return "monthly";
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

  function fillSlip() {
    var body = el("rpSlip");
    if (!body) return;
    var ent = currentEntitlements();
    var planId = (ent && ent.plan) || "";
    var plan = findPlan(planId);
    if (!plan) {
      body.innerHTML =
        '<div class="rp-brand">ANCHOR</div>' +
        '<hr class="rp-rule" />' +
        '<div class="rp-plan">Subscription activated</div>' +
        '<hr class="rp-rule" />' +
        '<p class="rp-thanks"><strong>Welcome aboard.</strong>You\'re all set — thanks for choosing Anchor.</p>';
      return;
    }
    var billing = inferBilling(ent);
    var annual = billing === "annual";
    var total = annual ? plan.annualPrice : plan.monthlyPrice;
    var date = new Date().toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    body.innerHTML =
      '<img class="rp-wordmark" src="brand/anchor-wordmark-dark.png" alt="Anchor" width="140" height="28" />' +
      '<hr class="rp-rule" />' +
      '<div class="rp-plan">' + escapeHtml(plan.name) + '</div>' +
      '<div class="rp-cycle">' + (annual ? "Annual subscription" : "Monthly subscription") + '</div>' +
      '<hr class="rp-rule" />' +
      '<dl class="rp-rows">' +
        '<div class="rp-row"><dt>Total</dt><dd>$' + escapeHtml(total) + '</dd></div>' +
        '<div class="rp-row"><dt>Quote limit</dt><dd>' + escapeHtml(formatLimit(plan.quoteLimit)) + '</dd></div>' +
        '<div class="rp-row"><dt>Date</dt><dd>' + escapeHtml(date) + '</dd></div>' +
      '</dl>' +
      '<hr class="rp-rule" />' +
      '<p class="rp-thanks"><strong>Thank you.</strong>Welcome aboard — your shop is ready to quote.</p>';
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
    _wired = true;
  }

  function show(stage) {
    var overlay = el("receiptPrinterOverlay");
    var root = el("rpRoot");
    if (!overlay || !root) return false;
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
