// Regression test for Teams T3a `setJobCrew` (index.html).
//
// THE GUARANTEE (the reason this file exists): when the job being reassigned from
// the dashboard is the one currently loaded into the calculator, setJobCrew must
// sync STATE.assignedCrewId and re-render so the live price re-prices at the new
// crew's pay. It keys off STATE.currentJobId — the canonical "loaded job" id set
// by applyJobToState. A regression that keys off a never-set property (e.g.
// STATE.loadedJobId) makes the whole "re-prices instantly" behavior dead AND
// lets a later Cmd+S (which persists STATE.assignedCrewId via floorPersistFields)
// silently revert the assignment the user just made from the job list.
//
// The test extracts the REAL setJobCrew source from index.html so it can never
// silently drift from the shipped code.
//
// Run:  node tools/set-job-crew.test.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, "..", "index.html"), "utf8");

// Grab `function setJobCrew(id, crewId) { ... }` up to the first line that is a
// lone closing brace at column 0 (the function's end).
const m = html.match(/function setJobCrew\(id, crewId\) \{\n([\s\S]*?)\n\}/);
if (!m) throw new Error("Could not find setJobCrew in index.html");
const body = m[1];

// Build an isolated copy of setJobCrew with every free identifier injected as a
// parameter, so we can observe its effects without a browser/DOM.
function makeSetJobCrew(env) {
  const factory = new Function(
    "loadJobs", "saveJobs", "pushJobToCloud", "STATE", "render", "toast", "crewLabel",
    `return function setJobCrew(id, crewId) {\n${body}\n};`
  );
  return factory(
    env.loadJobs, env.saveJobs, env.pushJobToCloud, env.STATE, env.render, env.toast, env.crewLabel
  );
}

let passed = 0;
function check(name, fn) {
  try { fn(); passed++; console.log("  ok  " + name); }
  catch (e) { console.error("FAIL  " + name + "\n      " + (e && e.message)); process.exitCode = 1; }
}

function baseEnv(jobs, STATE) {
  const saved = [];
  const pushed = [];
  let rendered = 0;
  const env = {
    STATE,
    loadJobs: () => jobs,
    saveJobs: (j) => { saved.push(j); return true; },
    pushJobToCloud: (j) => { pushed.push(j); },
    render: () => { rendered++; },
    toast: () => {},
    crewLabel: () => "Crew A",
  };
  return { env, saved, pushed, get rendered() { return rendered; } };
}

// ── THE regression: loaded job re-prices immediately ─────────────────────────
check("REGRESSION: reassigning the LOADED job syncs STATE + re-renders", () => {
  const jobs = [{ id: "J1", assignedCrewId: null }];
  const STATE = { currentJobId: "J1", assignedCrewId: null };
  const { env, pushed, saved } = baseEnv(jobs, STATE);
  let rendered = 0;
  env.render = () => { rendered++; };
  const setJobCrew = makeSetJobCrew(env);

  setJobCrew("J1", "crewA");

  assert.equal(jobs[0].assignedCrewId, "crewA", "stored row must be updated");
  assert.equal(STATE.assignedCrewId, "crewA", "loaded STATE must re-price at the new crew");
  assert.equal(rendered, 1, "loaded job must re-render so the live price updates");
  assert.equal(saved.length, 1, "must persist locally");
  assert.equal(pushed.length, 1, "must push to cloud");
});

check("unassigning the LOADED job clears STATE + re-renders", () => {
  const jobs = [{ id: "J1", assignedCrewId: "crewA" }];
  const STATE = { currentJobId: "J1", assignedCrewId: "crewA" };
  const { env } = baseEnv(jobs, STATE);
  let rendered = 0;
  env.render = () => { rendered++; };
  const setJobCrew = makeSetJobCrew(env);

  setJobCrew("J1", "");

  assert.equal(jobs[0].assignedCrewId, null);
  assert.equal(STATE.assignedCrewId, null);
  assert.equal(rendered, 1);
});

// ── a DIFFERENT job must NOT touch the loaded STATE ──────────────────────────
check("reassigning a NON-loaded job leaves STATE + render untouched", () => {
  const jobs = [{ id: "J1", assignedCrewId: null }, { id: "J2", assignedCrewId: null }];
  const STATE = { currentJobId: "J1", assignedCrewId: null };
  const { env } = baseEnv(jobs, STATE);
  let rendered = 0;
  env.render = () => { rendered++; };
  const setJobCrew = makeSetJobCrew(env);

  setJobCrew("J2", "crewB");

  assert.equal(jobs[1].assignedCrewId, "crewB", "the target row is still updated");
  assert.equal(STATE.assignedCrewId, null, "the loaded job's live price must not change");
  assert.equal(rendered, 0, "no re-render when a different job is reassigned");
});

check("no matching job is a safe no-op", () => {
  const jobs = [{ id: "J1", assignedCrewId: null }];
  const STATE = { currentJobId: "J1", assignedCrewId: null };
  const { env, saved, pushed } = baseEnv(jobs, STATE);
  const setJobCrew = makeSetJobCrew(env);

  setJobCrew("MISSING", "crewA");

  assert.equal(saved.length, 0);
  assert.equal(pushed.length, 0);
  assert.equal(STATE.assignedCrewId, null);
});

console.log(`\n${passed} checks passed${process.exitCode ? " (with failures above)" : ""}`);
