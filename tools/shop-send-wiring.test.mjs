// Regression test for Teams T7b: the owner's "Send to crew" shopping-list button.
//
// THE BUG THIS LOCKS IN: the [data-shop-send] element is a <button>, but its
// click handler was originally wired inside shop's "change" listener. A <button>
// never fires a "change" event (only form controls do), so clicking it did
// nothing at all — no upsert, no toast, no error — and the whole owner->installer
// publish flow was dead. The handler must live in the "click" listener.
//
// This is a structural test: it isolates the click vs change listener bodies that
// wireDashboard() attaches to #dashShopping and asserts the send handler is in the
// right one. It deliberately fails on the pre-fix arrangement.
//
// Run:  node tools/shop-send-wiring.test.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, "..", "index.html"), "utf8");

let passed = 0;
function check(name, fn) {
  try { fn(); passed++; console.log("  ok  " + name); }
  catch (e) { console.error("FAIL  " + name + "\n      " + (e && e.message)); process.exitCode = 1; }
}

// The send trigger is a <button>, which is exactly why it must be on "click":
// buttons don't emit "change". Guard that assumption so the test's premise holds.
check("send trigger is a <button> (never fires 'change')", () => {
  const m = html.match(/<button[^>]*data-shop-send=/);
  assert.ok(m, "expected a <button ... data-shop-send=...> in shopJobBodyHTML");
});

// Isolate the two listener bodies wired onto #dashShopping.
const clickIdx = html.indexOf('shop.addEventListener("click"');
const changeIdx = html.indexOf('shop.addEventListener("change"');
const gridIdx = html.indexOf('const grid = document.getElementById("dashJobsGrid")', changeIdx);
assert.ok(clickIdx > 0 && changeIdx > clickIdx && gridIdx > changeIdx,
  "could not locate shop click/change listeners in wireDashboard");

const clickBody = html.slice(clickIdx, changeIdx);
const changeBody = html.slice(changeIdx, gridIdx);

check("send handler lives in the 'click' listener", () => {
  assert.ok(clickBody.includes("data-shop-send"),
    "[data-shop-send] handling not found in the click listener");
  assert.ok(clickBody.includes("publishCrewShoppingList"),
    "publishCrewShoppingList not called from the click listener");
});

check("send handler is NOT in the 'change' listener", () => {
  assert.ok(!changeBody.includes("data-shop-send"),
    "[data-shop-send] must not be handled in the change listener — a button never fires 'change'");
});

console.log(`\n${passed} checks passed${process.exitCode ? " (with failures above)" : ""}`);
