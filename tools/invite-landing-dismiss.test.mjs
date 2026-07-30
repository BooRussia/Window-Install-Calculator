// Structural test for the ?join= invite landing (PR #164 "invite-flow-fix").
//
// THE BUG THIS LOCKS IN: maybeShowInviteLanding() is the screen a LOGGED-OUT
// invitee sees when they open a live invite link. boot() shows the marketing
// landing first, then this overlays the invite card on top. The original code
// ALSO hid #landingScreen here — but nothing ever un-hid it. So every way out of
// the invite screen stranded the visitor on the bare, unauthenticated app shell
// (the calculator markup lives directly in <body>, gated only by #landingScreen):
//   1. "Just looking around" (data-invite-dismiss) hides the invite screen — and
//      #landingScreen was already hidden, so the marketing page never came back.
//   2. "Create my account" / "I already have an account" open the auth modal;
//      closeAuth() (backdrop tap / Esc / cancel) only dismisses the modal and
//      never restores #landingScreen, so cancelling auth ALSO exposed the shell.
//
// THE FIX: don't hide #landingScreen. The invite overlay is opaque and sits at a
// higher z-index (z-80 over z-75), so it fully covers the landing while shown;
// dismissing it (or cancelling auth) then reveals the normal landing underneath,
// exactly like a stranger who clicked "Log In" and backed out.
//
// This is STRUCTURAL (the app is one big index.html with no DOM runner): it
// asserts maybeShowInviteLanding() no longer hides #landingScreen, while still
// hiding the boot splash and rendering the invite landing. Pass a file path as
// argv[2] to run it against a pre-fix index.html and confirm it fails there.
//
// Run:  node tools/invite-landing-dismiss.test.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const file = process.argv[2] || join(here, "..", "index.html");
const html = readFileSync(file, "utf8");

// Pull a function body out of the monolith: from `function NAME(` to the first
// top-level `}` at column 0.
function fnBody(name) {
  const start = html.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `could not find function ${name} in ${file}`);
  const rest = html.slice(start);
  const end = rest.search(/\n}\n/);
  assert.notEqual(end, -1, `could not find end of function ${name}`);
  return rest.slice(0, end);
}

const maybeShow = fnBody("maybeShowInviteLanding");

// 1. THE FIX: it must NOT hide the marketing landing. If it does, no exit path
//    (dismiss, or cancelling the auth modal) can bring it back, and the visitor
//    is stranded on the bare app shell.
assert.doesNotMatch(
  maybeShow,
  /getElementById\(\s*["']landingScreen["']\s*\)\s*\.classList\s*\.add\(\s*["']hidden["']\s*\)/,
  "maybeShowInviteLanding() must NOT hide #landingScreen — nothing restores it, so " +
  "dismissing the invite (or cancelling auth) would expose the unauthenticated app shell"
);

// 2. It must still clear the boot splash so the invite card isn't stuck behind it.
assert.match(
  maybeShow,
  /getElementById\(\s*["']bootSplash["']\s*\)\s*\.classList\s*\.add\(\s*["']hidden["']\s*\)/,
  "maybeShowInviteLanding() must still hide #bootSplash"
);

// 3. It must still actually render the invite landing on a live code.
assert.match(
  maybeShow,
  /renderInviteLanding\(/,
  "maybeShowInviteLanding() must still render the invite landing"
);

console.log("OK: invite landing keeps the marketing page mounted underneath (3/3)");
