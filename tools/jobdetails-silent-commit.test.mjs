// Regression test for `saveJobDetailsEdits(id, silent)` (index.html).
//
// THE GUARANTEE (the reason this file exists): a SILENT commit must never change a
// job's draft/final kind. Job Details opens a draft with the Draft|Final toggle
// defaulting to "Final" (so jdWantFinal() returns true). Many internal actions call
// commitOpenJobDetailsEdits(id) -> saveJobDetailsEdits(id, /*silent*/ true) BEFORE a
// photo/gallery/thumbnail save or a calc/version jump, purely to persist typed field
// edits before the drawer re-renders.
//
// If a silent commit is allowed to run the draft->final promotion, it mints a NEW job
// id, spends a quote credit (consumeQuote), and deletes the reserved draft cloud row.
// The caller (e.g. saveJobPhoto) then does loadJobs().find(x => x.id === id) with the
// OLD id, gets undefined, and silently DROPS the photo the user was uploading — while
// having burned a paid quote and finalized the draft the user never chose to finalize.
//
// So: silent  => NEVER promote/demote (persist only, keep current kind).
//     explicit => promote/demote as the toggle says.
//
// The test extracts the REAL saveJobDetailsEdits source from index.html so it can
// never silently drift from the shipped code. Pass a path as argv[2] to run it
// against an older index.html (e.g. `git show HEAD~1:index.html > /tmp/old.html`)
// to prove the pre-fix code FAILS.
//
// Run:  node tools/jobdetails-silent-commit.test.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const htmlPath = process.argv[2] || join(here, "..", "index.html");
const html = readFileSync(htmlPath, "utf8");

// Grab `function saveJobDetailsEdits(id, silent) { ... }` up to the first lone
// closing brace at column 0 (the function's end).
const m = html.match(/function saveJobDetailsEdits\(id, silent\) \{\n([\s\S]*?)\n\}/);
if (!m) throw new Error("Could not find saveJobDetailsEdits in " + htmlPath);
const body = m[1];

const FREE = [
  "loadJobs", "document", "normalizeCustomerTag", "jdWantFinal", "saveJobs",
  "STATE", "promoteDraftFromJobDetails", "renderDashboard", "renderJobDetails",
  "demoteJobToWorkingDraft", "syncJdSaveButtonLabel", "pushJobToCloud",
  "scheduleDraftCloudPush", "toast",
];

function makeFn(env) {
  const factory = new Function(...FREE, `return function saveJobDetailsEdits(id, silent) {\n${body}\n};`);
  return factory(...FREE.map(k => env[k]));
}

// A document stub: every field getElementById returns an empty-value input; the
// customerTag querySelector returns null. jdCrew/jdRecurring return null so the
// function skips those optional writes.
function makeDoc() {
  return {
    getElementById: (id) => (id === "jdCrew" || id === "jdRecurring" || id === "jdRecordKind" || id === "jdSave") ? null : { value: "" },
    querySelector: () => null,
  };
}

function baseEnv(jobs, STATE, wantFinal) {
  const calls = { promote: 0, demote: 0, pushed: 0, scheduledDraft: 0, saved: 0, rendered: 0 };
  const env = {
    loadJobs: () => jobs,
    document: makeDoc(),
    normalizeCustomerTag: (v) => v || "",
    jdWantFinal: () => wantFinal,
    saveJobs: () => { calls.saved++; return true; },
    STATE,
    promoteDraftFromJobDetails: () => { calls.promote++; return null; },
    renderDashboard: () => { calls.rendered++; },
    renderJobDetails: () => {},
    demoteJobToWorkingDraft: () => { calls.demote++; return null; },
    syncJdSaveButtonLabel: () => {},
    pushJobToCloud: () => { calls.pushed++; },
    scheduleDraftCloudPush: () => { calls.scheduledDraft++; },
    toast: () => {},
  };
  return { env, calls };
}

let passed = 0;
function check(name, fn) {
  try { fn(); passed++; console.log("  ok  " + name); }
  catch (e) { console.error("FAIL  " + name + "\n      " + (e && e.message)); process.exitCode = 1; }
}

// ── THE regression: a SILENT commit on a draft (toggle defaults to Final) must ──
// ── persist WITHOUT promoting — no new id, no quote spend, no dropped photo. ────
check("REGRESSION: silent commit on a draft never promotes (persist only)", () => {
  const jobs = [{ id: "D1", isDraft: true, name: "Smith (draft)" }];
  const STATE = { currentJobId: "D1" };
  const { env, calls } = baseEnv(jobs, STATE, /*wantFinal*/ true);
  const saveJobDetailsEdits = makeFn(env);

  saveJobDetailsEdits("D1", /*silent*/ true);

  assert.equal(calls.promote, 0, "silent commit must NOT promote the draft (would spend a quote + change id)");
  assert.equal(calls.saved >= 1, true, "field edits must still be persisted");
  assert.equal(calls.scheduledDraft, 1, "a draft must schedule its cloud push, not push as final");
  assert.equal(calls.pushed, 0, "a still-draft must not push as a final job");
  assert.equal(jobs[0].isDraft, true, "job must remain a draft");
  assert.equal(jobs[0].id, "D1", "the job id must not change out from under the caller");
});

// ── A silent commit on a FINAL job with the toggle on Draft must NOT demote. ────
check("REGRESSION: silent commit on a final job never demotes", () => {
  const jobs = [{ id: "F1", isDraft: false, name: "Jones" }];
  const STATE = { currentJobId: "F1" };
  const { env, calls } = baseEnv(jobs, STATE, /*wantFinal*/ false);
  const saveJobDetailsEdits = makeFn(env);

  saveJobDetailsEdits("F1", /*silent*/ true);

  assert.equal(calls.demote, 0, "silent commit must NOT demote a final job to draft");
  assert.equal(calls.saved >= 1, true, "field edits must still be persisted");
  assert.equal(calls.pushed, 1, "a final job persists via pushJobToCloud");
});

// ── The explicit (non-silent) Save path STILL promotes / demotes as intended. ───
check("explicit Save on a draft with Final selected DOES promote", () => {
  const jobs = [{ id: "D2", isDraft: true, name: "Doe (draft)" }];
  const STATE = { currentJobId: "D2" };
  const { env, calls } = baseEnv(jobs, STATE, /*wantFinal*/ true);
  const saveJobDetailsEdits = makeFn(env);

  saveJobDetailsEdits("D2", /*silent*/ false);

  assert.equal(calls.promote, 1, "explicit Save must promote when Final is selected");
});

check("explicit Save on a final job with Draft selected DOES demote", () => {
  const jobs = [{ id: "F2", isDraft: false, name: "Roe" }];
  const STATE = { currentJobId: "F2" };
  const { env, calls } = baseEnv(jobs, STATE, /*wantFinal*/ false);
  const saveJobDetailsEdits = makeFn(env);

  saveJobDetailsEdits("F2", /*silent*/ false);

  assert.equal(calls.demote, 1, "explicit Save must demote when Draft is selected");
});

console.log(`\n${passed} checks passed.`);
