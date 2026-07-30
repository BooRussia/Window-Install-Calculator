// Regression tests for the setup-wizard crew mini-list.
//
// PRIMARY GUARANTEE (the reason this file exists): completing the onboarding
// wizard WITHOUT explicitly adding crew must NOT create a phantom crew member.
// The wizard pre-seeds one placeholder row so the step isn't a blank wall; if
// that untouched row is counted as a real installer, quotes silently flip to
// per-person "roster" mode with a single ~$33/hr person instead of falling back
// to the flat crew model (default 2 × $30 = $60/hr) — roughly halving the labor
// line on every quote. See readSetupCrewList()/setupCrewRowHTML() in index.html.
//
// These extract the REAL wizard helpers straight from index.html and run them
// against a tiny DOM shim, so the test can't drift from the shipped behavior.
//
// Run:  node tools/crew-roster.test.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, "..", "index.html"), "utf8");

// ── Brace-matched function extractor ────────────────────────────────────────
// Pulls `function <name>(...) { ... }` out of the source by counting braces.
// The targeted helpers contain no string/regex literals with stray braces
// (only balanced `${...}` inside template literals), so plain counting is safe.
function extractFn(src, name) {
  const start = src.indexOf("function " + name + "(");
  if (start < 0) throw new Error("Could not find function " + name + " in index.html");
  let depth = 0, seen = false, i = src.indexOf("{", start);
  for (; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") { depth++; seen = true; }
    else if (ch === "}") { depth--; if (seen && depth === 0) { i++; break; } }
  }
  return src.slice(start, i);
}

const NEEDED = ["newCrewMemberId", "normalizeCrewMember", "setupCrewRowHTML",
                "renderSetupCrewList", "readSetupCrewList"];
const fnSrc = NEEDED.map(n => extractFn(html, n)).join("\n\n");

// ── Minimal DOM shim ─────────────────────────────────────────────────────────
// Faithfully mirrors what the extracted helpers touch: a #setupCrewList whose
// innerHTML is (re)parsed into rows exposing the two input .value fields.
function parseRows(markup) {
  return String(markup).split('<div class="setup-crew-row"').slice(1).map(chunk => {
    const id = (chunk.match(/data-setup-crew-id="([^"]*)"/) || [])[1] || "";
    const name = (chunk.match(/setup-crew-name[\s\S]*?value="([^"]*)"/) || [])[1] || "";
    const rate = (chunk.match(/setup-crew-rate[\s\S]*?value="([^"]*)"/) || [])[1] || "";
    return {
      dataset: { setupCrewId: id },
      querySelector(sel) {
        if (sel === ".setup-crew-name") return { value: name };
        if (sel === ".setup-crew-rate") return { value: rate };
        return null;
      },
    };
  });
}

function makeEnv() {
  const list = {
    _rows: [],
    set innerHTML(m) { this._rows = parseRows(m); },
    insertAdjacentHTML(_pos, m) { this._rows = this._rows.concat(parseRows(m)); },
    querySelectorAll(sel) { return sel === ".setup-crew-row" ? this._rows : []; },
    querySelector(sel) { return sel === ".setup-crew-row" ? (this._rows[0] || null) : null; },
  };
  const document = { getElementById: id => (id === "setupCrewList" ? list : null) };
  const DATA = { config: { laborModel: { crewPayRatePerHr: 30 }, crew: { defaultWorkersCompPct: 10 } } };
  const escHtml = s => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const factory = new Function("document", "DATA", "escHtml",
    fnSrc + "\nreturn { newCrewMemberId, normalizeCrewMember, setupCrewRowHTML, renderSetupCrewList, readSetupCrewList };");
  return { api: factory(document, DATA, escHtml), list, DATA };
}

let passed = 0;
function check(name, fn) {
  try { fn(); passed++; console.log("  ok  " + name); }
  catch (e) { console.error("FAIL  " + name + "\n      " + (e && e.message)); process.exitCode = 1; }
}

// ── THE regression guard ─────────────────────────────────────────────────────
check("pristine wizard (untouched placeholder row) → no crew members", () => {
  const { api } = makeEnv();
  api.renderSetupCrewList([]);          // new user: seeds ONE placeholder row
  const members = api.readSetupCrewList();
  assert.equal(members.length, 0,
    `untouched placeholder must not count as a crew member (got ${members.length})`);
});

check("pristine placeholder renders a BLANK wage value (placeholder only)", () => {
  const { api, list } = makeEnv();
  api.renderSetupCrewList([]);
  assert.equal(list._rows.length, 1, "expected exactly one seeded row");
  assert.equal(list._rows[0].querySelector(".setup-crew-rate").value, "",
    "seeded wage must be blank so the untouched row is skipped on read");
});

// ── Intentional entries are still captured ───────────────────────────────────
check("named person with blank wage → counted, defaults to $30", () => {
  const { api, list } = makeEnv();
  list.innerHTML = api.setupCrewRowHTML({ id: "cm_a", name: "Sam", hourlyRate: null });
  const members = api.readSetupCrewList();
  assert.equal(members.length, 1);
  assert.equal(members[0].name, "Sam");
  assert.equal(members[0].hourlyRate, 30);
  assert.equal(members[0].workersCompPct, 10);   // wizard default WC
  assert.equal(members[0].active, true);
});

check("row with an explicit wage but no name → still counted", () => {
  const { api, list } = makeEnv();
  list.innerHTML = api.setupCrewRowHTML({ id: "cm_b", name: "", hourlyRate: 45 });
  const members = api.readSetupCrewList();
  assert.equal(members.length, 1, "a user-entered wage must not be discarded");
  assert.equal(members[0].hourlyRate, 45);
  assert.equal(members[0].name, "Installer");     // nameless falls back to a label
});

check("two named installers with distinct wages → both captured in order", () => {
  const { api, list } = makeEnv();
  list.innerHTML = [
    api.setupCrewRowHTML({ id: "cm_1", name: "Lead Lee", hourlyRate: 42 }),
    api.setupCrewRowHTML({ id: "cm_2", name: "Help Ray", hourlyRate: 24 }),
  ].join("");
  const members = api.readSetupCrewList();
  assert.equal(members.length, 2);
  assert.deepEqual(members.map(m => m.name), ["Lead Lee", "Help Ray"]);
  assert.deepEqual(members.map(m => m.hourlyRate), [42, 24]);
});

console.log(`\n${passed} checks passed${process.exitCode ? " (with failures above)" : ""}`);
