// Regression test for the E-signatures "Send a quote" panel (index.html).
//
// THE BUG (audit 2026-09-28): after creating a signing link for Job A, picking
// Job B in the job dropdown kept the "Link created" banner — and its Copy button
// — pointing at Job A's link. Easy way to text the wrong customer the wrong price.
//
// THE GUARANTEE: changing the picked job clears the remembered link and removes
// the banner, so Copy can never hand out another job's link.
//
// Runs the REAL change-listener body from renderDashEsign in index.html.
//
// Run:  node tools/esign-job-switch.test.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, "..", "index.html"), "utf8");

const start = html.indexOf("function renderDashEsign(");
assert.ok(start >= 0, "renderDashEsign not found");
let depth = 0, i = html.indexOf("{", start);
for (; i < html.length; i++) {
  if (html[i] === "{") depth++;
  else if (html[i] === "}" && --depth === 0) break;
}
const fnBlock = html.slice(start, i + 1);
const m = fnBlock.match(/wrap\.addEventListener\("change", \(e\) => \{([\s\S]*?)\n\s{4}\}\);/);
assert.ok(m, "could not find the #dashEsignJobPick change listener");

function run({ target }) {
  const state = { lastUrl: "https://anchorquoting.com/#/sign/JOB-A", removed: 0, custom: 0 };
  const exclude = new Set(["item:Labor"]);
  const banner = { remove: () => { state.removed++; } };
  const document = { getElementById: (id) => (id === "dashEsignResult" ? banner : null) };
  const body = m[1].replace(/_dashEsignLastUrl/g, "state.lastUrl");
  new Function("e", "state", "document", "_dashEsignExclude", "_dashEsignCzOpen", "dashEsignLoadCustomize", body)(
    { target }, state, document, exclude, true, () => { state.custom++; });
  return { state, exclude };
}

let passed = 0;
function check(name, fn) {
  try { fn(); passed++; console.log("  ok  " + name); }
  catch (e) { console.error("FAIL  " + name + "\n      " + (e && e.message)); process.exitCode = 1; }
}

check("picking another job clears the previous job's link and banner", () => {
  const { state, exclude } = run({ target: { closest: (sel) => (sel === "#dashEsignJobPick" ? {} : null) } });
  assert.equal(state.lastUrl, "");
  assert.equal(state.removed, 1);
  assert.equal(exclude.size, 0);
  assert.equal(state.custom, 1);
});

check("unrelated change events leave the link alone", () => {
  const { state } = run({ target: { closest: () => null } });
  assert.equal(state.lastUrl, "https://anchorquoting.com/#/sign/JOB-A");
  assert.equal(state.removed, 0);
});

console.log(`\n${passed} checks passed`);
