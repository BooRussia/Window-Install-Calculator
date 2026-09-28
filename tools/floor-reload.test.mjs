// Regression test: a saved job must reopen at the SAME price.
//
// THE BUG (audit 2026-09-28): with High-rise on, Like Floors OFF and a one-off
// floor (lobby/penthouse), a saved job's totalLF/windowCount are BUILDING totals
// that already include the one-off floors. applyJobToState put that total back
// into the rail, and calculate() added the one-off floors again — so every
// save + reopen grew the quote (~33% a round: $5,134 → $6,791 → $8,448), and
// customer PDFs / e-sign links built from the saved job used the inflated price.
//
// Runs the REAL pricing engine (DEFAULT CONFIG → RENDER sections) plus the real
// applyJobToState from index.html in a sandbox.
//
// Run:  node tools/floor-reload.test.mjs
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
const helpers = ["cleanLF", "normalizeCustomerTag", "resolveMarginForJob", "resolveCrewCostForJob", "applyJobToState"].map(extractFn).join("\n\n");

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
  vm.runInContext(engine + "\n" + helpers + `
    ;globalThis.__E = { get STATE(){return STATE}, set STATE(v){STATE=v}, calculate, applyJobToState,
      floorPersistFields, buildState, normalizeSwingDoors, clone };`, ctx, { filename: "engine.js" });
  return ctx.__E;
}

// Mirror doSaveJob's job object (the fields calculate() depends on).
function saveJob(E) {
  const S = E.STATE, r = E.calculate();
  return {
    manufacturer: S.manufacturer, application: S.application, houseType: S.houseType,
    constructionType: S.constructionType, impact: S.impact, stories: S.stories, windowCount: r.wc,
    liftEnabled: S.liftEnabled, liftDays: S.liftDays, includeBucking: S.includeBucking,
    permitEnabled: S.permitEnabled, swingDoors: E.clone(E.normalizeSwingDoors(S.swingDoors)),
    slidingDoors: E.clone(S.slidingDoors || []), bifoldDoors: E.clone(S.bifoldDoors || []),
    ...E.floorPersistFields(),
    totalLF: r.lf, sellingPrice: r.sellingPrice,
  };
}
function reopen(E, job) {
  E.STATE = E.buildState();
  E.applyJobToState(job);
  return E.calculate().sellingPrice;
}
function setup(E, patch) {
  E.STATE = E.buildState();
  Object.assign(E.STATE, {
    houseType: "Block Framed", constructionType: "Remodel", impact: "Impact",
    totalLF: "100", windowCount: "6", stories: 2,
  }, patch);
}

let passed = 0;
function check(name, fn) {
  try { fn(); passed++; console.log("  ok  " + name); }
  catch (e) { console.error("FAIL  " + name + "\n      " + (e && e.message)); process.exitCode = 1; }
}
const penthouse = [{ label: "Penthouse", totalLF: "50", windowCount: "3", count: 1 }];

check("one-off floor, Like Floors off: save → reopen → reopen keeps the price", () => {
  const E = makeEngine();
  setup(E, { highRise: true, likeFloors: false, extraFloors: E.clone(penthouse) });
  const p0 = E.calculate().sellingPrice;
  const job1 = saveJob(E);
  const p1 = reopen(E, job1);
  assert.equal(E.STATE.totalLF, "100");
  assert.equal(E.STATE.windowCount, "6");
  const p2 = reopen(E, saveJob(E));
  assert.equal(p1, p0, `first reopen ${p1} vs ${p0}`);
  assert.equal(p2, p0, `second reopen ${p2} vs ${p0}`);
});

check("two lobbies (count 2) + penthouse: reopen keeps the price", () => {
  const E = makeEngine();
  setup(E, { highRise: true, likeFloors: false, extraFloors: [
    { label: "Lobby", totalLF: "40", windowCount: "2", count: 2 }, E.clone(penthouse)[0]] });
  const p0 = E.calculate().sellingPrice;
  assert.equal(reopen(E, saveJob(E)), p0);
});

check("Like Floors on (4 stories) + penthouse: reopen keeps the price", () => {
  const E = makeEngine();
  setup(E, { highRise: true, likeFloors: true, stories: 4, extraFloors: E.clone(penthouse) });
  const p0 = E.calculate().sellingPrice;
  assert.equal(reopen(E, saveJob(E)), p0);
});

check("plain job (no high-rise): reopen keeps the price", () => {
  const E = makeEngine();
  setup(E, {});
  const p0 = E.calculate().sellingPrice;
  assert.equal(reopen(E, saveJob(E)), p0);
});

check("legacy multiplied total (3 floors saved flat) + penthouse loads at its saved footage", () => {
  const E = makeEngine();
  const job = {
    manufacturer: "Viwinco", houseType: "Block Framed", constructionType: "Remodel", impact: "Impact",
    stories: 3, highRise: true, likeFloors: false, identicalFloors: 3, perFloorLF: 100, perFloorWindowCount: 6,
    extraFloors: E.clone(penthouse), totalLF: 350, windowCount: 21, swingDoors: [],
  };
  E.STATE = E.buildState();
  E.applyJobToState(job);
  assert.equal(E.STATE.totalLF, "300");   // 350 building − 50 penthouse, NOT perFloorLF 100
  assert.equal(E.STATE.windowCount, "18");
  assert.equal(E.calculate().lf, 350);
});

console.log(`\n${passed} checks passed`);
