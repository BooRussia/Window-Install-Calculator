// Regression test for server-authoritative entitlements (index.html).
//
// THE GUARANTEES:
//  1. A local plan the server doesn't have is dropped on sync. The database
//     ignores browser-written entitlements (profiles_protect_entitlements), so a
//     local-only plan is a stale cache or a devtools edit, never a real plan.
//  2. Each new quote is counted by the server (consume_quote RPC) and the local
//     mirror takes the SERVER's numbers. A quote saved offline is remembered and
//     counted on the next successful sync, then the debt clears.
//  3. When the server says "at the cap", the remaining debt is dropped (there is
//     nothing more to count) and the local mirror shows the cap.
//
// Extracts the REAL functions from index.html so the test can't drift from the
// shipped code.
//
// Run:  node tools/server-entitlements.test.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, "..", "index.html"), "utf8");

function extract(signature) {
  const start = html.indexOf(signature);
  if (start < 0) throw new Error("Could not find " + signature);
  const open = html.indexOf("{", start + signature.length - 1);
  let depth = 0;
  for (let i = open; i < html.length; i++) {
    if (html[i] === "{") depth++;
    else if (html[i] === "}" && --depth === 0) return html.slice(start, i + 1);
  }
  throw new Error("Unbalanced " + signature);
}

const src = [
  extract("function defaultEntitlements() {"),
  extract("function adoptCloudEntitlements(localData, cloudData) {"),
  extract("function pendingQuoteConsumes() {"),
  extract("function setPendingQuoteConsumes(n) {"),
  "let _quoteFlushing = false;",
  extract("async function flushPendingQuoteConsumes() {"),
  extract("function adoptServerEntitlements(ent) {"),
].join("\n");

function makeEnv({ rpc }) {
  const store = new Map();
  const env = {
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
    LS_KEYS: { data: "wcc.data" },
    DATA: { config: {} },
    sb: { rpc },
    currentUser: { id: "u1" },
    isAdmin: () => false,
    clone: (x) => JSON.parse(JSON.stringify(x)),
    updateUsageBadge: () => {},
    updateCalcPaywall: () => {},
    planChoiceShown: 0,
  };
  env.renderPlanChoice = () => { env.planChoiceShown++; };
  const names = Object.keys(env).filter((k) => k !== "planChoiceShown");
  const api = new Function(...names,
    `const PENDING_QUOTES_KEY = "anchor.pendingQuoteConsumes";\n${src}\n` +
    "return { adoptCloudEntitlements, pendingQuoteConsumes, setPendingQuoteConsumes, flushPendingQuoteConsumes, adoptServerEntitlements, getDATA: () => DATA };"
  )(...names.map((k) => env[k]));
  return { env, api };
}

let passed = 0;
async function check(name, fn) {
  try { await fn(); passed++; console.log("  ok  " + name); }
  catch (e) { console.error("FAIL  " + name + "\n      " + (e && e.message)); process.exitCode = 1; }
}

await check("a local-only paid plan is dropped when the server has none", () => {
  const { api } = makeEnv({ rpc: async () => ({}) });
  const local = { config: { entitlements: { plan: "unlimited", subscriptionStatus: "active" } } };
  const changed = api.adoptCloudEntitlements(local, { config: { brand: {} } });
  assert.equal(changed, true);
  assert.equal(local.config.entitlements.plan, "none");
});

await check("no server plan + no local plan is a no-op", () => {
  const { api } = makeEnv({ rpc: async () => ({}) });
  const local = { config: { entitlements: { plan: "none", subscriptionStatus: "unchosen" } } };
  assert.equal(api.adoptCloudEntitlements(local, { config: {} }), false);
});

await check("the server's plan wins over a forged local plan", () => {
  const { api } = makeEnv({ rpc: async () => ({}) });
  const local = { config: { entitlements: { plan: "unlimited", cycleResetAt: 5 } } };
  api.adoptCloudEntitlements(local, { config: { entitlements: { plan: "starter", cycleResetAt: 5, quotesUsedThisCycle: 3 } } });
  assert.equal(local.config.entitlements.plan, "starter");
});

await check("each queued quote is counted once and the mirror takes the server's numbers", async () => {
  let calls = 0;
  const { api } = makeEnv({
    rpc: async (name) => {
      assert.equal(name, "consume_quote");
      calls++;
      return { data: { allowed: true, entitlements: { plan: "pro", quotesUsedThisCycle: 40 + calls } }, error: null };
    },
  });
  api.setPendingQuoteConsumes(2);
  await api.flushPendingQuoteConsumes();
  assert.equal(calls, 2);
  assert.equal(api.pendingQuoteConsumes(), 0);
  assert.equal(api.getDATA().config.entitlements.quotesUsedThisCycle, 42);
});

await check("offline: the debt survives a failed call for the next sync", async () => {
  const { api } = makeEnv({ rpc: async () => ({ data: null, error: new Error("Failed to fetch") }) });
  api.setPendingQuoteConsumes(1);
  await api.flushPendingQuoteConsumes();
  assert.equal(api.pendingQuoteConsumes(), 1);
});

await check("at the cap: remaining debt is dropped and the mirror shows the cap", async () => {
  let calls = 0;
  const { api } = makeEnv({
    rpc: async () => {
      calls++;
      return { data: { allowed: false, reason: "limit_reached", entitlements: { plan: "starter", quotesUsedThisCycle: 25 } }, error: null };
    },
  });
  api.setPendingQuoteConsumes(3);
  await api.flushPendingQuoteConsumes();
  assert.equal(calls, 1);
  assert.equal(api.pendingQuoteConsumes(), 0);
  assert.equal(api.getDATA().config.entitlements.quotesUsedThisCycle, 25);
});

await check("no plan on the server sends the user to the plan picker", async () => {
  const { env, api } = makeEnv({
    rpc: async () => ({ data: { allowed: false, reason: "no_plan", entitlements: null }, error: null }),
  });
  api.setPendingQuoteConsumes(1);
  await api.flushPendingQuoteConsumes();
  assert.equal(api.getDATA().config.entitlements.plan, "none");
  assert.equal(env.planChoiceShown, 1);
});

console.log(`\n${passed} checks passed`);
