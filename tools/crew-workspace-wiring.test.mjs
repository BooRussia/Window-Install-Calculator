// Structural wiring test for the crew-seat workspace (PR #150 "crew accounts").
//
// THE BUG THIS LOCKS IN: an invited installer is caged into #crewScreen and
// never reaches Settings → Teams. The crew workspace renders the SAME installer
// panel (renderInstallerDashboard) into #crewBody, but every interactive control
// in that panel — "Save my rates", the hourly-pay "Save", the shopping-list
// check-off, "Refresh" — is delegated to a click listener bound to #teamsBody.
// #crewScreen had no such listener, so for the only screen a crew seat can see,
// every control was a silent no-op: they could view rates but never save.
//
// This test is STRUCTURAL (the app is one big index.html with no DOM runner): it
// asserts the delegated Teams handler is shared and that the crew screen wires it.
//
// Run:  node tools/crew-workspace-wiring.test.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const file = process.argv[2] || join(here, "..", "index.html");
const html = readFileSync(file, "utf8");

// Pull a function body out of the monolith: from `function NAME(` to the first
// line that is a lone `}` at column 0 (top-level fn close).
function fnBody(name) {
  const start = html.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `could not find function ${name} in ${file}`);
  const rest = html.slice(start);
  const end = rest.search(/\n}\n/);
  assert.notEqual(end, -1, `could not find end of function ${name}`);
  return rest.slice(0, end);
}

const wireTeams = fnBody("wireTeamsSettings");
const renderCrew = fnBody("renderCrewWorkspace");

// 1. The Teams click delegation must live in a SHARED handler (not an anonymous
//    listener glued only to #teamsBody), and still be bound to #teamsBody.
assert.match(
  wireTeams,
  /_teamsClickHandler\s*=\s*\(e\)\s*=>/,
  "wireTeamsSettings must assign the click delegation to the shared _teamsClickHandler"
);
assert.match(
  wireTeams,
  /body\.addEventListener\(\s*["']click["']\s*,\s*_teamsClickHandler\s*\)/,
  "the shared handler must still be bound to #teamsBody"
);

// 2. The installer save-form lookup must be scoped to whichever surface the
//    click came from (#teamsBody OR #crewScreen), not hard-pinned to #teamsBody.
assert.match(
  wireTeams,
  /closest\(\s*["']#crewScreen,\s*#teamsBody["']\s*\)[\s\S]*?data-inst-form/,
  "the installer save handler must resolve its form within the clicked surface (crew screen included)"
);

// 3. THE FIX: the crew workspace must wire the shared Teams handler onto its own
//    screen. Without this, the crew seat's only screen is dead.
assert.match(
  renderCrew,
  /scr\.addEventListener\(\s*["']click["']\s*,[\s\S]*?_teamsClickHandler/,
  "renderCrewWorkspace must delegate #crewScreen clicks to the shared Teams handler"
);

console.log("crew-workspace-wiring: OK — crew screen is wired to the shared Teams click handler.");
