// Regression + unit tests for the interior-trim head/jamb/sill board split.
//
// These extract the REAL pure pricing helpers from index.html (the block between
// the ==TRIM-SPLIT-PURE-START/END== markers) and exercise them, so the test can
// never silently drift from the shipped math.
//
// PRIMARY GUARANTEE (the reason this file exists): an existing single-board job
// must price BYTE-IDENTICALLY when the split feature is off OR when all three
// component boards resolve to the same board as before. See `equal boards ==
// pre-split cost` below.
//
// Run:  node tools/trim-pricing.test.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, "..", "index.html"), "utf8");

const m = html.match(/\/\/ ==TRIM-SPLIT-PURE-START==[^\n]*\n([\s\S]*?)\/\/ ==TRIM-SPLIT-PURE-END==/);
if (!m) throw new Error("Could not find TRIM-SPLIT-PURE markers in index.html");
// Expose the three functions out of the extracted source.
const factory = new Function(m[1] + "\nreturn { splitTrimLF, resolveTrimBoards, splitTrimCost };");
const { splitTrimLF, resolveTrimBoards, splitTrimCost } = factory();

// Mirror of DEFAULT_DATA.config.trim.pricePerLF (incl. the new 1x10/1x12).
const GRID = {
  pine: { "1x4": 3.00, "1x6": 4.71, "1x8": 6.21, "1x10": 7.80, "1x12": 9.60 },
  mdf:  { "1x4": 2.10, "1x6": 3.30, "1x8": 4.35, "1x10": 5.40, "1x12": 6.60 },
  pvc:  { "1x4": 5.25, "1x6": 8.25, "1x8": 10.85, "1x10": 13.60, "1x12": 16.80 },
};
const rateOf = (t, w) => (GRID[t] || {})[w] ?? 3;
const SHARES = { head: 0.1875, jamb: 0.625, sill: 0.1875 }; // typical 3'w × 5'h window

let passed = 0;
const approx = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
function check(name, fn) {
  try { fn(); passed++; console.log("  ok  " + name); }
  catch (e) { console.error("FAIL  " + name + "\n      " + (e && e.message)); process.exitCode = 1; }
}

// Sample takeoffs (inches). Perimeter LF = Σ qty·2·(w+h)/12.
const jobA = [ { qty: 4, width: 36, height: 60 } ];                       // 4 windows 3'×5'
const jobB = [ { qty: 3, width: 48, height: 36 }, { qty: 2, width: 24, height: 72 } ];
const jobC = [                                                            // windows + doors mixed
  { qty: 5, width: 36, height: 48 },
  { qty: 1, width: 120, height: 96, isSlider: true },
  { qty: 1, width: 72, height: 80, isBifold: true },
];
const perimLF = (ops) => ops.filter(o => !o.isSlider && !o.isBifold)
  .reduce((s, o) => s + o.qty * 2 * (o.width + o.height) / 12, 0);
const widthLF = (ops) => ops.filter(o => !o.isSlider && !o.isBifold)
  .reduce((s, o) => s + o.qty * o.width / 12, 0);

// ── splitTrimLF: partition invariants ───────────────────────────────────────
check("openings: head+jamb+sill == window perimeter", () => {
  for (const job of [jobA, jobB, jobC]) {
    const c = splitTrimLF(job, 0, SHARES);
    assert.ok(approx(c.headLF + c.jambLF + c.sillLF, perimLF(job), 1e-9),
      `sum ${c.headLF + c.jambLF + c.sillLF} != perimeter ${perimLF(job)}`);
  }
});
check("openings: head == sill == Σ width, jamb == Σ 2·height", () => {
  const c = splitTrimLF(jobA, 0, SHARES);
  assert.ok(approx(c.headLF, widthLF(jobA)) && approx(c.sillLF, widthLF(jobA)));
  assert.ok(approx(c.jambLF, jobA.reduce((s, o) => s + o.qty * 2 * o.height / 12, 0)));
});
check("openings: sliders & bifolds excluded from trim", () => {
  const withDoors = splitTrimLF(jobC, 0, SHARES);
  const windowsOnly = splitTrimLF(jobC.filter(o => !o.isSlider && !o.isBifold), 0, SHARES);
  assert.ok(approx(withDoors.headLF, windowsOnly.headLF));
  assert.ok(approx(withDoors.jambLF, windowsOnly.jambLF));
});
check("no openings: split by shares sums to fallbackLF", () => {
  const c = splitTrimLF(null, 200, SHARES);
  assert.ok(approx(c.headLF + c.jambLF + c.sillLF, 200, 1e-9));
  assert.ok(approx(c.headLF, 200 * 0.1875) && approx(c.jambLF, 200 * 0.625));
});
check("no openings + degenerate shares: all LF → sill (never lost)", () => {
  const c = splitTrimLF([], 150, { head: 0, jamb: 0, sill: 0 });
  assert.ok(approx(c.headLF + c.jambLF + c.sillLF, 150));
  assert.ok(approx(c.sillLF, 150));
});
check("empty everything: zero, no throw", () => {
  const c = splitTrimLF([], 0, SHARES);
  assert.ok(approx(c.headLF, 0) && approx(c.jambLF, 0) && approx(c.sillLF, 0));
});

// ── resolveTrimBoards: inheritance ──────────────────────────────────────────
const baseSel = { typeId: "pine", widthId: "1x4" };
check("resolve: components inherit base when unset (head==jamb==sill==base)", () => {
  const b = resolveTrimBoards({ on: true }, baseSel);
  for (const k of ["head", "jamb", "sill"]) {
    assert.equal(b[k].type, "pine"); assert.equal(b[k].width, "1x4");
  }
});
check("resolve: only the overridden field changes; rest inherit", () => {
  const b = resolveTrimBoards({ on: true, sill: { width: "1x10" } }, baseSel);
  assert.equal(b.sill.type, "pine");  // type inherited
  assert.equal(b.sill.width, "1x10"); // width overridden
  assert.equal(b.head.width, "1x4");
  assert.equal(b.jamb.width, "1x4");
});

// ── splitTrimCost: THE regression guarantee ─────────────────────────────────
check("REGRESSION: equal boards → cost == pre-split (perimeter × base rate)", () => {
  for (const job of [jobA, jobB, jobC]) {
    const comp = splitTrimLF(job, 0, SHARES);
    const boards = resolveTrimBoards({ on: true }, baseSel);          // all inherit base
    const preSplit = perimLF(job) * rateOf("pine", "1x4");            // the OLD single-board formula
    assert.ok(approx(splitTrimCost(comp, boards, rateOf), preSplit, 1e-9),
      `split cost != pre-split for ${JSON.stringify(job)}`);
  }
});
check("REGRESSION: no-openings equal boards → cost == fallbackLF × base rate", () => {
  const comp = splitTrimLF(null, 180, SHARES);
  const boards = resolveTrimBoards({ on: true }, baseSel);
  assert.ok(approx(splitTrimCost(comp, boards, rateOf), 180 * rateOf("pine", "1x4"), 1e-9));
});
check("wider sill: cost delta == sillLF × (sillRate − baseRate)", () => {
  const comp = splitTrimLF(jobA, 0, SHARES);
  const base = resolveTrimBoards({ on: true }, baseSel);
  const wider = resolveTrimBoards({ on: true, sill: { width: "1x10" } }, baseSel);
  const baseCost = splitTrimCost(comp, base, rateOf);
  const widerCost = splitTrimCost(comp, wider, rateOf);
  const expectedDelta = comp.sillLF * (rateOf("pine", "1x10") - rateOf("pine", "1x4"));
  assert.ok(approx(widerCost - baseCost, expectedDelta, 1e-9),
    `delta ${widerCost - baseCost} != ${expectedDelta}`);
  assert.ok(widerCost > baseCost, "wider sill should cost more");
});

// ── concrete price matrix (guards against accidental formula edits) ──────────
check("price matrix: jobA exact dollars", () => {
  const comp = splitTrimLF(jobA, 0, SHARES);
  // jobA: 4× 36"w×60"h → headLF=sillLF=4·36/12=12, jambLF=4·2·60/12=40. perimeter=64 LF.
  assert.ok(approx(comp.headLF, 12) && approx(comp.sillLF, 12) && approx(comp.jambLF, 40));
  // all pine 1x4: 64 × 3.00 = 192.00
  assert.ok(approx(splitTrimCost(comp, resolveTrimBoards({ on: true }, baseSel), rateOf), 192.0));
  // pine 1x10 sill, pine 1x4 head/jamb: 12·7.80 + 40·3.00 + 12·3.00 = 93.6 + 120 + 36 = 249.6
  const b = resolveTrimBoards({ on: true, sill: { type: "pine", width: "1x10" } }, baseSel);
  assert.ok(approx(splitTrimCost(comp, b, rateOf), 249.6));
});

console.log(`\n${passed} checks passed${process.exitCode ? " (with failures above)" : ""}`);
