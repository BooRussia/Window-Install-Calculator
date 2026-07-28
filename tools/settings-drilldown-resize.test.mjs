// Regression test for the Settings drill-down (iOS-style layered menus, PR #154).
//
// BUG: the window "resize" listener re-synced the drill-down level on EVERY
// resize, not only when the 860px breakpoint was actually crossed. On narrow
// screens the soft keyboard (this app sets interactive-widget=resizes-content,
// so focusing a field resizes the layout viewport and fires "resize"), the
// mobile URL bar collapsing on scroll, and a portrait↔landscape rotate that
// stays below 860px all fire "resize" without changing the narrow/wide state.
// Each one forced the level back to 2 for Setup/Rates/Account, and set-l2 hides
// the open section's content — so focusing any field on those three tabs bounced
// the user out of the field they were trying to edit, making the primary
// editable settings effectively uneditable on phones.
//
// FIX: only re-sync when settingsIsNarrow() actually flips (a real breakpoint
// crossing). This test extracts the SHIPPED resize handler out of index.html and
// exercises it, so it can't drift from the code.
//
// Run:  node tools/settings-drilldown-resize.test.mjs [path-to-index.html]
//   Pass a path (e.g. from `git show HEAD:index.html`) to run against another
//   revision — used to prove this test FAILS on the pre-fix code.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const file = process.argv[2] || join(here, "..", "index.html");
const html = readFileSync(file, "utf8");

// Pull the resize handler that drives the settings drill-down (the one whose
// body references settingsIsNarrow — there are several resize listeners). Brace-
// match rather than a lazy regex so a nested `{}` can't truncate/over-run it.
function extractHandler() {
  const anchor = 'window.addEventListener("resize", () => {';
  let from = 0, start;
  while ((start = html.indexOf(anchor, from)) !== -1) {
    from = start + anchor.length;
    let depth = 1, i = from;
    for (; i < html.length && depth > 0; i++) {
      const ch = html[i];
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
    }
    const inner = html.slice(from, i - 1);
    if (/settingsIsNarrow/.test(inner) && /setSettingsLevel/.test(inner)) return inner;
  }
  return null;
}
const body = extractHandler();
if (!body) throw new Error("Could not find the settings drill-down resize handler");

// Build a runnable copy of the handler with the module-scope free identifiers it
// touches injected as closure state / stubs. `_setWasNarrow` is declared here so
// its cross-call assignment (the fix) persists exactly like the real closure var.
function makeHandler({ narrowSeq, initWasNarrow }) {
  const calls = [];
  const doc = {
    getElementById: () => ({ classList: { contains: () => false } }),
    querySelector: () => ({ dataset: { tab: "setup" } }),  // Setup: a tab WITH leaves
  };
  let idx = 0;
  const settingsIsNarrow = () => narrowSeq[Math.min(idx, narrowSeq.length - 1)];
  const setSettingsLevel = (n) => calls.push(n);
  const SETTINGS_TABS_WITH_LEAVES = ["setup", "rates", "account"];
  const factory = new Function(
    "document", "settingsIsNarrow", "setSettingsLevel", "SETTINGS_TABS_WITH_LEAVES", "_initWasNarrow",
    `let _setWasNarrow = _initWasNarrow;\nreturn function(){${body}\n};`
  );
  const fn = factory(doc, settingsIsNarrow, setSettingsLevel, SETTINGS_TABS_WITH_LEAVES, initWasNarrow);
  return { fire() { fn(); idx++; }, calls };
}

let passed = 0;
function check(name, fn) {
  try { fn(); passed++; console.log("  ok  " + name); }
  catch (e) { console.error("FAIL  " + name + "\n      " + (e && e.message)); process.exitCode = 1; }
}

// THE bug: settings open on a phone (narrow), user is in a section. A resize with
// the narrow state UNCHANGED (keyboard / URL bar / same-class rotate) must NOT
// re-sync the level — otherwise the open section collapses and the field vanishes.
check("same-state resize on a phone does not reset the level", () => {
  const h = makeHandler({ narrowSeq: [true, true, true], initWasNarrow: true });
  h.fire();  // keyboard opens
  h.fire();  // keyboard closes
  h.fire();  // URL bar collapses on scroll
  assert.equal(h.calls.length, 0,
    `expected no setSettingsLevel() on same-state resizes, got calls: [${h.calls}]`);
});

// The intended behavior must still work: a real narrow↔wide crossing re-syncs.
check("crossing to wide re-syncs to level 1", () => {
  const h = makeHandler({ narrowSeq: [false], initWasNarrow: true });
  h.fire();
  assert.deepEqual(h.calls, [1], `expected [1] on narrow→wide, got [${h.calls}]`);
});

check("crossing back to narrow re-syncs to the section list (level 2 for Setup)", () => {
  const h = makeHandler({ narrowSeq: [true], initWasNarrow: false });
  h.fire();
  assert.deepEqual(h.calls, [2], `expected [2] on wide→narrow for a tab with leaves, got [${h.calls}]`);
});

console.log(`\n${passed} checks passed${process.exitCode ? " (with failures above)" : ""}`);
