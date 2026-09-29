// Regression test: what Ask Anchor says about materials must match the Materials card.
//
// THE BUG (owner, 2026-09-28): the card on screen said "MATERIALS TOTAL $2,529.50 — cost
// of full packs to buy", but Anchor read out "$1,966" — the quote's per-unit line items.
// Both numbers are real (the quote prices the exact quantity used; the card rounds UP to
// full cases/rolls/sticks), but "material cost" / "material breakdown" means the card.
//
// Runs the REAL pricing engine (DEFAULT CONFIG → RENDER) plus the real
// materialsNeededEntries / materialsNeededTotal / askMaterialsBrief from index.html.
//
// Run:  node tools/materials-total.test.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, "..", "index.html"), "utf8");

function sectionStart(title) {
  const at = html.indexOf("\n   " + title + "\n");
  if (at < 0) throw new Error("section not found: " + title);
  return html.lastIndexOf("/* ====", at);
}
function extractFn(name) {
  const m = new RegExp("(^|\\n)(async )?function " + name + "\\(").exec(html);
  if (!m) throw new Error("no fn " + name);
  const start = m.index + (m[1] ? 1 : 0);
  let depth = 0, i = html.indexOf("{", start);
  for (; i < html.length; i++) {
    if (html[i] === "{") depth++;
    else if (html[i] === "}" && --depth === 0) return html.slice(start, i + 1);
  }
  throw new Error("unbalanced " + name);
}
const engine = html.slice(sectionStart("DEFAULT CONFIG"), sectionStart("RENDER"));
const extras = [extractFn("askMaterialsBrief")].join("\n") + "\nconst askRound1 = n => Math.round((Number(n) || 0) * 10) / 10;";

function makeEngine() {
  const store = {};
  const noop = () => {};
  const ctx = {
    console, Math, JSON, Number, String, Array, Object, Set, Map, Date, isFinite, isNaN,
    parseFloat, parseInt, Intl, Symbol, RegExp, Error, Promise,
    localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
    sessionStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener: noop, documentElement: { getAttribute: () => null } },
    window: { track: noop, addEventListener: noop },
    navigator: {}, requestAnimationFrame: noop, setTimeout: noop, clearTimeout: noop,
    toast: noop, currentUser: null, pushProfileToCloud: noop, render: noop, confirm: () => true,
    getOrgContext: () => null, escHtml: (s) => String(s),
    updateHighRiseVisibility: noop, renderExtraFloors: noop, updateSwingStageToggleUI: noop,
  };
  ctx.window.localStorage = ctx.localStorage;
  vm.createContext(ctx);
  vm.runInContext(engine + "\n" + extras + `
    ;globalThis.__E = { get STATE(){return STATE}, set STATE(v){STATE=v}, calculate, buildState,
      materialsNeededEntries, materialsNeededTotal, materialsEntryCost, askMaterialsBrief, computeCostBasis };`, ctx, { filename: "engine.js" });
  return ctx.__E;
}

let passed = 0;
function check(name, fn) {
  try { fn(); passed++; console.log("  ok  " + name); }
  catch (e) { console.error("FAIL  " + name + "\n      " + (e && e.message)); process.exitCode = 1; }
}
function setup(E, patch = {}) {
  E.STATE = E.buildState();
  Object.assign(E.STATE, { houseType: "Block Framed", constructionType: "Remodel", impact: "Impact", totalLF: "450", windowCount: "20", stories: 2 }, patch);
}

check("the card's total is full packs × pack price, and Anchor reads the same number", () => {
  const E = makeEngine(); setup(E);
  const r = E.calculate();
  const entries = E.materialsNeededEntries(r);
  assert.ok(entries.length >= 3, "a real job has several materials");
  const byHand = entries.reduce((t, e) => {
    if (e.excluded || e.buckList || e.trimPart) return t;
    const basis = E.computeCostBasis(e.item);
    return t + (basis ? e.proc.packs * basis.perPack : 0);
  }, 0);
  const brief = E.askMaterialsBrief(r);
  assert.ok(Math.abs(brief.toBuyTotal - E.materialsNeededTotal(entries)) < 0.005, "Anchor total = card total");
  if (!entries.some(e => e.buckList || e.trimPart)) assert.ok(Math.abs(brief.toBuyTotal - byHand) < 0.005, "= packs × pack price");
  assert.equal(brief.toBuy.length, entries.length, "one line per card line");
  assert.ok(brief.toBuy.every(l => /: buy \d/.test(l) && /— \$[\d,]+\.\d\d$/.test(l)), "each line says what to buy and its cost");
});

check("the card total is NOT the quote's per-unit material cost (rounding up to full packs)", () => {
  const E = makeEngine(); setup(E);
  const r = E.calculate();
  const entries = E.materialsNeededEntries(r);
  const ids = new Set(entries.map(e => e.row.id));
  const perUnit = r.rows.filter(x => !x.isLabor && ids.has(x.id)).reduce((t, x) => t + x.totalCost, 0);
  const toBuy = E.materialsNeededTotal(entries);
  assert.ok(toBuy > perUnit, `to-buy ${toBuy} should exceed per-unit ${perUnit} (partial packs round up)`);
});

check("a crossed-off material leaves the total and is listed as removed", () => {
  const E = makeEngine(); setup(E);
  const before = E.askMaterialsBrief(E.calculate());
  const first = E.materialsNeededEntries(E.calculate())[0];
  E.STATE.excludedMaterials = [first.row.id];
  const r2 = E.calculate();
  const after = E.askMaterialsBrief(r2);
  assert.ok(after.toBuyTotal < before.toBuyTotal, "total drops");
  assert.equal(after.toBuy.length, before.toBuy.length - 1);
  assert.equal(after.removedFromQuote.length, 1);
  const card = E.materialsNeededTotal(E.materialsNeededEntries(r2));
  assert.ok(Math.abs(after.toBuyTotal - card) < 0.005, "still equals the card's total");
});

check("render() uses the shared total (so the card and Anchor can't drift)", () => {
  assert.match(html, /const materialsTotalCost = materialsNeededTotal\(matItems\);/);
  assert.match(html, /materials,\n\s+access: \{ lift, swingStageDays/, "materials is sent to the assistant");
});

console.log(process.exitCode ? "\nFAILED" : `\nall ${passed} materials-total tests passed`);
